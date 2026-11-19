"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { getSupabase, supabaseSettingsProblem, takeSignInAddress } from "@/lib/supabase";

type GuardState =
  | { kind: "checking" }
  | { kind: "signed-in"; userId: string }
  | { kind: "signed-out" };

/**
 * Runs in the browser, around every page that needs a signed-in user. It
 * shows the page only when there is a session, and sends everyone else to the
 * sign-in page.
 *
 * This is a convenience, not the lock. The page frame it hides holds no data.
 * Every piece of data comes from the API, which checks the token on each call.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>({ kind: "checking" });
  const settingsProblem = supabaseSettingsProblem();

  useEffect(() => {
    if (settingsProblem) return;

    // The library calls this once straight away with the session it finds in
    // local storage, and again on every change: sign-in, sign-out (in this tab
    // or another one), and a refresh that Supabase refuses.
    const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
      if (session) {
        const userId = session.user.id;
        // The same object is kept when nothing changed, so a token refresh
        // does not redraw the page.
        setState((old) =>
          old.kind === "signed-in" && old.userId === userId ? old : { kind: "signed-in", userId },
        );
      } else {
        setState({ kind: "signed-out" });
        router.replace(takeSignInAddress());
      }
    });

    return () => data.subscription.unsubscribe();
  }, [router, settingsProblem]);

  if (settingsProblem) return <p className="p-8 text-red-700">{settingsProblem}</p>;

  if (state.kind === "signed-in") {
    // The key is the user's ID. Next.js keeps a page that was left alive in
    // the background; if another user signs in on this browser, the key
    // changes and the page starts empty, so nothing of the earlier user shows.
    return <Fragment key={state.userId}>{children}</Fragment>;
  }

  return <p className="p-8 text-slate-600">Loading...</p>;
}
