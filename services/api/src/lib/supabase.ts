import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";

// The client for all data, made with the secret key, lives in core
// (`createSecretClient`), because the worker uses it too. Only the client for
// checking sign-in tokens is the API's own.

/**
 * The client for checking sign-in tokens. It uses the publishable key, which
 * can reach none of our tables.
 *
 * The API keeps no sign-in session of its own, so the library must not store
 * one or refresh it in the background.
 */
export function createPublishableClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
