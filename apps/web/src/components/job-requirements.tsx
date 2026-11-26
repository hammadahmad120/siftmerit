"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  apiFailureMessage,
  confirmRequirements,
  getRequirements,
  reopenRequirements,
  startRequirementsDraft,
  type DraftRun,
  type JobRequirementsAnswer,
  type Requirement,
  type RequirementKind,
} from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useJob } from "@/components/job-frame";
import { RequirementList } from "@/components/requirement-list";
import { StepBar } from "@/components/step-bar";
import { stepPath } from "@/lib/job-steps";
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

/**
 * From this many must-haves on, a note stands beside "Confirm": every
 * must-have is one more way for a good candidate to be left out. It is only
 * a note; HR decides.
 */
const MANY_MUST_HAVES = 7;

/**
 * What going back to editing costs, as the lines of the popup that asks
 * before it. Each line must be true at the moment it is shown.
 *
 * Today no later step has used a confirmed list, so going back costs
 * nothing. A task that adds work after this step adds its own line here, for
 * example how many CVs were read against the list and what a change to it
 * would redo.
 */
function whatGoingBackCosts(): string[] {
  return [
    "Nothing has been done with this list yet, so going back costs nothing.",
    "The next step, Applications, is locked again until you confirm.",
  ];
}

/**
 * The sentence HR reads when a step was refused. A refusal the API expects
 * (the list has no must-have, the job changed meanwhile) is its own plain
 * sentence. Anything else gets the usual line with the request ID.
 */
