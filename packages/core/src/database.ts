// The connection to the database, shared by the API and the worker. Moved
// here from the API in task 10, when the worker first needed the database.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const WHERE = "It is on the Supabase project's Settings > API Keys page.";

/**
 * The two settings the database connection needs. Neither has a default, so a
 * part that adds them does not start without them. The API and the worker
 * each add them to their own settings:
 *
 *   sharedEnvSchema.extend({ ...databaseEnvShape })
 *
 * They are not in `sharedEnvSchema` itself, because the mailbox scripts use
 * that schema too and need no database.
 */
export const databaseEnvShape = {
  SUPABASE_URL: z.url({
    error: "is missing or is not a web address. It is in the Supabase project's Connect dialog.",
  }),
  // Goes past the row rules and can read every company's rows. Server only.
  SUPABASE_SECRET_KEY: z.string({ error: `is missing. ${WHERE}` }).min(1, `is empty. ${WHERE}`),
};

export type DatabaseEnv = {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
};

/**
 * The client for all data. It uses the secret key, which goes past the row
 * rules and can read every company's rows. So every repository function must
 * filter by tenant_id itself.
 *
 * Our servers keep no sign-in session of their own, so the library must not
 * store one or refresh it in the background.
 */
export function createSecretClient(env: DatabaseEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * A call to the database (or to Supabase's sign-in service) failed.
 *
 * Its own `message` holds only facts that are safe to log: the table and
 * action in fixed words we write, and the database's error code. The
 * database's own wording is kept apart in `rawMessage`, because it can repeat
 * the data that caused the error, such as an email address. It is shown in
 * development only.
 */
export class DatabaseError extends Error {
  constructor(
    /** Table and action, for example "tenants insert". */
    public readonly operation: string,
    /** The database's error code, for example "23505". Never holds data. */
    public readonly dbCode: string | undefined,
    /** The database's own wording. May hold data. */
    public readonly rawMessage: string,
  ) {
    super(`Database call failed: ${operation}${dbCode ? ` (code ${dbCode})` : ""}`);
    this.name = "DatabaseError";
  }
}

/** Wraps an error object from the Supabase library in a DatabaseError. */
export function toDatabaseError(
  operation: string,
  error: { code?: string; message: string; details?: string | null },
): DatabaseError {
  const raw = error.details ? `${error.message} | ${error.details}` : error.message;
  return new DatabaseError(operation, error.code, raw);
}
