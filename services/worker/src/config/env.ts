import { loadSettings, sharedEnvSchema, type SharedEnv } from "@siftmerit/core";

// The worker has no settings of its own yet, only the shared ones, which
// include `REDIS_URL` for the work queue.
// A setting is added here by the task that first uses it.
const envSchema = sharedEnvSchema;

export type Env = SharedEnv;

/** Reads and checks the settings. Throws an error that names each bad setting. */
export function loadEnv(): Env {
  return loadSettings("Worker", envSchema);
}
