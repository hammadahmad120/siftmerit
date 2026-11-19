"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The menu of the top bar. From InstantBot's `dashboard-nav.tsx` only the
// "which link is active" check and the idea of a list of items are taken. Its
// icons, folding group and "still processing" badge are left out.

/** The menu, in the order it is shown. A new screen adds one line here. */
const MENU_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/jobs", label: "Jobs" },
] as const;

/**
 * Whether a menu item is the one the user is on. "Jobs" stays active on a page
 * below it, such as `/jobs/123`. "Home" is active only on `/` itself, because
 * every address starts with `/`.
 */
function pathIsActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The menu with the active link marked. It reads the current address, which
 * is why the top bar puts a `Suspense` around it: Next.js cannot always know
 * the address when it prepares a page ahead of time.
 */
export function DashboardNav() {
  return <DashboardNavLinks pathname={usePathname()} />;
}

/**
 * The links themselves. With `pathname` null no link is marked; the top bar
 * shows that version for the moment the address is not known yet.
 */
export function DashboardNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex items-center gap-5">
      {MENU_ITEMS.map((item) => {
        const active = pathname !== null && pathIsActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 px-1 py-1 text-sm ${
              active
                ? "border-brand-purple font-medium text-brand-purple"
                : "border-transparent text-brand-navy hover:text-brand-purple"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
