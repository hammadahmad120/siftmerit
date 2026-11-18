import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";

// The API keeps no sign-in session of its own, so the library must not store
// one or refresh it in the background.
const serverOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/**
 * The client for all data. It uses the secret key, which goes past the row
 * rules and can read every company's rows. So every repository function must
 * filter by tenant_id itself.
 */
export function createSecretClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, serverOptions);
}

/**
 * The client for checking sign-in tokens. It uses the publishable key, which
 * can reach none of our tables.
 */
export function createPublishableClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, serverOptions);
}
