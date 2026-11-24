"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFailureMessage, listJobs, type JobStatus, type JobSummary } from "@/lib/api";

/** The API sends at most this many jobs. There is no paging yet. */
const LIST_LIMIT = 100;

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
 * The company's jobs, newest first, each a link to its own page. The company
 * is never sent: the API finds it from the sign-in token.
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
      <p className="mt-6 text-sm text-brand-light-navy">
        No jobs yet. Create the first one with &quot;New job&quot;.
      </p>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-brand-navy/15 bg-white px-5 py-2">
      <table className="w-full text-left text-sm">
        <thead className="text-brand-light-navy">
          <tr>
            <th className="py-2 pr-4 font-medium">Title</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Posting date</th>
            <th className="py-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-t border-brand-navy/10">
              <td className="py-2.5 pr-4">
                <Link href={`/jobs/${job.id}`} className="font-medium text-brand-purple hover:underline">
                  {job.title}
                </Link>
              </td>
              <td className="py-2.5 pr-4 text-brand-light-navy">{STATUS_LABELS[job.status]}</td>
              <td className="py-2.5 pr-4">{plainDate(job.postingDate)}</td>
              <td className="py-2.5">{new Date(job.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {jobs.length >= LIST_LIMIT ? (
        <p className="border-t border-brand-navy/10 py-2 text-sm text-brand-light-navy">
          These are the newest {LIST_LIMIT} jobs. Older ones are not shown yet.
        </p>
      ) : null}
    </div>
  );
}
