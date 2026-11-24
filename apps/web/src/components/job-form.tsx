"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ApiError, apiFailureMessage, createJob } from "@/lib/api";
import { BUTTON_CLASSES, FIELD_CLASSES } from "@/lib/styles";
import {
  addDraft,
  NO_SUBJECT_WORDS,
  PHRASES_MAX,
  SubjectWordsField,
  type SubjectWords,
} from "@/components/subject-words-field";

// The limits of a job. The API checks the same numbers again
// (`services/api/src/services/job.service.ts`). Change both together.
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 20_000;

/** When HR leaves the date as it is, mail is looked at from this many days back. */
const DEFAULT_DAYS_BACK = 7;

/** The furthest back the date may be. The mail search covers 365 days at most. */
const MAX_DAYS_BACK = 365;

/**
 * The date `offsetDays` away from today on the user's own computer, in the
 * form a date field uses: `YYYY-MM-DD`. The user's own day is used, not the
 * server's, because "today" differs between time zones.
 */
function localDay(offsetDays: number): string {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

/**
 * The form that creates a job: a title, the job description, the subject
 * words and the posting date. Saving only stores the job, as a draft. Nothing
 * reads mail or CVs because a job was created.
 */
export function JobForm() {
  const router = useRouter();

  // The three dates the form needs, worked out once when the form appears.
  const [days] = useState(() => ({
    suggested: localDay(-DEFAULT_DAYS_BACK),
    earliest: localDay(-MAX_DAYS_BACK),
    today: localDay(0),
  }));

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectWords, setSubjectWords] = useState<SubjectWords>(NO_SUBJECT_WORDS);
  const [postingDate, setPostingDate] = useState(days.suggested);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The one-time key of this form. It is made on the first click of "Create
  // job" and sent again on every retry, so the API can tell "the same job
  // sent twice" from "a second job": it never saves two jobs under one key.
  // A ref, not state, because changing it must not redraw the form.
  const createKey = useRef<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);

    // Text still in the subject field becomes a chip, so a phrase that was
    // typed but never confirmed with Enter is not lost.
    const words = addDraft(subjectWords);
    setSubjectWords(words);
    if (words.draft !== "") {
      // It could not become a chip. The line under the field says why.
      setProblem("Correct the subject words first.");
      return;
    }
    if (words.phrases.length === 0) {
      setProblem("Add at least one subject phrase.");
      return;
    }
    // The fields are `required`, but the browser accepts spaces alone.
    if (title.trim() === "" || description.trim() === "") {
      setProblem("Fill in the title and the job description.");
      return;
    }

    createKey.current ??= crypto.randomUUID();
    setBusy(true);
    try {
      const { job } = await createJob({
        title,
        description,
        subjectWords: words.phrases,
        // An emptied date field is not sent, and the API then uses 7 days back.
        ...(postingDate === "" ? {} : { postingDate }),
        createKey: createKey.current,
      });

      // Next.js keeps a page that was left alive in the background, with what
      // was typed into it. The form is emptied and its key dropped, so "New
      // job" starts fresh next time and can never hand back this job again.
      createKey.current = null;
      setTitle("");
      setDescription("");
      setSubjectWords(NO_SUBJECT_WORDS);
      setPostingDate(days.suggested);
      router.push(`/jobs/${job.id}`);
    } catch (error) {
      // No answer at all: the job may or may not have been saved. The key
      // stays, so clicking again is safe either way.
      const retryHint =
        error instanceof ApiError ? "" : ". Click again: the job is never saved twice";
      setProblem(`${apiFailureMessage(error)}${retryHint}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-3xl space-y-5 rounded-xl border border-brand-navy/15 bg-white p-6">
      <label className="block text-sm font-medium">
        Title
        <span className="ml-2 font-normal text-brand-light-navy">
          The job&apos;s name in your job list, for example &quot;Senior Accountant, Lahore&quot;.
        </span>
        <input
          type="text"
          required
          maxLength={TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={FIELD_CLASSES}
        />
      </label>

      <label className="block text-sm font-medium">
        Job description
        <textarea
          required
          maxLength={DESCRIPTION_MAX}
          rows={12}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={FIELD_CLASSES}
        />
      </label>

      <div className="text-sm font-medium">
        <label htmlFor="job-subject-words">Subject words</label>
        <span className="ml-2 font-normal text-brand-light-navy">
          What applicants write in the email subject, for example &quot;Accountant&quot;. Up to{" "}
          {PHRASES_MAX} phrases.
        </span>
        <SubjectWordsField id="job-subject-words" value={subjectWords} onChange={setSubjectWords} />
      </div>

      <label className="block text-sm font-medium">
        Posting date
        <span className="ml-2 font-normal text-brand-light-navy">
          Mail from this day onward is looked at. Empty means {DEFAULT_DAYS_BACK} days back.
        </span>
        <input
          type="date"
          min={days.earliest}
          max={days.today}
          value={postingDate}
          onChange={(e) => setPostingDate(e.target.value)}
          className={`${FIELD_CLASSES} block max-w-52`}
        />
      </label>

      {problem ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>
      ) : null}

      <button type="submit" disabled={busy} className={`px-4 py-2.5 ${BUTTON_CLASSES}`}>
        {busy ? "Saving..." : "Create job"}
      </button>
    </form>
  );
}
