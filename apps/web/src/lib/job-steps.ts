// The steps of a job, written once. The row at the top of a job's page, the
// bar at its bottom and every step's own page read them from here, so a new
// step is one new line in this file and one new page.

import type { JobStatus } from "@/lib/api";

/** The name of a step. It is also the last part of the step's address: `/jobs/<id>/requirements`. */
export type StepKey = "details" | "requirements" | "applications" | "reading" | "candidates";

/**
 * Where a step stands for one job.
 *
 *   done     finished. It can be opened and looked at
 *   current  the step the job is at: the next thing to do
 *   locked   an earlier step must be finished first
 */
export type StepState = "done" | "current" | "locked";

export type JobStep = {
  key: StepKey;
  title: string;
  /** Who does the work in this step, in a few words. */
  who: string;
  /** The step's number. "Job" has none: it is done before its page exists. */
  number?: number;
  /** What happens in the step, for the page of a step that is locked or not built. */
  what: string;
  /** What must be finished before the step opens. */
  unlocks: string;
};

/** The steps, in their order. */
export const JOB_STEPS: JobStep[] = [
  {
    key: "details",
    title: "Job",
    who: "Created",
    what: "The job itself: its description, the subject words and the date mail is read from.",
    unlocks: "",
  },
  {
    key: "requirements",
    number: 1,
    title: "Requirements",
    who: "AI drafts, you confirm",
    what: "The AI lists what a candidate needs, from your job description. You make the list yours and confirm it.",
    unlocks: "",
  },
  {
    key: "applications",
    number: 2,
    title: "Applications",
    who: "We find them in your mailbox",
    what: "We search your mailbox for the emails whose subject holds your subject words, and list them for you to pick.",
    unlocks: "Confirm the requirements to unlock this step.",
  },
  {
    key: "reading",
    number: 3,
    title: "CV reading",
    who: "AI reads every CV",
    what: "The AI reads every CV against your requirements and gives a tick for each one, with the line of the CV that proves it.",
    unlocks: "Unlocks when the applications are picked.",
  },
  {
    key: "candidates",
    number: 4,
    title: "Candidates",
    who: "Best first, with proof",
    what: "The candidates who meet every must-have, best first, with the proof for every tick.",
    unlocks: "Unlocks when the CVs are read.",
  },
];

/**
 * The step a job is at: the next thing to do. It follows from the job's
 * status alone. A draft still has its requirements to confirm; after that
 * the job is open and the applications come next. The later steps are
 * switched on by the tasks that build them.
 */
export function stepJobIsAt(status: JobStatus): StepKey {
  return status === "draft" ? "requirements" : "applications";
}

/** Where every step stands for a job: the ones before the job's step are done, the ones after it locked. */
export function stepStates(status: JobStatus): Record<StepKey, StepState> {
  const at = JOB_STEPS.findIndex((step) => step.key === stepJobIsAt(status));
  const states = {} as Record<StepKey, StepState>;
  JOB_STEPS.forEach((step, index) => {
    states[step.key] = index < at ? "done" : index === at ? "current" : "locked";
  });
  return states;
}

/** The address of one step of one job. */
export function stepPath(jobId: string, key: StepKey): string {
  return `/jobs/${encodeURIComponent(jobId)}/${key}`;
}

/** The step an address shows, read from its last part. Null when the address is no step's. */
export function stepOfPath(pathname: string | null): StepKey | null {
  const last = pathname?.split("/").filter(Boolean).pop();
  return JOB_STEPS.find((step) => step.key === last)?.key ?? null;
}
