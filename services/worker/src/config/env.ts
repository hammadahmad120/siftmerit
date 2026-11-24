import { databaseEnvShape, loadSettings, sharedEnvSchema } from "@siftmerit/core";
import { z } from "zod";

// The shared settings (NODE_ENV, LOG_LEVEL, REDIS_URL) come from core. The
// worker adds the two database settings, which have no default: it updates
// the status of every run in Postgres, so it does not start without them.
// A setting is added here by the task that first uses it.
const envSchema = sharedEnvSchema.extend({
  ...databaseEnvShape,
});

export type Env = z.infer<typeof envSchema>;

/** Reads and checks the settings. Throws an error that names each bad setting. */
export function loadEnv(): Env {
  return loadSettings("Worker", envSchema);
}
