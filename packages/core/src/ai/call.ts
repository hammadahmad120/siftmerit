// The one door to the AI model. Every AI call of the product goes through
// `call` below, so the rules for AI calls are kept in one place:
//
//   - the model and its thinking level come from the settings, by purpose
//   - text from outside is handed over as data, never as instructions
//   - the provider is told not to keep the call (`store: false`)
//   - the answer has a fixed form, and code checks it before it is passed on
//   - every call is written to the cost log, also one that failed
//   - log lines hold IDs and numbers only, never the text
//
// Not here yet, on purpose: hiding names and contact details before the call
// (task 28), and trying again when the provider says "slow down" together
// with the limit on calls side by side (task 30). Until then a call is tried
// once, and a second try is the work item's own retry.

import { createOpenAI, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APICallError, generateText, NoObjectGeneratedError, Output, type LanguageModelUsage } from "ai";
import type { z } from "zod";
import { AiCallRepository, type AiCallErrorCode, type AiCallResult } from "../ai-calls.repository.js";
import type { Logger } from "../logger.js";
import { buildDataBlocks, type OutsideText } from "./data-block.js";
import { costUsd, MODEL_PRICES, NO_TOKENS, type TokenCounts } from "./prices.js";
import { aiChoiceFor, type AiEnv, type AiPurpose } from "./settings.js";

/** A guard against a runaway bill: the longest answer a call may give, unless the caller says otherwise. */
const DEFAULT_MAX_OUTPUT_TOKENS = 4_000;

export type AiCallInput<Answer> = {
  /** What the call is for. It picks the model and is saved in the cost log. */
  purpose: AiPurpose;
  /** The company that pays. From the sign-in check or a checked work item, never from a request. */
  tenantId: string;
  /** The job the call is for, when there is one. */
  jobId?: string | null;
  /** The ID of the request or the work item, so the call can be found in the logs. */
  traceId: string;
  /** Our own words to the model: what to do and how. Never holds outside text. */
  instructions: string;
  /** Every text that comes from outside: a CV, an email, a job description. */
  data: OutsideText[];
  /** The form of the answer. `name` is a short word for it, such as "cv_read". */
  answer: { name: string; schema: z.ZodType<Answer> };
  /**
   * The check by code, run after the form is right. It gives back the answer
   * (as it is, or cleaned) to accept it, or `null` to refuse it.
   * Example: "is every proof line really a line of the CV?"
   */
  check?: (answer: Answer) => Answer | null;
  /** The longest answer allowed, in tokens. */
  maxOutputTokens?: number;
};

/**
 * A call that did not end with a checked answer.
 *
 * `result` says whether an answer came back at all, and `code` is the short
 * fixed word that is also in the cost log. The message is our own wording and
 * holds no text from the call. `cause` is the library's error, for a
 * developer's eyes only: it can repeat what we sent, so it is never logged.
 */
export class AiCallError extends Error {
  constructor(
    public readonly result: Exclude<AiCallResult, "ok">,
    public readonly code: AiCallErrorCode,
    cause?: unknown,
  ) {
    super(`The AI call ended with "${code}"`, { cause });
    this.name = "AiCallError";
  }
}

/** The library's token counts, as the cost log keeps them. A missing count is 0. */
function tokensOf(usage: LanguageModelUsage | undefined): TokenCounts {
  if (!usage) return NO_TOKENS;
  return {
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    thinkingTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
  };
}

/** Turns whatever the library threw into our own error and the tokens that were used. */
function readFailure(error: unknown): { failure: AiCallError; tokens: TokenCounts } {
  // An answer came back, and it is not the form we asked for.
  if (NoObjectGeneratedError.isInstance(error)) {
    let code: AiCallErrorCode = "bad_form";
    if (error.finishReason === "length") code = "cut_off";
    if (error.finishReason === "content-filter") code = "refused";
    return { failure: new AiCallError("wrong_answer", code, error), tokens: tokensOf(error.usage) };
  }

  let code: AiCallErrorCode = "provider_error";
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    code = "timeout";
  } else if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) code = "rate_limited";
    if (error.statusCode === 401 || error.statusCode === 403) code = "bad_key";
  }
  return { failure: new AiCallError("failed", code, error), tokens: NO_TOKENS };
}

