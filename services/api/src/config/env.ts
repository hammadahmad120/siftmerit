import { loadSettings, sharedEnvSchema } from "@siftmerit/core";
import { z } from "zod";

const WHERE = "It is on the Supabase project's Settings > API Keys page.";

// The shared settings (NODE_ENV, LOG_LEVEL) come from core. Only the API's own
// settings are listed here. A setting is added by the task that first uses it.
const envSchema = sharedEnvSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(4100),
  // The one web address whose pages the browser lets read the API's answers.
  // It must match the web app's address exactly: scheme, host and port.
  CORS_ORIGIN: z.url().default("http://localhost:3100"),

  // Supabase holds the database and sign-in. These three have no default, so
  // the API does not start without them.
  SUPABASE_URL: z.url({
    error: "is missing or is not a web address. It is in the Supabase project's Connect dialog.",
  }),
  // Safe outside the server. Used only to check sign-in tokens.
  SUPABASE_PUBLISHABLE_KEY: z.string({ error: `is missing. ${WHERE}` }).min(1, `is empty. ${WHERE}`),
  // Goes past the row rules and can read every company's rows. Server only.
  SUPABASE_SECRET_KEY: z.string({ error: `is missing. ${WHERE}` }).min(1, `is empty. ${WHERE}`),
});

export type Env = z.infer<typeof envSchema>;

/** Reads and checks the settings. Throws an error that names each bad setting. */
export function loadEnv(): Env {
  return loadSettings("API", envSchema);
}
