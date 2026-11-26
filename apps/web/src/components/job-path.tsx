import Link from "next/link";
import { JOB_STEPS, stepPath, type StepKey, type StepState } from "@/lib/job-steps";

/** What a screen reader says for each state. Sighted users see it from the marker. */
const STATE_WORDS: Record<StepState, string> = {
  done: "Done",
  current: "The step this job is at",
  locked: "Locked",
};

/**
 * The round marker of a step: a tick when it is done, its number otherwise.
 * The marker of the step the job is at is purple, the colour of AI at work
 * on this page.
 */
export function StepMarker(props: {
  state: StepState;
  number?: number;
  /** This is the step on the screen: the marker gets a soft ring around it. */
  onScreen?: boolean;
}) {
  const { state, number, onScreen } = props;
  const look =
    state === "done"
      ? "bg-brand-navy text-brand-cream"
      : state === "current"
        ? "bg-brand-purple text-white"
        : "border border-brand-navy/25 text-brand-light-navy/70";
  // The ring has the marker's own colour, thinned.
  const ring = !onScreen
    ? ""
    : state === "current"
      ? "ring-4 ring-brand-purple/25"
      : "ring-4 ring-brand-navy/20";

  return (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${look} ${ring}`}
    >
      {state === "done" ? "✓" : number}
    </span>
  );
}

/**
 * The row of steps at the top of a job's page. It shows the whole journey of
 * a job at a glance: what is done, which step the job is at, and what is
 * still locked. So HR sees that drafting and confirming the requirements is
 * the first step, and that every later step waits for it.
 *
 * It is also how HR moves between steps: a step that is done, and the step
 * the job is at, are links. A locked step is not. The step on the screen is
 * the one that stands out: its marker has a soft ring, and its name is dark
 * and heavy while the others are lighter.
 *
 * On a phone the steps stand under each other; from a tablet on they stand in
 * one row with a line between them.
 */
export function JobPath(props: {
  jobId: string;
  states: Record<StepKey, StepState>;
  /** The step on the screen, or null on an address that is no step's. */
  viewing: StepKey | null;
}) {
  const { jobId, states, viewing } = props;

  return (
    <nav aria-label="The steps of this job" className="mt-6">
      <ol className="grid gap-3 sm:grid-cols-5 sm:gap-0">
        {JOB_STEPS.map((step, index) => {
          const state = states[step.key];
          const onScreen = step.key === viewing;

          const words = (
            <>
              <span
                className={`block text-sm ${
                  onScreen
                    ? "font-semibold text-brand-navy"
                    : state === "locked"
                      ? "font-medium text-brand-light-navy/60"
                      : "font-medium text-brand-light-navy"
                }`}
              >
                {step.title}
                <span className="sr-only">: {STATE_WORDS[state]}</span>
              </span>
              <span
                className={`block text-xs ${
                  onScreen ? "text-brand-light-navy" : "text-brand-light-navy/70"
                }`}
              >
                {step.who}
              </span>
            </>
          );

          return (
            <li key={step.key} className="flex items-start gap-3 sm:flex-col sm:gap-2">
              <div className="flex items-center sm:w-full">
                <StepMarker state={state} number={step.number} onScreen={onScreen} />
                {/* The line to the next step. It is dark once this step is done. */}
                {index < JOB_STEPS.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`mx-2 hidden h-0.5 flex-1 rounded sm:block ${
                      state === "done" ? "bg-brand-navy" : "bg-brand-navy/15"
                    }`}
                  />
                ) : null}
              </div>
              {state === "locked" ? (
                <div className="min-w-0 sm:pr-3">{words}</div>
              ) : (
                <Link
                  href={stepPath(jobId, step.key)}
                  aria-current={onScreen ? "page" : undefined}
                  className="group min-w-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy sm:pr-3"
                >
                  {words}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
