import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";
import { createPublishableClient } from "../lib/supabase.js";

export type SignedInUser = { id: string };

/**
 * Checks sign-in tokens.
 *
 * Supabase signs every token with a private key. The library fetches the
 * matching public key from the project once, keeps it, and checks each
 * token's signature and expiry here, without a call to Supabase per request.
 * (InstantBot asks Supabase on every request; that part is not copied.)
 *
 * A token of a removed user still passes this check until it runs out. That
 * is covered by the next step of every request, which looks the user up in
 * `tenant_members`.
 */
export class AuthService {
  private readonly client;

  constructor(env: Env) {
    this.client = createPublishableClient(env);
  }

  /** Returns the signed-in user, or null when the token is not valid. */
  async verifyAccessToken(accessToken: string): Promise<SignedInUser | null> {
    const { data, error } = await this.client.auth.getClaims(accessToken);

    if (error) {
      // The public key could not be fetched. That is our problem, not a bad
      // token, so it must not be answered as "sign in again".
      if (isAuthRetryableFetchError(error)) {
        throw new Error("The sign-in service could not be reached to check a token");
      }
      return null;
    }
    if (!data) return null;

    // `sub` is the user's ID. `role` is "authenticated" for a signed-in person.
    const { sub, role } = data.claims;
    if (!sub || role !== "authenticated") return null;

    return { id: sub };
  }
}
