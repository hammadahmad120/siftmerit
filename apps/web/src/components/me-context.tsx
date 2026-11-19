"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFailureMessage, getMe, type Me } from "@/lib/api";
import { getSignedInEmail } from "@/lib/supabase";

/** The answer of `GET /v1/me`: still on its way, arrived, or failed. */
export type CompanyState =
  | { kind: "loading" }
  | { kind: "ok"; me: Me }
  | { kind: "failed"; message: string };

/** What every signed-in page can read about the person using it. */
export type SignedInUser = {
  /** From the session the browser holds. Null until it has been read. */
  email: string | null;
  /** From our API, which finds the company itself. */
  company: CompanyState;
};

// A context is React's way to hand one value to every part below a point in
// the page, without passing it down by hand through each part in between.
// `MeProvider` puts the value in; `useMe` takes it out.
const MeContext = createContext<SignedInUser | null>(null);

/**
 * Asks the API once who the signed-in user is and shares the answer with
 * everything inside it: the top bar and every page. A page that needs the
 * company calls `useMe()` and never asks the API again.
 *
 * It sits inside the guard, so it only ever runs for a signed-in user. The
 * guard draws its content under the user's ID, so when another user signs in
 * on this browser this part starts again from "loading".
 */
export function MeProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyState>({ kind: "loading" });

  useEffect(() => {
    // If the user leaves before an answer arrives, the answer is dropped.
    let left = false;

    async function loadEmail() {
      const value = await getSignedInEmail();
      if (!left) setEmail(value);
    }

    async function loadCompany() {
      try {
        const me = await getMe();
        if (!left) setCompany({ kind: "ok", me });
      } catch (error) {
        // A session the API no longer accepts was already dealt with by the
        // call helper: the user is signed out and the guard leaves the page.
        if (!left) setCompany({ kind: "failed", message: apiFailureMessage(error) });
      }
    }

    void loadEmail();
    void loadCompany();

    return () => {
      left = true;
    };
  }, []);

  return <MeContext value={{ email, company }}>{children}</MeContext>;
}

/** The signed-in user, for any part inside `MeProvider`. */
export function useMe(): SignedInUser {
  const value = useContext(MeContext);
  if (!value) {
    throw new Error("useMe() is used outside MeProvider");
  }
  return value;
}
