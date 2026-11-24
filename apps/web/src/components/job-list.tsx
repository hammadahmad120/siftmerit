"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFailureMessage, listJobs, type JobStatus, type JobSummary } from "@/lib/api";
import { PhraseChip } from "@/components/subject-words-field";

/** The API sends at most this many jobs. There is no paging yet. */
const LIST_LIMIT = 100;

/** A card shows this many subject phrases and then "+2 more", so cards stay the same height. */
const SHOWN_PHRASES = 3;

/** The word shown for a job's status. */
export const STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

/**
 * A plain date (`YYYY-MM-DD`) as the user's own computer writes dates. The
 * three numbers are handed over one by one: `new Date("2026-11-17")` would
 * read the text as midnight in UTC, which is the day before in some time zones.
 */
export function plainDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}

/**
 * A job's status as a small outlined label. It uses the colours the page
 * already has; green, amber and red are kept for the ticks.
 */
export function StatusLabel({ status }: { status: JobStatus }) {
  return (
    <span className="shrink-0 rounded-full border border-brand-navy/30 px-2.5 py-0.5 text-xs font-medium text-brand-light-navy">
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * One job as a card: its title and status, its subject words, and the two
 * dates. The whole card is one link to the job's page.
 */
function JobCard({ job }: { job: JobSummary }) {
  const shown = job.subjectWords.slice(0, SHOWN_PHRASES);
  const more = job.subjectWords.length - shown.length;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="flex h-full flex-col rounded-xl border border-brand-navy/15 bg-white p-5 hover:border-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 font-medium break-words">{job.title}</h2>
        <StatusLabel status={job.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {shown.map((phrase) => (
          <PhraseChip key={phrase} phrase={phrase} />
        ))}
        {more > 0 ? <span className="text-sm text-brand-light-navy">+{more} more</span> : null}
      </div>

      {/* `mt-auto` pushes the dates to the bottom, so they line up across a row of cards. */}
      <div className="mt-auto pt-4">
        <dl className="grid grid-cols-2 gap-3 border-t border-brand-navy/10 pt-3 text-sm">
          <div>
            <dt className="text-brand-light-navy">Mail from</dt>
            <dd>{plainDate(job.postingDate)}</dd>
          </div>
          <div>
            <dt className="text-brand-light-navy">Created</dt>
            <dd>{new Date(job.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}

/**
 * The company's jobs as cards, newest first, each a link to its own page. The
 * company is never sent: the API finds it from the sign-in token.
 */
export function JobList() {
  // `null` until the first answer has arrived.
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // The list is asked for each time the page appears, so a job that was just
  // created is in it.
  useEffect(() => {
    // If the page is left before the answer arrives, the answer is dropped.
    let left = false;

    listJobs()
      .then((answer) => {
        if (left) return;
        setJobs(answer.jobs);
        setProblem(null);
      })
      .catch((error: unknown) => {
        if (!left) setProblem(apiFailureMessage(error));
      });

    return () => {
      left = true;
    };
  }, []);

  if (problem) return <p className="mt-6 text-sm text-red-700">{problem}</p>;

  if (jobs === null) return <p className="mt-6 text-sm text-brand-light-navy">Loading the jobs...</p>;

  if (jobs.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-brand-navy/30 bg-white p-8 text-center">
        <p className="font-medium">No jobs yet</p>
        <p className="mt-1 text-sm text-brand-light-navy">
          Create the first one with &quot;New job&quot;.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* One column on a phone, two on a tablet, three on a laptop. */}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobCard job={job} />
          </li>
        ))}
      </ul>
      {jobs.length >= LIST_LIMIT ? (
        <p className="mt-4 text-sm text-brand-light-navy">
          These are the newest {LIST_LIMIT} jobs. Older ones are not shown yet.
        </p>
      ) : null}
    </>
  );
}
