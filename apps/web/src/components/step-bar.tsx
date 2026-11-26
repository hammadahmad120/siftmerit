"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useJob } from "@/components/job-frame";
import { JOB_STEPS, stepPath, stepStates, type StepKey } from "@/lib/job-steps";
import { BUTTON_CLASSES, LINK_BUTTON_CLASSES } from "@/lib/styles";

/** The look of a quiet button or link in the bar: an outline, no fill. */
const QUIET_CLASSES =
  "inline-block rounded-lg border border-brand-navy/30 px-4 py-2 text-sm font-medium hover:border-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:opacity-60";

/**
 * The step's own action, on the right of the bar: the thing that finishes
 * the step. Its label says what it does ("Confirm requirements"), never just
 * "Next", because it changes the job and does not only turn a page.
 */
export type StepAction = {
  label: string;
  /** The words on the button while it is being carried out. */
  busyLabel: string;
  busy: boolean;
  /** Something is missing. The bar's note says what. */
  disabled: boolean;
  onClick: () => void;
};

/**
 * The bar at the bottom of a step. It stays at the bottom of the window, so
 * the way forward is in reach however long the step's content is.
 *
 * - Left: "Back", to the step before. It only looks: going back never undoes
 *   a step.
 * - Middle: `note`, one line. A count, or the reason the button is off.
 * - Right: the step's own `action`. A step without one (it is finished, and
 *   HR is only looking at it) gets "Next" to the step after, if that step is
 *   not locked. `secondary` is a quiet button beside it, for example "Edit
 *   requirements".
 *
 * Every step puts this bar at the end of its own content and says what its
 * action is. The bar works out "Back" and "Next" itself from the list of
 * steps.
 */
export function StepBar(props: {
  step: StepKey;
  note?: ReactNode;
  action?: StepAction;
  secondary?: { label: string; onClick: () => void };
}) {
  const { step, note, action, secondary } = props;
  const { job } = useJob();

  const index = JOB_STEPS.findIndex((item) => item.key === step);
  const before = index > 0 ? JOB_STEPS[index - 1] : null;
  const after = index < JOB_STEPS.length - 1 ? JOB_STEPS[index + 1] : null;
  const afterIsOpen = after ? stepStates(job.status)[after.key] !== "locked" : false;

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-brand-navy/15 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        {before ? (
          <Link href={stepPath(job.id, before.key)} className={QUIET_CLASSES}>
            <span aria-hidden="true">← </span>Back
          </Link>
        ) : null}

        {/* `role="status"` makes a screen reader read the line when it changes. */}
        <div role="status" className="min-w-0 flex-1 text-sm text-brand-light-navy">
          {note}
        </div>

        {secondary ? (
          <button type="button" onClick={secondary.onClick} className={QUIET_CLASSES}>
            {secondary.label}
          </button>
        ) : null}

        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.disabled || action.busy}
            className={`px-4 py-2 ${BUTTON_CLASSES}`}
          >
            {action.busy ? action.busyLabel : action.label}
            {action.busy ? null : <span aria-hidden="true"> →</span>}
          </button>
        ) : after && afterIsOpen ? (
          <Link href={stepPath(job.id, after.key)} className={`px-4 py-2 ${LINK_BUTTON_CLASSES}`}>
            Next<span aria-hidden="true"> →</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
