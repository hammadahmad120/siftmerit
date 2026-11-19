import Link from "next/link";

// The page at `/jobs`, opened from the home page. It is a placeholder until
// task 11 puts the job list in it.
export default function JobsPage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
        Back to home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">Jobs</h1>
      <p className="mt-2 text-sm text-slate-600">The job list comes in a later task.</p>
    </main>
  );
}
