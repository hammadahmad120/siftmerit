"use client";

import { useEffect, useState } from "react";
import { apiFailureMessage, getMe, type Me } from "@/lib/api";

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
      try {
        const me = await getMe();
        if (!left) setState({ kind: "ok", me });
      } catch (error) {
        // A session the API no longer accepts was already dealt with by the
        // call helper: the user is signed out and the guard leaves this page.
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
