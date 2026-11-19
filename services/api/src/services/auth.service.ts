import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";
import { createPublishableClient } from "../lib/supabase.js";

export type SignedInUser = { id: string };

/**
 * True when the text has the shape of a sign-in token: three parts joined by
 * dots, where the first two are small JSON objects written in base64url.
 *
 * The library hands back an error for most bad tokens, but it throws when it
 * cannot even read these two parts, for example for `abc.def.ghi`. Thrown
 * errors are answered as 500, so such text is turned away here and gets the
 * 401 it should. Whether a well-shaped token is real is still the library's
 * job: this checks the shape only, never the signature.
 */
function isTokenShaped(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  return parts.slice(0, 2).every((part) => {
    try {
      // `fatal` makes bytes that are not text an error, as the library does.
      const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(part, "base64url"));
      const value: unknown = JSON.parse(text);
      return typeof value === "object" && value !== null && !Array.isArray(value);
    } catch {
      return false;
    }
  });
}

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
    if (!isTokenShaped(accessToken)) return null;

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
