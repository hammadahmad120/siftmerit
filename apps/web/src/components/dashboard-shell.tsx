"use client";

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { DashboardNav, DashboardNavLinks } from "@/components/dashboard-nav";
import { MeProvider, useMe } from "@/components/me-context";
import { SignOutButton } from "@/components/sign-out-button";

// The frame around every signed-in page: a top bar, and the page below it.
// InstantBot's `dashboard-shell.tsx` is a sidebar that reads the session on
// the Next.js server; ours is a top bar and runs in the browser, because only
// the browser holds the session.

/**
 * The shell. `MeProvider` asks the API once who is signed in; the bar and the
 * page both read that one answer.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <MeProvider>
      <div className="min-h-screen">
        <TopBar />
        {/* The bar and the page share one width, so their edges line up. */}
        <main className="mx-auto w-full max-w-6xl px-6 py-8">
          <PageArea>{children}</PageArea>
        </main>
      </div>
    </MeProvider>
  );
}

/**
 * The bar: the product's name, the menu, and on the right the company, the
 * user's email and the sign-out button.
 */
function TopBar() {
  const { email, company } = useMe();
  const companyName = company.kind === "ok" ? company.me.tenant.name : null;

  return (
    <header className="border-b border-brand-navy/10 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-3">
        <Link href="/" className="text-lg font-semibold text-brand-navy">
          Siftmerit
        </Link>

        <Suspense fallback={<DashboardNavLinks pathname={null} />}>
          <DashboardNav />
        </Suspense>

        <div className="ml-auto flex min-w-0 items-center gap-4">
          {/*
            The bar is drawn before the answers arrive. Until then each line
            holds a space that does not collapse, so the bar keeps its height
            and nothing jumps when the name fills in.
          */}
          <div className="min-w-0 text-right text-sm leading-tight">
            <p className="truncate font-medium text-brand-navy">{companyName ?? " "}</p>
            <p className="truncate text-brand-light-navy">{email ?? " "}</p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

/**
 * The page, or the failure line when the API could not say who is signed in.
 * In that case the page's own calls would fail too, so one clear line is
 * shown in its place.
 */
function PageArea({ children }: { children: ReactNode }) {
  const { company } = useMe();

  if (company.kind === "failed") {
    return <p className="text-red-700">{company.message}</p>;
  }

  return children;
}
