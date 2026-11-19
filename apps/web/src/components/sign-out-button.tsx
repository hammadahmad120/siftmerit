"use client";

import { useState } from "react";
import { signOutHere } from "@/lib/supabase";

// Copied from InstantBot's `sign-out-button.tsx`, with two changes: it ends
// the session in this browser only, not on every device, and it does not move
// to the sign-in page itself. The guard around the page notices the sign-out
// and does that.
export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    setBusy(true);
    try {
      await signOutHere();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onSignOut}
      disabled={busy}
      className="shrink-0 rounded-lg border border-brand-navy/30 px-3 py-2 text-sm text-brand-navy hover:bg-brand-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:opacity-60"
    >
      Sign out
    </button>
  );
}
