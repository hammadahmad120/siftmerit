import Link from "next/link";
import { JobList } from "@/components/job-list";
import { BUTTON_CLASSES } from "@/lib/styles";

// The page at `/jobs`, opened from the menu or the home page: the company's
// jobs and the button that opens the "New job" form.
export default function JobsPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        {/* A link that looks like a button. `hover:` is written out here,
            because the shared look only reacts on a real button. */}
        <Link href="/jobs/new" className={`px-4 py-2 hover:bg-brand-light-navy ${BUTTON_CLASSES}`}>
          New job
        </Link>
      </div>
      <JobList />
    </>
  );
}
