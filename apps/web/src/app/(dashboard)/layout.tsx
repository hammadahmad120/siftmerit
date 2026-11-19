import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth-guard";

// Every page in the `(dashboard)` folder needs a signed-in user, so the guard
// sits here once, around all of them. The folder name in brackets is not part
// of the address: `(dashboard)/jobs/page.tsx` is the page at `/jobs`.
// Task 8 adds the menu and the company name here.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
