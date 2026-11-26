import { aiEnvShape, databaseEnvShape, loadSettings, sharedEnvSchema } from "@siftmerit/core";
import { z } from "zod";

// The shared settings (NODE_ENV, LOG_LEVEL, REDIS_URL) come from core. The
// worker adds two groups, and does not start without either:
//
// - the two database settings: it updates the status of every run in
//   Postgres;
// - the AI settings: it makes the AI calls, the first being the requirements
//   draft. Of these only `OPENAI_API_KEY` has no default.
//
// A setting is added here by the task that first uses it.
const envSchema = sharedEnvSchema.extend({
  ...databaseEnvShape,
  ...aiEnvShape,
});

export type Env = z.infer<typeof envSchema>;

/** Reads and checks the settings. Throws an error that names each bad setting. */
export function loadEnv(): Env {
  return loadSettings("Worker", envSchema);
}
