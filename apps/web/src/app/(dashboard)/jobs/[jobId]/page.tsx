import { Suspense } from "react";
import { BackToJobs } from "@/components/back-to-jobs";
import { JobDetails } from "@/components/job-details";

// The page of one job, at `/jobs/<id>`. The folder name in square brackets
// means "any text here", and Next.js hands that text over as `params.jobId`.
//
// The ID is only known when someone opens the page, not when the app is
// built. Next.js therefore hands `params` over as a promise and wants the
// part that reads it inside a `Suspense`: the fallback is what it can prepare
// ahead of time, and the real content follows when the ID is known.
//
// The key makes the content start again for another job, so nothing of the
// job shown before is seen for a moment.
//
// The "Back to jobs" button sits outside the `Suspense`, so it is there at
// once and in every case: while loading, for a job, and for a wrong address.
export default function JobPage({ params }: PageProps<"/jobs/[jobId]">) {
  return (
    <>
      <BackToJobs />
      <Suspense fallback={<p className="text-sm text-brand-light-navy">Loading the job...</p>}>
        {params.then(({ jobId }) => (
          <JobDetails key={jobId} jobId={jobId} />
        ))}
      </Suspense>
    </>
  );
}
