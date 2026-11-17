import { loadSettings, sharedEnvSchema } from "@siftmerit/core";
import { z } from "zod";

// The shared settings (NODE_ENV, LOG_LEVEL) come from core. Only the API's own
// settings are listed here. A setting is added by the task that first uses it.
const envSchema = sharedEnvSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(4100),
});

export type Env = z.infer<typeof envSchema>;

/** Reads and checks the settings. Throws an error that names each bad setting. */
export function loadEnv(): Env {
  return loadSettings("API", envSchema);
}
