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
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      Sign out
    </button>
  );
}
