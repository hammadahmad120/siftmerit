import Link from "next/link";
import { JobList } from "@/components/job-list";
import { LINK_BUTTON_CLASSES } from "@/lib/styles";

// The page at `/jobs`, opened from the menu or the home page: the company's
// jobs and the button that opens the "New job" form.
export default function JobsPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <Link href="/jobs/new" className={`px-4 py-2 ${LINK_BUTTON_CLASSES}`}>
          New job
        </Link>
      </div>
      <JobList />
    </>
  );
}
