// The web app's one connection to Supabase's sign-in service. It runs in the
// browser only, and is used for three things: signing in, signing out, and
// handing the signed-in user's token to our own API calls. The web app never
// reads the database through it.
//
// The library keeps the session in the browser's local storage, under one
// entry named `sb-<project>-auth-token`, and refreshes the token by itself.
// Our code never reads or writes that entry by hand.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Each name must be written out in full. Next.js swaps these exact words for
// their values when it builds the code for the browser. Both are safe to
// show: the publishable key is made to be public.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * A message when the two Supabase settings are missing, or null when they
 * are there. A screen shows it in place of failing without a word.
 */
export function supabaseSettingsProblem(): string | null {
  if (url && publishableKey) return null;
  return "Sign-in is not set up: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing in the repo-root .env file. Add them and restart the web app.";
}

let client: SupabaseClient | undefined;

/**
 * The Supabase client, made on first use and then shared.
 *
 * Call it only from code that runs in the browser: an effect or a click
 * handler, never while a component is being drawn. Next.js also draws browser
 * parts once on the server, where there is no local storage.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  if (!url || !publishableKey) {
    throw new Error(supabaseSettingsProblem() ?? "Sign-in is not set up");
  }

  client = createClient(url, publishableKey);
  return client;
}

/**
 * The signed-in user's token for a call to our API, or null when nobody is
 * signed in. The library hands back a fresh token when the old one has run out.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * The signed-in user's email, for the top bar, or null when nobody is signed
 * in. It is read from the session the browser already holds, so it costs no
 * call to our API. It is only shown; the API never trusts it.
 */
export async function getSignedInEmail(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.email ?? null;
}

/** Why a user was signed out by us. The sign-in page shows a message for it. */
export type SignInNotice = "no_company";

// Set by `signOutHere` and read once by the guard, which is the only code
// that sends a signed-out visitor to the sign-in page.
let pendingNotice: SignInNotice | null = null;

/**
 * Ends the session in this browser only. Other devices stay signed in.
 *
 * The library removes the session from local storage first and only then
 * tells Supabase, so this works without a network too. The guard notices the
 * sign-out and goes to the sign-in page; `notice` says which message to show
 * there.
 */
export async function signOutHere(notice?: SignInNotice): Promise<void> {
  pendingNotice = notice ?? null;
  await getSupabase().auth.signOut({ scope: "local" });
}

/** The sign-in address to go to after a sign-out, with the waiting notice if there is one. */
export function takeSignInAddress(): string {
  const address = pendingNotice ? `/signin?notice=${pendingNotice}` : "/signin";
  pendingNotice = null;
  return address;
}
