import { Suspense } from "react";
import { BackToJobs } from "@/components/back-to-jobs";
import { JobFrame } from "@/components/job-frame";

// The frame around every page of one job. A job has one page per step:
// `/jobs/<id>/requirements`, `/jobs/<id>/applications` and so on. Each of
// those is a small `page.tsx` in a folder beside this file, and Next.js hands
// it over here as `children`. The frame draws the job's title and the row of
// steps once, and stays in place while HR moves from step to step.
//
// The folder name in square brackets means "any text here", and Next.js hands
// that text over as `params.jobId`.
//
// The ID is only known when someone opens the page, not when the app is
// built. Next.js therefore hands `params` over as a promise and wants the
// part that reads it inside a `Suspense`: the fallback is what it can prepare
// ahead of time, and the real content follows when the ID is known.
//
// The key makes the frame start again for another job, so nothing of the job
// shown before is seen for a moment.
//
// The "Back to jobs" button sits outside the `Suspense`, so it is there at
// once and in every case: while loading, for a job, and for a wrong address.
export default function JobLayout({ children, params }: LayoutProps<"/jobs/[jobId]">) {
  return (
    <>
      <BackToJobs />
      <Suspense fallback={<p className="text-sm text-brand-light-navy">Loading the job...</p>}>
        {params.then(({ jobId }) => (
          <JobFrame key={jobId} jobId={jobId}>
            {children}
          </JobFrame>
        ))}
      </Suspense>
    </>
  );
}
