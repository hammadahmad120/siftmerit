"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  apiFailureMessage,
  getRequirements,
  startRequirementsDraft,
  type DraftRun,
  type JobRequirementsAnswer,
  type JobStatus,
  type Requirement,
  type RequirementKind,
} from "@/lib/api";
import { RequirementList } from "@/components/requirement-list";
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

/** How many placeholder lines stand in for the list while the AI drafts it. */
const PLACEHOLDER_LINES = 5;

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

/** The small purple star that marks what the AI did or is doing. */
function Spark() {
  return (
    <span aria-hidden="true" className="text-brand-purple">
      ✦
    </span>
  );
}

/** One line that counts the list: "13 requirements · 6 must-have · 5 preferred · 2 nice to have". */
function countLine(requirements: Requirement[]): string {
  const of = (kind: RequirementKind) =>
    requirements.filter((requirement) => requirement.kind === kind).length;
  const total = `${requirements.length} ${requirements.length === 1 ? "requirement" : "requirements"}`;
  return `${total} · ${of("must")} must-have · ${of("preferred")} preferred · ${of("nice")} nice to have`;
}

/**
 * What stands in for the list while the AI drafts it: grey-purple lines that
 * shimmer where the requirements will appear. They show that work is going
 * on without pretending to know how far it is.
 */
function DraftingPlaceholder() {
  return (
    <div aria-hidden="true" className="mt-4 space-y-2">
      {Array.from({ length: PLACEHOLDER_LINES }, (_, index) => (
        <div key={index} className="rounded-lg border border-brand-navy/10 bg-white p-4">
          <div className="ai-shimmer h-3.5 rounded" style={{ width: `${78 - index * 9}%` }} />
          <div className="ai-shimmer mt-3 h-6 w-64 max-w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

/**
 * The content of the "Requirements" step of a job's page: the card that asks
 * HR to let the AI draft the list, what the draft is doing, and the list
 * itself in three groups. The step's own card and heading come from
 * `JobStep`, which wraps this.
 *
 * The draft is not made by this page and not by the API. The click only asks
 * the API to queue it; the worker makes the AI call. So the page shows one of
 * four states, read from the API: no list yet, drafting, the list, or failed
 * with the reason. While a draft is unfinished the page asks again every few
 * seconds; `useAskWhile` holds every case in which that asking stops.
 *
 * While the job is a draft HR edits the list here, and every change is saved
 * at once; see `RequirementList`. The draft button shows only while the job
 * has no requirements. Confirming the list comes with a later step.
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

  /**
   * HR changed the list: a new kind, a new text, a line added or removed.
   * `update` makes the new list from the one that is on the page now.
   */
  const updateRequirements = useCallback((update: (current: Requirement[]) => Requirement[]) => {
    setState((current) =>
      current.kind === "ok" ? { ...current, requirements: update(current.requirements) } : current,
    );
  }, []);

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

  if (state.kind === "loading") {
    return <p className="text-sm text-brand-light-navy">Loading the requirements...</p>;
  }
  if (state.kind === "failed") return <p className="text-sm text-red-700">{state.message}</p>;
  if (state.kind === "missing") {
    return <p className="text-sm text-brand-light-navy">This job does not exist.</p>;
  }

  const { requirements } = state;
  const hasList = requirements.length > 0;
  const canDraft = jobStatus === "draft";
  const stuck = unfinished && gaveUp;
  const drafting = starting || (unfinished && !gaveUp);
  // A failed draft is only told while there is no list. With a list on the
  // page there is nothing to try again.
  const failedRun = !drafting && !hasList && draft?.status === "failed";

  return (
    <>
      {/*
        The top of the step. There is no "Draft again" here on purpose: the
        same job description gives nearly the same list, and a new draft
        would wipe HR's own changes. The draft button is back when the list
        is empty.
      */}
      {hasList ? (
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-purple/10 px-2.5 py-0.5 text-xs font-medium text-brand-purple">
            <Spark /> Drafted by AI
          </p>
          <p className="mt-2 text-sm text-brand-light-navy">{countLine(requirements)}</p>
          {canDraft ? (
            <p className="mt-1 text-sm">
              Review the list and make it yours. Every change is saved at once.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* No list yet: one card that says why this step matters, with the one button. */}
      {!hasList && !drafting ? (
        <div className="rounded-lg bg-brand-cream p-5">
          <p className="font-medium">
            <Spark /> Let AI draft the requirements
          </p>
          <p className="mt-2 max-w-2xl text-sm">
            The AI reads your job description and lists what a candidate needs. Every CV is later
            checked against this list, so this step decides who you will see.
          </p>
          {canDraft ? (
            <button
              type="button"
              onClick={() => void startDraft()}
              className={`mt-4 px-4 py-2 ${BUTTON_CLASSES}`}
            >
              {stuck || failedRun ? "Try again" : "Draft requirements"}
            </button>
          ) : (
            <p className="mt-3 text-sm text-brand-light-navy">This job has no requirements.</p>
          )}
        </div>
      ) : null}

      {/* `role="status"` makes a screen reader read a line when it appears or changes. */}
      <div role="status">
        {drafting ? (
          <p className="mt-3 text-sm font-medium first:mt-0">
            <Spark /> AI is reading your job description...
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

      {/* While the AI drafts, the shimmer stands where the list will be. */}
      {drafting ? <DraftingPlaceholder /> : null}

      {/*
        The key is the newest draft run. When a draft ends, the run changes,
        the list is drawn as new, and its lines fade in one after another.
      */}
      {hasList && !drafting ? (
        <RequirementList
          key={draft?.id ?? "list"}
          jobId={jobId}
          requirements={requirements}
          canEdit={canDraft}
          onChange={updateRequirements}
        />
      ) : null}
    </>
  );
}
