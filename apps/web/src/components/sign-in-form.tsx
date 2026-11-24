"use client";

import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError, apiFailureMessage, getMeAtSignIn } from "@/lib/api";
import { BUTTON_CLASSES, FIELD_CLASSES } from "@/lib/styles";
import { getSupabase, signOutHere, supabaseSettingsProblem } from "@/lib/supabase";

// Copied from InstantBot's `auth-form.tsx` and cut down to sign-in only.
// Sign-up, the workspace name and "retry workspace setup" are left out:
// accounts and companies are created by us, with `npm run company:create`.

/** Where a signed-in user lands: the home page. */
const HOME = "/";

const NO_COMPANY_MESSAGE =
  "This account is not linked to a company. Contact the person who set up your account.";

/** Our own words for a sign-in that Supabase refused. */
function signInMessage(error: AuthError): string {
  // Supabase gives this one code for a wrong password and for an unknown
  // email, so the form never reveals which emails have an account.
  if (error.code === "invalid_credentials") return "Wrong email or password.";
  if (error.status === 429) return "Too many tries. Wait a few minutes and try again.";
  if (isAuthRetryableFetchError(error)) {
    return "The sign-in service cannot be reached. Check your connection and try again.";
  }
  return "Sign-in failed. Try again.";
}

/**
 * The message for a visitor who was signed out by us and sent here, read from
 * the address (`/signin?notice=no_company`). Reading the address makes this
 * part wait for the browser, so it sits in its own `Suspense` below and the
 * rest of the form is drawn without waiting.
 */
function SignInNotice() {
  const notice = useSearchParams().get("notice");
  if (notice !== "no_company") return null;
  return <Message>{NO_COMPANY_MESSAGE}</Message>;
}

function Message({ children }: { children: string }) {
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settingsProblem = supabaseSettingsProblem();

  // A visitor who is already signed in has nothing to do here.
  useEffect(() => {
    if (settingsProblem) return;
    let left = false;

    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!left && data.session) router.replace(HOME);
      });

    return () => {
      left = true;
    };
  }, [router, settingsProblem]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      // Step 1: Supabase checks the email and password. When they are right
      // it hands back a session, which the library saves in local storage.
      const { data, error: signInError } = await getSupabase().auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInMessage(signInError));
        return;
      }

      // Step 2: our API says which company this user belongs to. A user with
      // no company, or an API that cannot be asked, is signed out again, so
      // nobody is ever half signed in.
      try {
        await getMeAtSignIn(data.session.access_token);
      } catch (apiError) {
        await signOutHere();
        const noCompany = apiError instanceof ApiError && apiError.code === "no_company";
        setError(noCompany ? NO_COMPANY_MESSAGE : apiFailureMessage(apiError));
        return;
      }

      // Next.js keeps a page that was left alive in the background, with what
      // was typed into it. The fields are emptied so the password does not
      // show up again after a sign-out.
      setEmail("");
      setPassword("");
      router.replace(HOME);
    } catch {
      setError("Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-brand-navy/15 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-brand-light-navy">Welcome back to Siftmerit.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD_CLASSES}
          />
        </label>

        <label className="block text-sm font-medium">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD_CLASSES}
          />
        </label>

        {settingsProblem ? (
          <Message>{settingsProblem}</Message>
        ) : error ? (
          <Message>{error}</Message>
        ) : (
          <Suspense fallback={null}>
            <SignInNotice />
          </Suspense>
        )}

        <button
          type="submit"
          disabled={busy || settingsProblem !== null}
          className={`w-full px-4 py-2.5 ${BUTTON_CLASSES}`}
        >
          {busy ? "Please wait..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
