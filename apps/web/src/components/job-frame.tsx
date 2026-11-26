"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, apiFailureMessage, getJob, type Job, type JobState } from "@/lib/api";
import { StatusLabel } from "@/components/job-list";
import { JobPath } from "@/components/job-path";
import { stepOfPath, stepStates } from "@/lib/job-steps";

/** The answer of `GET /v1/jobs/<id>`: still on its way, arrived, not there, or failed. */
type Loaded =
  | { kind: "loading" }
  | { kind: "ok"; job: Job }
  | { kind: "missing" }
  | { kind: "failed"; message: string };

/**
 * What every step of a job can ask for: the job, and a way to say that a
 * step changed where the job stands (its requirements were confirmed, or
 * opened for editing again).
 */
type JobContextValue = {
  job: Job;
  setJobState: (change: JobState) => void;
};

const JobContext = createContext<JobContextValue | null>(null);

/**
 * The job whose page this is. Only for the pages of a job's steps, which the
 * frame below wraps: the frame draws them only once the job has arrived, so
 * a step never has to deal with "still loading".
 */
export function useJob(): JobContextValue {
  const value = useContext(JobContext);
  if (!value) throw new Error("useJob was called outside a job's page");
  return value;
}

/**
 * The frame around every step of one job: the job's title and status, and
 * the row of steps. Under them stands the one step that is on the screen,
 * handed in as `children`.
 *
 * It asks the API for the job once and shares it with every step, so moving
 * from one step to the next does not load the job again. Each step loads its
 * own data when it is opened.
 *
 * The ID comes from the address, so anyone can type any ID. That is safe: the
 * API looks for the job inside the signed-in user's company only, and answers
 * "not found" for an ID of another company exactly as for one that does not
 * exist.
 */
export function JobFrame({ jobId, children }: { jobId: string; children: ReactNode }) {
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  const pathname = usePathname();

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

  // Only the two fields that a step can change are put into the job.
  const setJobState = (change: JobState) =>
    setState((current) =>
      current.kind === "ok" ? { kind: "ok", job: { ...current.job, ...change } } : current,
    );

  return (
    <JobContext.Provider value={{ job, setJobState }}>
      {/*
        The room at the bottom is for the bar with the buttons, which lies
        over the page. The frame takes the full width of the page; a step
        that reads better narrow sets its own width.
      */}
      <div className="pb-24">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-2xl font-semibold break-words">{job.title}</h1>
          <StatusLabel status={job.status} />
        </div>

        <div className="max-w-4xl">
          <JobPath jobId={job.id} states={stepStates(job.status)} viewing={stepOfPath(pathname)} />
        </div>

        <div className="mt-8">{children}</div>
      </div>
    </JobContext.Provider>
  );
}
