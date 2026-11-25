// What each AI model costs, and the sum that turns the token counts of one
// call into dollars. The cost log (`ai_calls`) saves the result with the call,
// so a row keeps what the call cost on its day, also after a price changes.
//
// A model that is not in this list cannot be used: the settings check refuses
// it (see settings.ts), so a cost is never unknown.

/** Prices in US dollars per one million tokens. */
export type ModelPrice = {
  /** Which AI company runs the model. Saved with every call. */
  provider: "openai";
  /** Tokens we send that the provider has not seen just before. */
  input: number;
  /** Tokens we send that the provider reads from its cache. Much cheaper. */
  cachedInput: number;
  /** Tokens we send that the provider puts into its cache. A little dearer. */
  cacheWrite: number;
  /** Tokens that come back. Thinking is billed here too. */
  output: number;
  /**
   * Some models charge more for a very long prompt: above `overInputTokens`
   * the whole call costs `inputTimes` on the input side and `outputTimes` on
   * the output side.
   */
  longPrompt?: { overInputTokens: number; inputTimes: number; outputTimes: number };
};

/**
 * Read on 2026-11-25 from OpenAI's price list
 * (developers.openai.com/api/docs/pricing and the model's own page).
 */
export const MODEL_PRICES = {
  "gpt-6-luna": {
    provider: "openai",
    input: 0.1,
    cachedInput: 0.01,
    cacheWrite: 0.125,
    output: 0.5,
    longPrompt: { overInputTokens: 272_000, inputTimes: 2, outputTimes: 1.5 },
  },
} as const satisfies Record<string, ModelPrice>;

export type AiModel = keyof typeof MODEL_PRICES;

/** Every model that has a price, for the settings check and its message. */
export const KNOWN_MODELS = Object.keys(MODEL_PRICES) as [AiModel, ...AiModel[]];

/** The token counts of one call, as the cost log keeps them. */
export type TokenCounts = {
  /** Everything we sent. */
  inputTokens: number;
  /** The part of `inputTokens` read from the provider's cache. */
  cachedInputTokens: number;
  /** The part of `inputTokens` written into the provider's cache. Not saved, only priced. */
  cacheWriteTokens: number;
  /** Everything that came back, thinking included. */
  outputTokens: number;
  /** The part of `outputTokens` that was thinking. Already paid inside `outputTokens`. */
  thinkingTokens: number;
};

export const NO_TOKENS: TokenCounts = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
};

const PER_MILLION = 1_000_000;

/**
 * The cost of one call in US dollars, rounded to a millionth of a dollar
 * (the cost log keeps six decimals).
 *
 * Example with gpt-6-luna: 4,000 tokens in, of which 1,000 from the cache,
 * and 1,500 out: 3,000 x 0.10 + 1,000 x 0.01 + 1,500 x 0.50, per million,
 * is 0.00106 dollars.
 */
export function costUsd(model: AiModel, tokens: TokenCounts): number {
  const price: ModelPrice = MODEL_PRICES[model];
  const freshInput = Math.max(0, tokens.inputTokens - tokens.cachedInputTokens - tokens.cacheWriteTokens);

  let inputSide =
    freshInput * price.input + tokens.cachedInputTokens * price.cachedInput + tokens.cacheWriteTokens * price.cacheWrite;
  let outputSide = tokens.outputTokens * price.output;

  if (price.longPrompt && tokens.inputTokens > price.longPrompt.overInputTokens) {
    inputSide *= price.longPrompt.inputTimes;
    outputSide *= price.longPrompt.outputTimes;
  }
  return Math.round(inputSide + outputSide) / PER_MILLION;
}
