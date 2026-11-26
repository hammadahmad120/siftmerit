"use client";

import { useJob } from "@/components/job-frame";
import { plainDate } from "@/components/job-list";
import { StepBar } from "@/components/step-bar";
import { PhraseChip } from "@/components/subject-words-field";

/**
 * The "Job" step: what HR entered when she created the job. It is done
 * before the job's page exists, so it is only looked at: the subject words,
 * the date mail is read from, and the job description.
 *
 * It needs no data of its own. The job comes from the frame around every
 * step.
 */
export function JobDetails() {
  const { job } = useJob();

  return (
    // Long text reads better in a narrow column.
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold">The job</h2>
      <p className="mt-1 text-sm text-brand-light-navy">
        Created {new Date(job.createdAt).toLocaleDateString()} · Mail from{" "}
        {plainDate(job.postingDate)} onward
      </p>

      <section className="mt-5 rounded-xl border border-brand-navy/15 bg-white p-5">
        <h3 className="font-medium">Subject words</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {job.subjectWords.map((phrase) => (
            <PhraseChip key={phrase} phrase={phrase} />
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-brand-navy/15 bg-white p-5">
        <h3 className="font-medium">Job description</h3>
        {/*
          Shown as plain text, never as HTML: React writes the text out as it
          is, so nothing inside it can run as code. `whitespace-pre-wrap`
          keeps the line breaks HR typed.
        */}
        <p className="mt-3 text-sm break-words whitespace-pre-wrap">{job.description}</p>
      </section>

      <StepBar step="details" />
    </div>
  );
}
