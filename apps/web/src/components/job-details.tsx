"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiFailureMessage, getJob, type Job } from "@/lib/api";
import { plainDate, STATUS_LABELS } from "@/components/job-list";
import { PhraseChip } from "@/components/subject-words-field";

/** The answer of `GET /v1/jobs/<id>`: still on its way, arrived, not there, or failed. */
type JobState =
  | { kind: "loading" }
  | { kind: "ok"; job: Job }
  | { kind: "missing" }
  | { kind: "failed"; message: string };

/**
 * One job: its title, status, dates, subject words and description. Later
 * tasks add the requirements, the emails and the candidates to this page.
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
          It may have been removed, or the address is wrong.{" "}
          <Link href="/jobs" className="text-brand-purple hover:underline">
            Open the job list
          </Link>
          .
        </p>
      </>
    );
  }

  const { job } = state;

  return (
    <>
      <h1 className="text-2xl font-semibold">{job.title}</h1>
      <p className="mt-2 text-sm text-brand-light-navy">
        {STATUS_LABELS[job.status]} · Mail from {plainDate(job.postingDate)} onward · Created{" "}
        {new Date(job.createdAt).toLocaleDateString()}
      </p>

      <section className="mt-6 max-w-3xl rounded-xl border border-brand-navy/15 bg-white p-5">
        <h2 className="font-medium">Subject words</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {job.subjectWords.map((phrase) => (
            <PhraseChip key={phrase} phrase={phrase} />
          ))}
        </div>
      </section>

      <section className="mt-6 max-w-3xl rounded-xl border border-brand-navy/15 bg-white p-5">
        <h2 className="font-medium">Job description</h2>
        {/*
          Shown as plain text, never as HTML: React writes the text out as it
          is, so nothing inside it can run as code. `whitespace-pre-wrap`
          keeps the line breaks HR typed.
        */}
        <p className="mt-3 text-sm break-words whitespace-pre-wrap">{job.description}</p>
      </section>
    </>
  );
}