function whyRefused(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return error.message;
  return apiFailureMessage(error);
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
 * The "Requirements" step of a job: the card that asks HR to let the AI
 * draft the list, what the draft is doing, the list itself, and at the bottom
 * the bar with the step's action. It loads the list when the step is opened.
 *
 * The draft is not made by this page and not by the API. The click only asks
 * the API to queue it; the worker makes the AI call. So the page shows one of
 * four states, read from the API: no list yet, drafting, the list, or failed
 * with the reason. While a draft is unfinished the page asks again every few
 * seconds; `useAskWhile` holds every case in which that asking stops.
 *
 * While the job is a draft HR edits the list here, and every change is saved
 * at once; see `RequirementList`. The draft button shows only while the job
 * has no requirements.
 *
 * "Confirm requirements", in the bar, ends the step: the job becomes open,
 * the next step is unlocked and HR is taken to it. A confirmed list is
 * read-only. "Edit requirements" takes the job back to a draft, after a
 * popup that says what going back costs.
 *
 * Like the job itself, everything is asked for inside the signed-in user's
 * company only; the API answers "not found" for another company's job.
 */
export function JobRequirements() {
  // The job comes from the frame around every step. `setJobState` tells the
  // frame that this step changed where the job stands.
  const { job, setJobState } = useJob();
  const jobId = job.id;
  const jobStatus = job.status;
  const confirmedAt = job.requirementsConfirmedAt;
  const router = useRouter();
  const [state, setState] = useState<RequirementsState>({ kind: "loading" });
  // "Confirm requirements" is on its way, and the sentence when it was refused.
  const [confirming, setConfirming] = useState(false);
  const [confirmProblem, setConfirmProblem] = useState<string | null>(null);
  // The popup in front of "Edit requirements": shown, being carried out, refused.
  const [askingToReopen, setAskingToReopen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenProblem, setReopenProblem] = useState<string | null>(null);
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

  /**
   * "Confirm requirements". One click, with no question in front of it,
   * because it can be undone and costs no AI money. The job becomes open,
   * the next step is unlocked, and HR is taken there.
   */
  async function confirm() {
    setConfirming(true);
    setConfirmProblem(null);
    try {
      const answer = await confirmRequirements(jobId);
      if (!shownRef.current) return;
      setJobState(answer.job);
      router.push(stepPath(jobId, "applications"));
    } catch (error) {
      if (!shownRef.current) return;
      if (!(error instanceof ApiError && error.status === 401)) setConfirmProblem(whyRefused(error));
    } finally {
      if (shownRef.current) setConfirming(false);
    }
  }

  /** The "yes" of the popup in front of "Edit requirements": the job is a draft again. */
  async function reopen() {
    setReopening(true);
    setReopenProblem(null);
    try {
      const answer = await reopenRequirements(jobId);
      if (!shownRef.current) return;
      setAskingToReopen(false);
      setJobState(answer.job);
    } catch (error) {
      if (!shownRef.current) return;
      if (!(error instanceof ApiError && error.status === 401)) setReopenProblem(whyRefused(error));
    } finally {
      if (shownRef.current) setReopening(false);
    }
  }

  /** "Check again", after the page stopped asking: one call now, and a new round. */
  function checkAgain() {
    restart();
    void askAgain();
  }

  const heading = (
    <>
      <h2 className="text-lg font-semibold">
        <span className="font-normal text-brand-light-navy">Step 1: </span>Requirements
      </h2>
      <p className="mt-1 mb-5 text-sm text-brand-light-navy">AI drafts, you confirm</p>
    </>
  );

  if (state.kind !== "ok") {
    return (
      <>
        {heading}
        {state.kind === "loading" ? (
          <p className="text-sm text-brand-light-navy">Loading the requirements...</p>
        ) : null}
        {state.kind === "failed" ? <p className="text-sm text-red-700">{state.message}</p> : null}
        {state.kind === "missing" ? (
          <p className="text-sm text-brand-light-navy">This job does not exist.</p>
        ) : null}
        <StepBar step="requirements" />
      </>
    );
  }

  const { requirements } = state;
  const hasList = requirements.length > 0;
  const mustCount = requirements.filter((requirement) => requirement.kind === "must").length;
  // While the job is a draft, HR may draft the list and change it.
  const canDraft = jobStatus === "draft";
  const stuck = unfinished && gaveUp;
  const drafting = starting || (unfinished && !gaveUp);
  // A failed draft is only told while there is no list. With a list on the
  // page there is nothing to try again.
  const failedRun = !drafting && !hasList && draft?.status === "failed";

  // What the bar at the bottom says and offers. While the list can still be
  // changed, its button is the step's own action, "Confirm requirements",
  // and the line beside it says why the button is off when it is. Once the
  // list is confirmed there is nothing left to do here: the bar offers "Edit
  // requirements" and, by itself, "Next".
  let barNote: string = countLine(requirements);
  if (drafting) barNote = "The AI is drafting the list.";
  else if (!hasList) barNote = "Draft the requirements to go on.";
  else if (mustCount === 0) barNote = "Add at least one must-have to confirm.";

  return (
    <>
      {heading}

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
          {canDraft ? (
            <p className="mt-2 text-sm">
              Review the list and make it yours. Every change is saved at once. When it is right,
              confirm it to unlock the next step.
            </p>
          ) : (
            <p className="mt-2 text-sm">
              Confirmed
              {confirmedAt ? ` on ${new Date(confirmedAt).toLocaleDateString()}` : ""}. Every CV is
              checked against this list.
            </p>
          )}
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

      {/* Only a note. It never stops the confirm; HR decides. */}
      {hasList && canDraft && !drafting && mustCount >= MANY_MUST_HAVES ? (
        <p className="mt-6 rounded-lg bg-brand-cream px-3 py-2 text-sm">
          {mustCount} must-haves. A candidate who misses any one of them is left out of your main
          list. Keep must-have for real deal-breakers.
        </p>
      ) : null}

      {canDraft ? (
        <StepBar
          step="requirements"
          note={
            confirmProblem ? <span className="text-red-700">{confirmProblem}</span> : barNote
          }
          action={{
            label: "Confirm requirements",
            busyLabel: "Confirming...",
            busy: confirming,
            disabled: drafting || !hasList || mustCount === 0,
            onClick: () => void confirm(),
          }}
        />
      ) : (
        <StepBar
          step="requirements"
          note={countLine(requirements)}
          secondary={
            jobStatus === "open"
              ? {
                  label: "Edit requirements",
                  onClick: () => {
                    setReopenProblem(null);
                    setAskingToReopen(true);
                  },
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={askingToReopen}
        title="Edit the requirements again?"
        confirmLabel="Edit requirements"
        busyLabel="Opening..."
        busy={reopening}
        problem={reopenProblem}
        onConfirm={() => void reopen()}
        onCancel={() => setAskingToReopen(false)}
      >
        {whatGoingBackCosts().map((line) => (
          <p key={line}>{line}</p>
        ))}
      </ConfirmDialog>
    </>
  );
}
