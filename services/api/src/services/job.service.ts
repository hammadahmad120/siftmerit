import {
  JobCreateKeyUsedError,
  type JobRepository,
  type JobRow,
  type JobSummaryRow,
} from "@siftmerit/core";
import { z } from "zod";
import { NotFoundError, ValidationError } from "../lib/errors.js";

// The limits of a job. The form in the web app repeats them
// (`apps/web/src/components/job-form.tsx`), because the web app cannot import
// server code. Change both together.
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 20_000;
const PHRASES_MAX = 10;
const PHRASE_MIN = 2;
const PHRASE_MAX = 100;

/** When no posting date is sent, mail is looked at from this many days back. */
const DEFAULT_DAYS_BACK = 7;

/** The furthest back a posting date may be. mailsift searches 365 days at most. */
const MAX_DAYS_BACK = 365;

/** How many jobs the list holds. There is no paging yet. */
const LIST_LIMIT = 100;

/** Postgres cannot store this character in a text column. */
const NUL = "\u0000";

function text(max: number) {
  return z
    .string()
    .refine((value) => !value.includes(NUL), "holds a character that cannot be saved")
    .trim()
    .min(1)
    .max(max);
}

/**
 * Tidies the subject phrases: spaces around a phrase go, several spaces
 * inside it become one, empty phrases are dropped, and a phrase that is
 * already in the list is dropped. Capital letters do not make a phrase
 * different: "Accountant" and "accountant" are the same phrase, and the first
 * spelling is kept.
 *
 * The form shows "Already added" for a repeat, so a repeat that still arrives
 * here is dropped quietly, not refused.
 */
function tidyPhrases(phrases: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of phrases) {
    const phrase = raw.replace(/\s+/g, " ").trim();
    const key = phrase.toLowerCase();
    if (phrase === "" || seen.has(key)) continue;
    seen.add(key);
    result.push(phrase);
  }
  return result;
}

/**
 * What a caller may send to create a job. The company and the user are not
 * part of it: both come from the sign-in check.
 */
export const createJobRequestSchema = z.object({
  title: text(TITLE_MAX),
  description: text(DESCRIPTION_MAX),
  subjectWords: z
    .array(z.string().refine((value) => !value.includes(NUL)))
    .transform(tidyPhrases)
    .pipe(z.array(z.string().min(PHRASE_MIN).max(PHRASE_MAX)).min(1).max(PHRASES_MAX)),
  /** A plain date, `YYYY-MM-DD`. Left out: 7 days back. */
  postingDate: z.iso.date().optional(),
  /** The one-time key the form made. The same key never saves a second job. */
  createKey: z.uuid(),
});

export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

/** What the web app may know about a job. The company ID and the key are left out. */
export type JobView = {
  id: string;
  title: string;
  description: string;
  subjectWords: string[];
  postingDate: string;
  status: string;
  createdAt: string;
};

/** A job in the list: the short fields only. The description is left out. */
export type JobSummaryView = Omit<JobView, "description">;

function toView(row: JobRow): JobView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subjectWords: row.subject_words,
    postingDate: row.posting_date,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toSummaryView(row: JobSummaryRow): JobSummaryView {
  return {
    id: row.id,
    title: row.title,
    subjectWords: row.subject_words,
    postingDate: row.posting_date,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** The date `offsetDays` away from today, by the server's clock (UTC), as `YYYY-MM-DD`. */
function utcDay(offsetDays: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day.toISOString().slice(0, 10);
}

/**
 * The posting date to save. Two dates written as `YYYY-MM-DD` compare
 * correctly as plain text, so no date arithmetic is needed for the checks.
 *
 * One day of room is given on both sides. The date is typed by a person in
 * their own time zone, and their "today" can be the server's "tomorrow" or
 * "yesterday".
 */
function choosePostingDate(given: string | undefined): string {
  if (given === undefined) return utcDay(-DEFAULT_DAYS_BACK);
  if (given > utcDay(1)) {
    throw new ValidationError("The posting date cannot be in the future.");
  }
  if (given < utcDay(-(MAX_DAYS_BACK + 1))) {
    throw new ValidationError(`The posting date cannot be more than ${MAX_DAYS_BACK} days back.`);
  }
  return given;
}

/**
 * Jobs: creating one, listing a company's jobs and reading one. A job starts
 * as a draft; nothing reads mail or CVs because a job was created.
 *
 * In every function `tenantId` and `userId` must come from the sign-in check,
 * never from the request.
 */
export class JobService {
  constructor(private readonly jobs: JobRepository) {}

  /**
   * Saves a new job. `created` is false when the company already has a job
   * under the same one-time key: nothing new is saved then, and the job that
   * was saved the first time is given back. So a double click, or a second
   * click after an answer that got lost, ends on the same job.
   */
  async create(
    tenantId: string,
    userId: string,
    request: CreateJobRequest,
  ): Promise<{ job: JobView; created: boolean }> {
    const postingDate = choosePostingDate(request.postingDate);

    try {
      const row = await this.jobs.insert(tenantId, {
        title: request.title,
        description: request.description,
        subjectWords: request.subjectWords,
        postingDate,
        createKey: request.createKey,
        createdBy: userId,
      });
      return { job: toView(row), created: true };
    } catch (error) {
      if (!(error instanceof JobCreateKeyUsedError)) throw error;

      const existing = await this.jobs.findByCreateKey(tenantId, request.createKey);
      // The database refused the key, so the job must be there. If it is not,
      // something else broke a rule, and that is a fault of ours.
      if (!existing) throw new Error("A job insert was refused, but no job has that key");
      return { job: toView(existing), created: false };
    }
  }

  /** The company's newest jobs, newest first. */
  async list(tenantId: string): Promise<JobSummaryView[]> {
    const rows = await this.jobs.listRecent(tenantId, LIST_LIMIT);
    return rows.map(toSummaryView);
  }

  /**
   * One job. An ID that does not exist, an ID of another company's job and
   * text that is no ID at all get the same answer, so nobody can learn from
   * the answer whether an ID exists.
   */
  async get(tenantId: string, jobId: string): Promise<JobView> {
    const row = z.uuid().safeParse(jobId).success
      ? await this.jobs.findById(tenantId, jobId)
      : null;
    if (!row) {
      throw new NotFoundError("This job does not exist.", "job_not_found");
    }
    return toView(row);
  }
}
