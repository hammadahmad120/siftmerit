import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { SignedInCompany } from "@/components/signed-in-company";

// The home page at `/`, where a signed-in user lands. For now it shows the
// user's company, one section that opens the job list, and the sign-out
// button. More sections, such as numbers about the open jobs, can be added
// later. Task 8 puts the menu around every page and moves the company name
// and the sign-out button there.
export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Home</h1>
      <div className="mt-4">
        <SignedInCompany />
      </div>

      <section className="mt-8">
        <Link
          href="/jobs"
          className="block rounded-xl border border-slate-200 bg-white p-5 hover:bg-slate-50"
        >
          <h2 className="font-medium text-slate-900">Jobs</h2>
          <p className="mt-1 text-sm text-slate-600">Open the job list.</p>
        </Link>
      </section>

      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}
