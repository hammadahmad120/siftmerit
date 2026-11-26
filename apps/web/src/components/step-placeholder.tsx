"use client";

import Link from "next/link";
import { useJob } from "@/components/job-frame";
import { StepBar } from "@/components/step-bar";
import { JOB_STEPS, stepJobIsAt, stepPath, stepStates, type StepKey } from "@/lib/job-steps";
import { LINK_BUTTON_CLASSES } from "@/lib/styles";

/**
 * The page of a step that has no screen of its own yet. It says what will
 * happen in the step, and one of two things:
 *
 * - The step is locked: what must be finished first, with a link to the step
 *   the job is at. HR can reach a locked step only by typing its address;
 *   the row of steps does not link to it.
 * - The step is open: that it is not built yet.
 *
 * The task that builds a step replaces this with the step's real content.
 */
export function StepPlaceholder({ step }: { step: StepKey }) {
  const { job } = useJob();
  const details = JOB_STEPS.find((item) => item.key === step);
  if (!details) return null;

  const locked = stepStates(job.status)[step] === "locked";
  const at = JOB_STEPS.find((item) => item.key === stepJobIsAt(job.status));

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold">
        {details.number ? (
          <span className="font-normal text-brand-light-navy">Step {details.number}: </span>
        ) : null}
        {details.title}
      </h2>
      <p className="mt-1 text-sm text-brand-light-navy">{details.who}</p>

      <div className="mt-5 rounded-xl border border-dashed border-brand-navy/25 p-5">
        <p className="text-sm">{details.what}</p>
        {locked ? (
          <>
            <p className="mt-3 text-sm font-medium">This step is locked. {details.unlocks}</p>
            {at ? (
              <Link
                href={stepPath(job.id, at.key)}
                className={`mt-4 px-4 py-2 ${LINK_BUTTON_CLASSES}`}
              >
                Go to {at.title}
              </Link>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm font-medium">This step is open, and it is not built yet.</p>
        )}
      </div>

      <StepBar step={step} />
    </div>
  );
}
