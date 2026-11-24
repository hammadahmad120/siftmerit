import Link from "next/link";
import { DemoWorkButton } from "@/components/demo-work-button";

// The home page at `/`, where a signed-in user lands. For now it holds one
// section that opens the job list. More sections, such as numbers about the
// open jobs, can be added later. The company name and the sign-out button are
// in the top bar, which the shell draws around every page.
export default function HomePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Home</h1>

      <section className="mt-6 max-w-xl">
        <Link
          href="/jobs"
          className="block rounded-xl border border-brand-navy/15 bg-white p-5 hover:border-brand-navy"
        >
          <h2 className="font-medium">Jobs</h2>
          <p className="mt-1 text-sm text-brand-light-navy">Open the job list.</p>
        </Link>
      </section>

      {/* Temporary, for task 9. Removed when the first real work exists. */}
      <section className="mt-6 max-w-xl rounded-xl border border-brand-navy/15 bg-white p-5">
        <h2 className="font-medium">Queue demo</h2>
        <p className="mt-1 mb-4 text-sm text-brand-light-navy">
          Adds one pretend work item to the queue. The worker takes it and finishes it two seconds
          later.
        </p>
        <DemoWorkButton />
      </section>
    </>
  );
}
