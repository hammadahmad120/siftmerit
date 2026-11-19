"use client";

import { useEffect, useState } from "react";
import { ApiError, apiFailureMessage, getMe, type Me } from "@/lib/api";
import { getAccessToken, signOutHere } from "@/lib/supabase";

type CompanyState =
  | { kind: "loading" }
  | { kind: "ok"; me: Me }
  | { kind: "failed"; message: string };

/**
 * Runs in the browser. Asks the API who the signed-in user is and shows their
 * company. The company comes from the API's own lookup, never from the
 * browser, so this line proves the whole sign-in path.
 */
export function SignedInCompany() {
  const [state, setState] = useState<CompanyState>({ kind: "loading" });

  useEffect(() => {
    // If the page is left before the answer arrives, the answer is dropped.
    let left = false;

    async function load() {
      const accessToken = await getAccessToken();
      // No session: the guard around the page is already sending the visitor
      // to the sign-in page.
      if (!accessToken) return;

      try {
        const me = await getMe(accessToken);
        if (!left) setState({ kind: "ok", me });
      } catch (error) {
        // The API no longer accepts this session, or the user's company is
        // gone. Either way the session is of no use: sign out, and the guard
        // goes to the sign-in page.
        if (error instanceof ApiError && error.status === 401) {
          await signOutHere();
          return;
        }
        if (error instanceof ApiError && error.code === "no_company") {
          await signOutHere("no_company");
          return;
        }
        if (!left) setState({ kind: "failed", message: apiFailureMessage(error) });
      }
    }

    void load();

    return () => {
      left = true;
    };
  }, []);

  if (state.kind === "loading") {
    return <p className="text-slate-600">Loading your company...</p>;
  }
  if (state.kind === "failed") {
    return <p className="text-red-700">{state.message}</p>;
  }
  return (
    <div className="text-slate-700">
      <p>
        Company: <span className="font-medium text-slate-900">{state.me.tenant.name}</span>
      </p>
      <p className="mt-1 text-sm text-slate-600">Your role: {state.me.user.role}</p>
    </div>
  );
}
