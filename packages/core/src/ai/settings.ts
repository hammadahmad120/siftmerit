// The settings of the AI calls. A part of the product adds them to its own
// settings when it first makes an AI call:
//
//   sharedEnvSchema.extend({ ...databaseEnvShape, ...aiEnvShape })
//
// Until task 14 only the check command (`npm run ai:check`) does, so the API
// and the worker still start without an OpenAI key.

import { z } from "zod";
import { KNOWN_MODELS, type AiModel } from "./prices.js";

/**
 * How much a model thinks before it answers. Thinking is billed as output
 * tokens, so "none" is the cheapest. These are OpenAI's own words.
 */
export const AI_THINKING_LEVELS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
export type AiThinking = (typeof AI_THINKING_LEVELS)[number];

/**
 * What an AI call is for. Each purpose has its own model and thinking level,
 * and the purpose is saved with every call in the cost log. A new kind of AI
 * call adds its name here.
 */
export type AiPurpose =
  /** Turn a job description into requirements. */
  | "requirements"
  /** Read one CV: the fact sheet and the ticks. */
  | "cv_read"
  /** The test call of `npm run ai:check`. Uses the CV-reading model. */
  | "check";

const KEY_HELP = "Create one at platform.openai.com, under API keys.";
const MODEL_HELP = `must be a model with a price in packages/core/src/ai/prices.ts. Known: ${KNOWN_MODELS.join(", ")}.`;
const THINKING_HELP = `must be one of: ${AI_THINKING_LEVELS.join(", ")}.`;

const model = () => z.enum(KNOWN_MODELS, { error: MODEL_HELP }).default("gpt-6-luna");
const thinking = () => z.enum(AI_THINKING_LEVELS, { error: THINKING_HELP }).default("none");

export const aiEnvShape = {
  // A secret. Whoever holds it can spend our money at OpenAI.
  OPENAI_API_KEY: z.string({ error: `is missing. ${KEY_HELP}` }).min(1, `is empty. ${KEY_HELP}`),
  AI_MODEL_REQUIREMENTS: model(),
  AI_MODEL_CV_READ: model(),
  AI_THINKING_REQUIREMENTS: thinking(),
  AI_THINKING_CV_READ: thinking(),
  // How long one call may take before it is given up, in milliseconds.
  AI_TIMEOUT_MS: z.coerce
    .number({ error: "must be a number of milliseconds." })
    .int()
    .min(1_000, "must be at least 1000 (one second).")
    .max(600_000, "must be at most 600000 (ten minutes).")
    .default(60_000),
};

export type AiEnv = {
  OPENAI_API_KEY: string;
  AI_MODEL_REQUIREMENTS: AiModel;
  AI_MODEL_CV_READ: AiModel;
  AI_THINKING_REQUIREMENTS: AiThinking;
  AI_THINKING_CV_READ: AiThinking;
  AI_TIMEOUT_MS: number;
};

/** The model and the thinking level of one purpose. */
export function aiChoiceFor(env: AiEnv, purpose: AiPurpose): { model: AiModel; thinking: AiThinking } {
  if (purpose === "requirements") {
    return { model: env.AI_MODEL_REQUIREMENTS, thinking: env.AI_THINKING_REQUIREMENTS };
  }
  return { model: env.AI_MODEL_CV_READ, thinking: env.AI_THINKING_CV_READ };
}
