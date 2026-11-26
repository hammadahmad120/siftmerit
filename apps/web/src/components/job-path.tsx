/**
 * Where a step of a job's path stands.
 *
 *   done     finished; its card is folded into one line
 *   current  the step HR is on; its card is open
 *   locked   an earlier step must be finished first
 */
export type StepState = "done" | "current" | "locked";

/** One step in the row at the top of a job's page. */
export type PathStep = {
  key: string;
  title: string;
  /** Who does the work in this step, in a few words: "AI drafts, you confirm". */
  who: string;
  state: StepState;
  /** The step's number. The first step, "Job", has none: it is done before the page exists. */
  number?: number;
};

/** What a screen reader says for each state. Sighted users see it from the marker. */
const STATE_WORDS: Record<StepState, string> = {
  done: "Done",
  current: "You are here",
  locked: "Locked",
};

/**
 * The round marker of a step: a tick when it is done, its number otherwise.
 * The current step's marker is purple, the colour of AI at work on this page.
 */
export function StepMarker({ state, number }: { state: StepState; number?: number }) {
  const look =
    state === "done"
      ? "bg-brand-navy text-brand-cream"
      : state === "current"
        ? "bg-brand-purple text-white"
        : "border border-brand-navy/25 text-brand-light-navy/70";

  return (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${look}`}
    >
      {state === "done" ? "✓" : number}
    </span>
  );
}

/**
 * The row of steps at the top of a job's page. It shows the whole journey of
 * a job at a glance: what is done, where HR is now, and what is still locked.
 * So HR sees that drafting and confirming the requirements is the first step,
 * and that every later step waits for it.
 *
 * On a phone the steps stand under each other; from a tablet on they stand in
 * one row with a line between them.
 */
export function JobPath({ steps }: { steps: PathStep[] }) {
  return (
    <nav aria-label="The steps of this job" className="mt-6">
      <ol className="grid gap-3 sm:grid-cols-5 sm:gap-0">
        {steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className="flex items-start gap-3 sm:flex-col sm:gap-2"
          >
            <div className="flex items-center sm:w-full">
              <StepMarker state={step.state} number={step.number} />
              {/* The line to the next step. It is dark once this step is done. */}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`mx-2 hidden h-0.5 flex-1 rounded sm:block ${
                    step.state === "done" ? "bg-brand-navy" : "bg-brand-navy/15"
                  }`}
                />
              ) : null}
            </div>
            <div className="min-w-0 sm:pr-3">
              <p
                className={`text-sm font-medium ${
                  step.state === "locked" ? "text-brand-light-navy/70" : ""
                }`}
              >
                {step.title}
                <span className="sr-only">: {STATE_WORDS[step.state]}</span>
              </p>
              <p className="text-xs text-brand-light-navy">{step.who}</p>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}
