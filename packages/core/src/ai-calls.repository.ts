import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiPurpose, AiThinking } from "./ai/settings.js";
import { toDatabaseError } from "./database.js";
import { forTenant } from "./tenant-db.js";

/**
 * How a call ended.
 *
 *   ok            an answer came back and passed both checks
 *   wrong_answer  an answer came back and was refused
 *   failed        no answer came back
 *
 * All three cost money, or can, so all three are written to the cost log.
 */
export type AiCallResult = "ok" | "wrong_answer" | "failed";

/**
 * Why a call did not end with `ok`, as a short fixed word. Never the
 * provider's own message, which could repeat the text we sent. The full error
 * goes to the logs.
 */
export type AiCallErrorCode =
  // --- result "failed": no answer came back ---
  /** The call took longer than `AI_TIMEOUT_MS`. */
  | "timeout"
  /** The provider said "slow down" (HTTP 429). */
  | "rate_limited"
  /** The provider refused our key, or the key may not use this model. */
  | "bad_key"
  /** Any other trouble on the way: the network, or an error at the provider. */
  | "provider_error"
  // --- result "wrong_answer": an answer came back and was refused ---
  /** The answer does not have the form we asked for. */
  | "bad_form"
  /** The answer was cut off at the cap on its length. */
  | "cut_off"
  /** The model refused to answer. */
  | "refused"
  /** The form was right, and the caller's own check by code said no. */
  | "check_failed";

/** What the wrapper hands over for one call. The company comes separately. */
export type NewAiCall = {
  jobId: string | null;
  purpose: AiPurpose;
  provider: string;
  model: string;
  thinking: AiThinking;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  result: AiCallResult;
  error: AiCallErrorCode | null;
  durationMs: number;
  /** The ID of the request or the work item, to find the call in the logs. */
  traceId: string | null;
};

export type AiCallRow = {
  id: string;
  tenant_id: string;
  job_id: string | null;
  purpose: AiPurpose;
  provider: string;
  model: string;
  thinking: AiThinking;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  /** Dollars. The database gives it back as a number with six decimals. */
  cost_usd: number;
  result: AiCallResult;
  error: AiCallErrorCode | null;
  duration_ms: number;
  trace_id: string | null;
  created_at: string;
};

const COLUMNS =
  "id, tenant_id, job_id, purpose, provider, model, thinking, input_tokens, cached_input_tokens, " +
  "output_tokens, thinking_tokens, cost_usd, result, error, duration_ms, trace_id, created_at";

/**
 * The cost log: one row per AI call, written once and never changed. The
 * server has no right to update or delete a row (see the SQL file).
 *
 * It keeps numbers and IDs only. No instructions, no CV text and no answer
 * are stored here.
 *
 * Company separation: every function takes the company's ID first and reaches
 * the table only through `forTenant`, which adds the company filter itself.
 */
export class AiCallRepository {
  constructor(private readonly db: SupabaseClient) {}

  /** Adds the row of one call. */
  async insert(tenantId: string, call: NewAiCall): Promise<AiCallRow> {
    const { data, error } = await forTenant(this.db, tenantId)
      .insert("ai_calls", {
        job_id: call.jobId,
        purpose: call.purpose,
        provider: call.provider,
        model: call.model,
        thinking: call.thinking,
        input_tokens: call.inputTokens,
        cached_input_tokens: call.cachedInputTokens,
        output_tokens: call.outputTokens,
        thinking_tokens: call.thinkingTokens,
        cost_usd: call.costUsd,
        result: call.result,
        error: call.error,
        duration_ms: call.durationMs,
        trace_id: call.traceId,
      })
      .select(COLUMNS)
      .single();

    if (error) throw toDatabaseError("ai_calls insert", error);
    return data as unknown as AiCallRow;
  }

  /** The company's newest calls, newest first. */
  async listNewest(tenantId: string, limit: number): Promise<AiCallRow[]> {
    const { data, error } = await forTenant(this.db, tenantId)
      .select("ai_calls", COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw toDatabaseError("ai_calls list newest", error);
    return (data ?? []) as unknown as AiCallRow[];
  }
}
