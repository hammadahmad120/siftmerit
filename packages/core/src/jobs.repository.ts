import type { SupabaseClient } from "@supabase/supabase-js";
import { toDatabaseError } from "./database.js";
import { forTenant } from "./tenant-db.js";

/**
 * Where a job stands. A new job is a draft; `open` and `closed` are set by
 * later steps (confirming the requirements, closing the job). What is running
 * at the moment is not a job status: that is read from `work_runs`.
 */
export type JobStatus = "draft" | "open" | "closed";

export type JobRow = {
  id: string;
  tenant_id: string;
  /** The job's short name on our screens. Never used to search mail. */
  title: string;
  description: string;
  /** The phrases looked for in email subjects. 1 to 10. */
  subject_words: string[];
  /** A plain date, `YYYY-MM-DD`. Mail from this day onward is looked at. */
  posting_date: string;
  status: JobStatus;
  /** The one-time key the form sent. Allowed once per company. */
  create_key: string;
  /** The user who created the job, or null when that account was deleted. */
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** The short fields of a job, for the list. The description is left out. */
export type JobSummaryRow = Pick<
  JobRow,
  "id" | "title" | "subject_words" | "status" | "posting_date" | "created_at"
>;

export type NewJob = {
  title: string;
  description: string;
  subjectWords: string[];
  postingDate: string;
  createKey: string;
  createdBy: string;
};

/**
 * The company already has a job saved under this one-time key, so the
 * database refused a second one. See `insert`.
 */
export class JobCreateKeyUsedError extends Error {
  constructor() {
    super("A job with this one-time key already exists");
    this.name = "JobCreateKeyUsedError";
  }
}

/** The database's code for "this would break a unique rule". */
const UNIQUE_RULE_BROKEN = "23505";

const COLUMNS =
  "id, tenant_id, title, description, subject_words, posting_date, status, create_key, created_by, created_at, updated_at";

const SUMMARY_COLUMNS = "id, title, subject_words, status, posting_date, created_at";

/**
 * The jobs table. It lives in core because the worker reads jobs too, from
 * the task that searches mail for a job.
 *
 * Company separation: every function takes the company's ID first and reaches
 * the table only through `forTenant`, which adds the company filter itself.
 * So a job is only ever found inside its own company.
 */
export class JobRepository {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Adds a job as a draft. The database makes its ID.
   *
   * A one-time key is allowed once per company. That is a rule in the
   * database, not a check made here first: two requests at the same moment
   * would both pass a check, but the database lets only one row in. The
   * refused one gets a `JobCreateKeyUsedError`, and the caller then reads the
   * job that was saved, with `findByCreateKey`.
   */
  async insert(tenantId: string, job: NewJob): Promise<JobRow> {
    const { data, error } = await forTenant(this.db, tenantId)
      .insert("jobs", {
        title: job.title,
        description: job.description,
        subject_words: job.subjectWords,
        posting_date: job.postingDate,
        create_key: job.createKey,
        created_by: job.createdBy,
      })
      .select(COLUMNS)
      .single();

    if (error?.code === UNIQUE_RULE_BROKEN) throw new JobCreateKeyUsedError();
    if (error) throw toDatabaseError("jobs insert", error);
    return data as JobRow;
  }

  /** One job of this company, or null. `jobId` must have the form of an ID. */
  async findById(tenantId: string, jobId: string): Promise<JobRow | null> {
    const { data, error } = await forTenant(this.db, tenantId)
      .select("jobs", COLUMNS)
      .eq("id", jobId)
      .maybeSingle();

    if (error) throw toDatabaseError("jobs find by id", error);
    return data as JobRow | null;
  }

  /** The job this company saved under a one-time key, or null. */
  async findByCreateKey(tenantId: string, createKey: string): Promise<JobRow | null> {
    const { data, error } = await forTenant(this.db, tenantId)
      .select("jobs", COLUMNS)
      .eq("create_key", createKey)
      .maybeSingle();

    if (error) throw toDatabaseError("jobs find by create key", error);
    return data as JobRow | null;
  }

  /** A company's newest jobs, newest first, with the short fields only. */
  async listRecent(tenantId: string, limit: number): Promise<JobSummaryRow[]> {
    const { data, error } = await forTenant(this.db, tenantId)
      .select("jobs", SUMMARY_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (error) throw toDatabaseError("jobs list recent", error);
    return (data ?? []) as JobSummaryRow[];
  }
}
