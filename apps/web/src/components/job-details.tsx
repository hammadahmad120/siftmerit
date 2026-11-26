"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  apiFailureMessage,
  getJob,
  type Job,
  type JobState as JobStatusChange,
} from "@/lib/api";
import { plainDate, StatusLabel } from "@/components/job-list";
import { JobPath, type PathStep, type StepState } from "@/components/job-path";
import { JobRequirements } from "@/components/job-requirements";
import { JobStep } from "@/components/job-step";
import { PhraseChip } from "@/components/subject-words-field";

/** The answer of `GET /v1/jobs/<id>`: still on its way, arrived, not there, or failed. */
type JobState =
  | { kind: "loading" }
  | { kind: "ok"; job: Job }
  | { kind: "missing" }
  | { kind: "failed"; message: string };

/**
 * One job, as a guided path. A row of five steps stands at the top, and under
 * it one card per step: a finished step is folded into one line, the current
 * one is open, and a later one is locked and says what unlocks it. So HR
 * always sees where she is, why the step matters and what comes next.
 *
 * Only the first two steps exist so far: the job itself, and its
 * requirements. The other three show as locked; each later task switches its
 * own step on.
 *
 * The ID comes from the address, so anyone can type any ID. That is safe: the
 * API looks for the job inside the signed-in user's company only, and answers
 * "not found" for an ID of another company exactly as for one that does not
 * exist.
 */
export function JobDetails({ jobId }: { jobId: string }) {
  const [state, setState] = useState<JobState>({ kind: "loading" });

  useEffect(() => {
    // If the page is left before the answer arrives, the answer is dropped.
    let left = false;

    getJob(jobId)
      .then((answer) => {
        if (!left) setState({ kind: "ok", job: answer.job });
      })
      .catch((error: unknown) => {
        if (left) return;
        const missing = error instanceof ApiError && error.code === "job_not_found";
        setState(missing ? { kind: "missing" } : { kind: "failed", message: apiFailureMessage(error) });
      });

    return () => {
      left = true;
    };
  }, [jobId]);

  if (state.kind === "loading") {
    return <p className="text-sm text-brand-light-navy">Loading the job...</p>;
  }

  if (state.kind === "failed") return <p className="text-sm text-red-700">{state.message}</p>;

  if (state.kind === "missing") {
    return (
      <>
        <h1 className="text-2xl font-semibold">This job does not exist</h1>
        <p className="mt-2 text-sm text-brand-light-navy">
          It may have been removed, or the address is wrong.
        </p>
      </>
    );
  }

  const { job } = state;

  // The requirements were confirmed, or opened for editing again. Only the
  // two fields that such a step changes are put into the job on the page.
  const onJobState = (change: JobStatusChange) =>
    setState((current) =>
      current.kind === "ok" ? { kind: "ok", job: { ...current.job, ...change } } : current,
    );

  // Where each step stands follows from the job's status alone. A draft has
  // its requirements still to confirm; after that the job is open.
  const confirmed = job.status !== "draft";
  const requirementsState: StepState = confirmed ? "done" : "current";
  const applicationsState: StepState = confirmed ? "current" : "locked";

  const steps: PathStep[] = [
    { key: "job", title: "Job", who: "Created", state: "done" },
    {
      key: "requirements",
      number: 1,
      title: "Requirements",
      who: "AI drafts, you confirm",
      state: requirementsState,
    },
    {
      key: "applications",
      number: 2,
      title: "Applications",
      who: "We find them in your mailbox",
      state: applicationsState,
    },
    { key: "reading", number: 3, title: "CV reading", who: "AI reads every CV", state: "locked" },
    {
      key: "candidates",
      number: 4,
      title: "Candidates",
      who: "Best first, with proof",
      state: "locked",
    },
  ];

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-2xl font-semibold break-words">{job.title}</h1>
        <StatusLabel status={job.status} />
      </div>

      <JobPath steps={steps} />

      <div className="mt-6">
        <JobStep
          title="Job"
          state="done"
          summary={`Created ${new Date(job.createdAt).toLocaleDateString()} · Mail from ${plainDate(job.postingDate)} onward`}
        >
          <h3 className="text-sm font-medium">Subject words</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {job.subjectWords.map((phrase) => (
              <PhraseChip key={phrase} phrase={phrase} />
            ))}
          </div>

          <h3 className="mt-5 text-sm font-medium">Job description</h3>
          {/*
            Shown as plain text, never as HTML: React writes the text out as
            it is, so nothing inside it can run as code. `whitespace-pre-wrap`
            keeps the line breaks HR typed.
          */}
          <p className="mt-2 text-sm break-words whitespace-pre-wrap">{job.description}</p>
        </JobStep>

        <JobStep
          number={1}
          title="Requirements"
          state={requirementsState}
          summary={
            job.requirementsConfirmedAt
              ? `Confirmed on ${new Date(job.requirementsConfirmedAt).toLocaleDateString()}`
              : "Confirmed"
          }
        >
          <JobRequirements
            jobId={job.id}
            jobStatus={job.status}
            confirmedAt={job.requirementsConfirmedAt}
            onJobState={onJobState}
          />
        </JobStep>

        <JobStep
          number={2}
          title="Applications"
          state={applicationsState}
          what="We search your mailbox for the emails whose subject holds your subject words, and list them for you to pick."
          unlocks="Confirm the requirements to unlock this step."
        >
          <p className="text-sm">
            The requirements are confirmed, so this step is open. It is not built yet: finding
            the applications in your mailbox comes next.
          </p>
        </JobStep>

        <JobStep
          number={3}
          title="CV reading"
          state="locked"
          what="The AI reads every CV against your requirements and gives a tick for each one, with the line of the CV that proves it."
          unlocks="Unlocks when the applications are picked."
        />

        <JobStep
          number={4}
          title="Candidates"
          state="locked"
          what="The candidates who meet every must-have, best first, with the proof for every tick."
          unlocks="Unlocks when the CVs are read."
        />
      </div>
    </div>
  );
}
