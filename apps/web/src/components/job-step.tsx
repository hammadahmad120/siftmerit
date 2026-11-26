import type { ReactNode } from "react";
import { StepMarker, type StepState } from "@/components/job-path";

/**
 * One step of a job's path, as a card under the row of steps. What it shows
 * depends on where the step stands:
 *
 * - `current`: the card is open, with the step's content.
 * - `done`: the card is folded into one line with `summary` and a "View"
 *   link. The content is still there and opens on a click.
 * - `locked`: no content. `what` says what will happen in the step, and
 *   `unlocks` says what must be finished first. So HR sees what the step
 *   before it is needed for.
 */
export function JobStep(props: {
  title: string;
  state: StepState;
  /** The step's number. "Job", the step that is done before the page exists, has none. */
  number?: number;
  /** `done`: the one line shown while the card is folded. */
  summary?: string;
  /** `locked`: what happens in this step. */
  what?: string;
  /** `locked`: what unlocks it. */
  unlocks?: string;
  children?: ReactNode;
}) {
  const { title, state, number, summary, what, unlocks, children } = props;

  if (state === "locked") {
    return (
      <section className="mt-4 rounded-xl border border-dashed border-brand-navy/25 p-4 sm:px-6">
        <h2 className="flex items-center gap-3 font-medium text-brand-light-navy/80">
          <StepMarker state="locked" number={number} />
          {title}
          <span className="rounded-full border border-brand-navy/20 px-2 py-0.5 text-xs font-normal">
            Locked
          </span>
        </h2>
        {what ? <p className="mt-2 text-sm text-brand-light-navy">{what}</p> : null}
        {unlocks ? <p className="mt-1 text-sm text-brand-light-navy/80">{unlocks}</p> : null}
      </section>
    );
  }

  if (state === "done") {
    return (
      // The browser's own fold: a click on the line opens and closes it, and
      // the keyboard works without any code of ours.
      <details className="group mt-4 rounded-xl border border-brand-navy/15 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-brand-navy sm:px-6 [&::-webkit-details-marker]:hidden">
          <StepMarker state="done" number={number} />
          <h2 className="font-medium">{title}</h2>
          {summary ? (
            <span className="min-w-0 truncate text-sm text-brand-light-navy">{summary}</span>
          ) : null}
          <span className="ml-auto shrink-0 text-sm font-medium text-brand-purple underline group-open:hidden">
            View
          </span>
          <span className="ml-auto hidden shrink-0 text-sm font-medium text-brand-purple underline group-open:inline">
            Hide
          </span>
        </summary>
        <div className="border-t border-brand-navy/10 p-4 sm:px-6 sm:pb-6">{children}</div>
      </details>
    );
  }

  return (
    <section className="mt-4 rounded-xl border border-brand-navy/15 bg-white p-4 sm:p-6">
      <h2 className="flex items-center gap-3 text-lg font-semibold">
        <StepMarker state="current" number={number} />
        <span>
          {number ? <span className="font-normal text-brand-light-navy">Step {number}: </span> : null}
          {title}
        </span>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
