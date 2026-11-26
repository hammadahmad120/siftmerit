"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  apiFailureMessage,
  getRequirements,
  startRequirementsDraft,
  type DraftRun,
  type IfSilent,
  type JobRequirementsAnswer,
  type JobStatus,
  type Requirement,
  type RequirementKind,
} from "@/lib/api";
import { BUTTON_CLASSES } from "@/lib/styles";
import { useAskWhile } from "@/lib/use-ask-while";

/** While a draft is unfinished, the page asks for its status this often. */
const ASK_EVERY_MS = 3000;

/**
 * After this long without an end the page stops asking and says so. A healthy
 * draft takes at most about three minutes. The API closes a run that has not
 * moved for the same five minutes, so "Try again" works from then on.
 */
const GIVE_UP_AFTER_MS = 5 * 60 * 1000;

/** The answer of `GET /v1/jobs/<id>/requirements`: on its way, arrived, not there, or failed. */
type RequirementsState =
  | { kind: "loading" }
  | { kind: "ok"; requirements: Requirement[]; draft: DraftRun | null }
  | { kind: "missing" }
  | { kind: "failed"; message: string };

/** How one call for the list and the newest draft run ended. */
type Loaded =
  | { kind: "ok"; answer: JobRequirementsAnswer }
  /** The sign-in has ended. The call helper has signed the user out; the page guard goes to sign-in. */
  | { kind: "signed_out" }
  /** The job is gone, or is not the company's. */
  | { kind: "missing" }
  | { kind: "failed"; message: string };

