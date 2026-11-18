import { loadSettings, sharedEnvSchema } from "@siftmerit/core";
import { z } from "zod";

// Settings for the two mailbox scripts in this folder. They are kept apart
// from the worker's own settings (config/env.ts), so `npm run dev:worker`
// still starts without any Google or mailsift setting.

/** Where Google swaps a one-time code or a mailbox secret for a pass. */
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** A setting that must be present and not empty. `help` says where to get it. */
function required(help: string) {
  return z.string({ error: `is missing. ${help}` }).min(1, `is empty. ${help}`);
}

const connectSchema = sharedEnvSchema.extend({
  // The app's own name and password at Google. They identify Siftmerit, not
  // any mailbox.
  GOOGLE_CLIENT_ID: required("Copy client_id from the JSON file Google gave you."),
  GOOGLE_CLIENT_SECRET: required("Copy client_secret from the JSON file Google gave you."),
});

const checkSchema = connectSchema.extend({
  // The test mailbox's long-lived secret (refresh token). Development only:
  // the product keeps each company's secret encrypted in the database.
  DEV_MAILBOX_REFRESH_TOKEN: required("Run `npm run mailbox:connect` to get it."),
  // mailsift listens on 127.0.0.1 only, so the default does not say "localhost".
  MAILSIFT_URL: z.url().default("http://127.0.0.1:3000/mcp"),
  MAILSIFT_SERVER_KEY: required("Copy one key from MCP_SERVER_KEYS in mailsift's .env file."),
});

export type ConnectSettings = z.infer<typeof connectSchema>;
export type CheckSettings = z.infer<typeof checkSchema>;

/** Settings for `npm run mailbox:connect`. Throws an error that names each bad setting. */
export function loadConnectSettings(): ConnectSettings {
  return loadSettings("mailbox:connect", connectSchema);
}

/** Settings for `npm run mailbox:check`. Throws an error that names each bad setting. */
export function loadCheckSettings(): CheckSettings {
  return loadSettings("mailbox:check", checkSchema);
}
