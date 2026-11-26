"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useJob } from "@/components/job-frame";
import { stepJobIsAt, stepPath } from "@/lib/job-steps";

/**
 * What stands at a job's own address, `/jobs/<id>`, for a moment: it sends
 * HR on to the step the job is at. A draft opens on its requirements; a job
 * that is further on opens on that later step. So HR lands on the next thing
 * to do and not always on step 1.
 *
 * `replace` and not `push`: the job's own address must not stay in the
 * browser's history, or the back button would land here and be sent forward
 * again.
 */
export function JobLanding() {
  const { job } = useJob();
  const router = useRouter();

  useEffect(() => {
    router.replace(stepPath(job.id, stepJobIsAt(job.status)));
  }, [router, job.id, job.status]);

  return <p className="text-sm text-brand-light-navy">Opening the job...</p>;
}