/** Asks the API once and sorts the answer into one of the four cases. It never throws. */
async function loadRequirements(jobId: string): Promise<Loaded> {
  try {
    return { kind: "ok", answer: await getRequirements(jobId) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { kind: "signed_out" };
    if (error instanceof ApiError && error.code === "job_not_found") return { kind: "missing" };
    return { kind: "failed", message: apiFailureMessage(error) };
  }
}

/** The three groups, in the order they are shown, with the heading of each. */
const GROUPS: { kind: RequirementKind; heading: string }[] = [
  { kind: "must", heading: "Must-have" },
  { kind: "preferred", heading: "Preferred" },
  { kind: "nice", heading: "Nice to have" },
];

/** The words on the small label of a requirement. */
const IF_SILENT_LABELS: Record<IfSilent, string> = {
  ask: "Ask the candidate",
  missing: "Count as missing",
};

/**
 * What HR reads when a draft failed, by the short fixed word the API sends
 * for the reason. A word that is not listed gets `FAILURE_OTHER`.
 */
const FAILURE_SENTENCES: Record<string, string> = {
  ai_unavailable: "The AI service did not answer. Try again in a moment.",
  no_requirements: "No requirements could be found in the job description.",
  bad_draft: "The draft could not be used. Try again.",
  ai_setup: "The AI service is not set up. Please tell support.",
  job_not_draft: "This job's requirements are already confirmed.",
  queue_unavailable: "The work queue could not be reached. Try again in a moment.",
};

const FAILURE_OTHER = "The draft did not finish. Try again.";

/** One group of the list: its heading, how many it holds, and its requirements. */
function RequirementGroup({ heading, requirements }: { heading: string; requirements: Requirement[] }) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-medium">
        {heading} <span className="font-normal text-brand-light-navy">({requirements.length})</span>
      </h3>
      <ul className="mt-2 divide-y divide-brand-navy/10 border-y border-brand-navy/10">
        {requirements.map((requirement) => (
          <li
            key={requirement.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
          >
            {/* Plain text, never HTML: React writes the text out as it is. */}
            <span className="min-w-0 text-sm break-words">{requirement.text}</span>
            <span className="shrink-0 rounded-full border border-brand-navy/30 px-2.5 py-0.5 text-xs text-brand-light-navy">
              {IF_SILENT_LABELS[requirement.ifSilent]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The list in its three groups, must-have first. A group with nothing in it is left out. */
function RequirementList({ requirements }: { requirements: Requirement[] }) {
  const hasMust = requirements.some((requirement) => requirement.kind === "must");

  return (
    <>
      <p className="mt-3 text-sm text-brand-light-navy">
        The label on each line says what happens when a CV says nothing about it.
      </p>

      {hasMust ? null : (
        <p className="mt-3 text-sm">
          No must-have yet. A list needs at least one before it can be confirmed.
        </p>
      )}

      {GROUPS.map((group) => {
        const inGroup = requirements.filter((requirement) => requirement.kind === group.kind);
        if (inGroup.length === 0) return null;
        return <RequirementGroup key={group.kind} heading={group.heading} requirements={inGroup} />;
      })}
    </>
  );
}

/**
 * The "Requirements" section of a job's page: the button that drafts the
 * list with AI, what the draft is doing, and the list itself in three groups.
 *
 * The draft is not made by this page and not by the API. The click only asks
 * the API to queue it; the worker makes the AI call. So the page shows one of
 * four states, read from the API: no list yet, drafting, the list, or failed
 * with the reason. While a draft is unfinished the page asks again every few
 * seconds; `useAskWhile` holds every case in which that asking stops.
 *
 * The button is shown only while the job is a draft. Editing and confirming
 * the list come with a later step.
 *
 * Like the job itself, everything is asked for inside the signed-in user's
 * company only; the API answers "not found" for another company's job.
 */
export function JobRequirements({ jobId, jobStatus }: { jobId: string; jobStatus: JobStatus }) {
  const [state, setState] = useState<RequirementsState>({ kind: "loading" });
  // A status call failed while a draft runs. The asking goes on.
  const [cannotReach, setCannotReach] = useState(false);
  // The click's own call to the API is on its way.
  const [starting, setStarting] = useState(false);
  const [startProblem, setStartProblem] = useState<string | null>(null);

  // Whether the section is still on the page. An answer that arrives after
  // the page was left changes nothing.
  const shownRef = useRef(true);
  useEffect(() => {
    shownRef.current = true;
    return () => {
      shownRef.current = false;
    };
  }, []);

  /**
   * Puts the answer of one call on the page. It answers whether asking again
   * makes sense: `false` when the sign-in has ended or the job is gone.
   *
   * `first` is the call made when the page appears: if that one fails, the
   * section shows the failure. A later call that fails only shows a small
   * line, and the asking goes on, because one bad call must not end the wait
   * for a draft.
   */
  const show = useCallback((loaded: Loaded, first: boolean): boolean => {
    if (loaded.kind === "ok") {
      setState({
        kind: "ok",
        requirements: loaded.answer.requirements,
        draft: loaded.answer.draft,
      });
      setCannotReach(false);
      return true;
    }
    if (loaded.kind === "signed_out") return false;
    if (loaded.kind === "missing") {
      setState({ kind: "missing" });
      return false;
    }
    if (first) {
      setState({ kind: "failed", message: loaded.message });
      return false;
    }
    setCannotReach(true);
    return true;
  }, []);

  // Asked once when the page appears, also after a reload in the middle of a
  // draft: the answer says whether a draft is unfinished, and only then does
  // the asking below start.
  useEffect(() => {
    // If the page is left before the answer arrives, the answer is dropped.
    let left = false;

    void loadRequirements(jobId).then((loaded) => {
      if (!left) show(loaded, true);
    });

    return () => {
      left = true;
    };
  }, [jobId, show]);

  /** One later call: while a draft is unfinished, and for "Check again". */
  const askAgain = useCallback(async (): Promise<boolean> => {
    const loaded = await loadRequirements(jobId);
    if (!shownRef.current) return false;
    return show(loaded, false);
  }, [jobId, show]);

  const draft = state.kind === "ok" ? state.draft : null;
  const unfinished = draft !== null && (draft.status === "waiting" || draft.status === "running");

  const { gaveUp, restart } = useAskWhile({
    active: unfinished,
    ask: askAgain,
    everyMs: ASK_EVERY_MS,
    giveUpAfterMs: GIVE_UP_AFTER_MS,
  });

  /** HR's click on the button. The click is the go-ahead to spend one AI call. */
  async function startDraft() {
    setStarting(true);
    setStartProblem(null);
    // A new round of asking, so an earlier "taking longer than usual" is taken back.
    restart();
    try {
      const answer = await startRequirementsDraft(jobId);
      if (!shownRef.current) return;
      setState((current) => (current.kind === "ok" ? { ...current, draft: answer.draft } : current));
    } catch (error) {
      if (!shownRef.current) return;
      if (error instanceof ApiError && error.code === "already_drafting") {
        // A draft is running already, started in another tab or by a colleague. Show that one.
        await askAgain();
      } else if (!(error instanceof ApiError && error.status === 401)) {
        setStartProblem(apiFailureMessage(error));
      }
    } finally {
      if (shownRef.current) setStarting(false);
    }
  }

  /** "Check again", after the page stopped asking: one call now, and a new round. */
  function checkAgain() {
    restart();
    void askAgain();
  }

  if (state.kind === "loading" || state.kind === "failed" || state.kind === "missing") {
    return (
      <section className="mt-6 max-w-3xl rounded-xl border border-brand-navy/15 bg-white p-5">
        <h2 className="font-medium">Requirements</h2>
        {state.kind === "loading" ? (
          <p className="mt-3 text-sm text-brand-light-navy">Loading the requirements...</p>
        ) : null}
        {state.kind === "failed" ? <p className="mt-3 text-sm text-red-700">{state.message}</p> : null}
        {state.kind === "missing" ? (
          <p className="mt-3 text-sm text-brand-light-navy">This job does not exist.</p>
        ) : null}
      </section>
    );
  }

  const { requirements } = state;
  const hasList = requirements.length > 0;
  const stuck = unfinished && gaveUp;
  const drafting = starting || (unfinished && !gaveUp);
  const failedRun = !drafting && draft?.status === "failed";

  let buttonLabel = hasList ? "Draft again" : "Draft requirements";
  if (stuck || failedRun) buttonLabel = "Try again";
  if (drafting) buttonLabel = "Drafting...";

  return (
    <section className="mt-6 max-w-3xl rounded-xl border border-brand-navy/15 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Requirements</h2>
        {jobStatus === "draft" ? (
          <button
            type="button"
            onClick={() => void startDraft()}
            disabled={drafting}
            className={`px-3 py-1.5 ${BUTTON_CLASSES}`}
          >
            {buttonLabel}
          </button>
        ) : null}
      </div>

      {/* `role="status"` makes a screen reader read a line when it appears or changes. */}
      <div role="status">
        {drafting ? (
          <p className="mt-3 text-sm">
            Drafting requirements from the job description. This usually takes a few seconds.
          </p>
        ) : null}

        {stuck ? (
          <p className="mt-3 text-sm">
            This is taking longer than usual.{" "}
            <button
              type="button"
              onClick={checkAgain}
              className="font-medium text-brand-purple underline focus-visible:outline-2 focus-visible:outline-brand-navy"
            >
              Check again
            </button>
          </p>
        ) : null}

        {unfinished && cannotReach ? (
          <p className="mt-3 text-sm text-brand-light-navy">Cannot reach the server. Trying again...</p>
        ) : null}

        {failedRun ? (
          <p className="mt-3 text-sm text-red-700">
            {FAILURE_SENTENCES[draft?.error ?? ""] ?? FAILURE_OTHER}
          </p>
        ) : null}

        {startProblem ? <p className="mt-3 text-sm text-red-700">{startProblem}</p> : null}
      </div>

      {hasList ? <RequirementList requirements={requirements} /> : null}

      {!hasList && !drafting && !stuck ? (
        <p className="mt-3 text-sm text-brand-light-navy">
          No requirements yet.
          {jobStatus === "draft"
            ? " “Draft requirements” turns the job description into a list, with AI."
            : null}
        </p>
      ) : null}
    </section>
  );
}