/**
 * Builds the caller. The API and the worker each build one at start and hand
 * it to whatever makes AI calls.
 */
export function createAiCaller(deps: { db: SupabaseClient; env: AiEnv; logger: Logger }) {
  const openai = createOpenAI({ apiKey: deps.env.OPENAI_API_KEY });
  const costLog = new AiCallRepository(deps.db);

  /**
   * Makes one AI call and gives back the checked answer, or throws an
   * `AiCallError`. Either way the call is in the cost log afterwards.
   */
  async function call<Answer>(input: AiCallInput<Answer>): Promise<Answer> {
    const { model, thinking } = aiChoiceFor(deps.env, input.purpose);
    const blocks = buildDataBlocks(input.data);
    const startedAt = Date.now();

    let answer: Answer | null = null;
    let failure: AiCallError | null = null;
    let tokens: TokenCounts = NO_TOKENS;

    try {
      const reply = await generateText({
        model: openai(model),
        // Our words first, then the rule that outside text is only data.
        instructions: `${input.instructions}\n\n${blocks.rule}`,
        prompt: blocks.text,
        output: Output.object({ schema: input.answer.schema, name: input.answer.name }),
        maxOutputTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        // A silent second try would cost money that nobody sees (see the top of this file).
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(deps.env.AI_TIMEOUT_MS),
        providerOptions: {
          openai: {
            // Never left out: without it OpenAI saves the text we sent and
            // the answer in our account until somebody deletes them.
            store: false,
            // Never left out: OpenAI's own default is "medium", which costs more.
            reasoningEffort: thinking,
          } satisfies OpenAILanguageModelResponsesOptions,
        },
      });
      tokens = tokensOf(reply.usage);

      // The form is right here: the library checked it against the schema.
      // Now the caller's own check by code.
      const checked = input.check ? input.check(reply.output) : reply.output;
      if (checked === null) failure = new AiCallError("wrong_answer", "check_failed");
      else answer = checked;
    } catch (error) {
      ({ failure, tokens } = readFailure(error));
    }

    const facts = {
      traceId: input.traceId,
      tenantId: input.tenantId,
      jobId: input.jobId ?? null,
      purpose: input.purpose,
      model,
      thinking,
      result: (failure ? failure.result : "ok") as AiCallResult,
      error: failure ? failure.code : null,
      inputTokens: tokens.inputTokens,
      cachedInputTokens: tokens.cachedInputTokens,
      outputTokens: tokens.outputTokens,
      thinkingTokens: tokens.thinkingTokens,
      costUsd: costUsd(model, tokens),
      durationMs: Date.now() - startedAt,
    };

    try {
      await costLog.insert(input.tenantId, {
        jobId: facts.jobId,
        purpose: facts.purpose,
        provider: MODEL_PRICES[model].provider,
        model,
        thinking,
        inputTokens: facts.inputTokens,
        cachedInputTokens: facts.cachedInputTokens,
        outputTokens: facts.outputTokens,
        thinkingTokens: facts.thinkingTokens,
        costUsd: facts.costUsd,
        result: facts.result,
        error: facts.error,
        durationMs: facts.durationMs,
        traceId: facts.traceId,
      });
    } catch (error) {
      // The call is already paid for, so the answer is still passed on. The
      // numbers are in this line, from which the missing row can be rebuilt.
      deps.logger.error("ai call: the cost log row was not saved", {
        ...facts,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }

    if (failure) {
      deps.logger.warn("ai call did not give a checked answer", facts);
      throw failure;
    }
    deps.logger.info("ai call", facts);
    return answer as Answer;
  }

  return { call };
}

export type AiCaller = ReturnType<typeof createAiCaller>;
