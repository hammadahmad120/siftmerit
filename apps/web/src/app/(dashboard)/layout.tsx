import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardShell } from "@/components/dashboard-shell";

// Every page in the `(dashboard)` folder needs a signed-in user and gets the
// same frame, so both sit here once, around all of them. The folder name in
// brackets is not part of the address: `(dashboard)/page.tsx` is the home page
// at `/`, and `(dashboard)/jobs/page.tsx` is the page at `/jobs`.
//
// The shell is inside the guard on purpose: it is drawn only for a signed-in
// user, and it starts again when another user signs in on the same browser.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}
