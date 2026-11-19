import { SignOutButton } from "@/components/sign-out-button";
import { SignedInCompany } from "@/components/signed-in-company";

// The page at `/jobs`, where a signed-in user lands. For now it only shows
// the user's company and the sign-out button. Task 8 puts the menu around it
// and task 11 puts the job list in it.
export default function JobsPage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
      <p className="mt-2 text-sm text-slate-600">The job list comes in a later task.</p>
      <div className="mt-6">
        <SignedInCompany />
      </div>
      <div className="mt-6">
        <SignOutButton />
      </div>
    </main>
  );
}
