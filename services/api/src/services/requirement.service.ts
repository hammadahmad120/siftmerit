import {
  QueueUnavailableError,
  WorkRunAlreadyActiveError,
  type IfSilent,
  type JobRepository,
  type JobRequirementRepository,
  type JobRequirementRow,
  type RequirementKind,
  type RequirementsQueue,
  type WorkRunRepository,
  type WorkRunRow,
} from "@siftmerit/core";
import { z } from "zod";
import { ConflictError, NotFoundError, ServiceUnavailableError } from "../lib/errors.js";

/**
 * An unfinished draft run that has not changed for this long is taken to be
 * stuck and is closed before a new one starts. A healthy draft takes at most
 * about three minutes: three tries of up to a minute each, and the waits
 * between them. The job's page stops asking after the same five minutes.
 */
const STALE_AFTER_MS = 5 * 60 * 1000;

/** What the web app may know about a requirement. The company ID is left out. */
export type RequirementView = {
  id: string;
  text: string;
  /** `must`, `preferred` or `nice`. */
  kind: RequirementKind;
  /** What a CV that says nothing about it means: `ask` or `missing`. */
  ifSilent: IfSilent;
  /** Its place in the list, starting at 1. */
  position: number;
};

/** What the web app may know about a draft run. The company ID is left out. */
export type DraftRunView = {
  id: string;
  /** `waiting`, `running`, `done` or `failed`. */
  status: string;
  /** Which try the run is on. 0 until a worker has started it. */
  attempt: number;
  /** A short fixed word for why it failed, or null. */
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

/** A job's requirements, and its newest draft run or null when it never had one. */
export type JobRequirementsView = {
  requirements: RequirementView[];
  draft: DraftRunView | null;
};

function toView(row: JobRequirementRow): RequirementView {
  return {
    id: row.id,
    text: row.text,
    kind: row.kind,
    ifSilent: row.if_silent,
    position: row.position,
  };
}

function toRunView(row: WorkRunRow): DraftRunView {
  return {
    id: row.id,
    status: row.status,
    attempt: row.attempt,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function jobNotFound(): NotFoundError {
  return new NotFoundError("This job does not exist.", "job_not_found");
}

/**
 * The requirements of a job: reading the list, and starting a draft. This
 * service makes no AI call itself. It saves a run's row and adds a note to
 * the queue; the worker, a separate program, makes the call a moment later.
 * Editing and confirming come with later steps.
 *
 * In every function `tenantId` must come from the sign-in check, never from
 * the request.
 */
export class RequirementService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly requirements: JobRequirementRepository,
    private readonly workRuns: WorkRunRepository,
    private readonly queue: RequirementsQueue,
  ) {}

  /**
   * A job's requirements in the order of the list, together with its newest
   * draft run. Both come in one answer on purpose: the page asks this while
   * a draft runs, and the moment the run says `done` the new list is in the
   * same answer.
   *
   * An ID that does not exist, an ID of another company's job and text that
   * is no ID at all get the same "not found" answer, as for the job itself.
   */
  async get(tenantId: string, jobId: string): Promise<JobRequirementsView> {
    if (!z.uuid().safeParse(jobId).success) throw jobNotFound();

    // Asked side by side: the three do not depend on each other.
    const [job, rows, run] = await Promise.all([
      this.jobs.findById(tenantId, jobId),
      this.requirements.listForJob(tenantId, jobId),
      this.workRuns.findNewestForJob(tenantId, jobId, "requirements_draft"),
    ]);
    if (!job) throw jobNotFound();

    return { requirements: rows.map(toView), draft: run ? toRunView(run) : null };
  }

  /**
   * Starts a draft of a job's requirements. The order matters:
   *
   * 1. The job must be the company's and still a draft. A job whose
   *    requirements are confirmed is refused with 409.
   * 2. A run of this job that stopped moving long ago is closed, so one stuck
   *    run cannot block the button for ever.
   * 3. The run's row is saved, with the status `waiting`. What HR sees lives
   *    in Postgres, so the row must exist before any work can. If the job
   *    already has an unfinished draft, the database refuses the row and the
   *    caller gets 409 "already drafting": nothing is queued or paid twice.
   * 4. Then the work item is queued. It carries IDs only.
   * 5. If queuing fails, the row is marked failed, so it does not say
   *    "waiting" for work that will never come.
   */
  async startDraft(tenantId: string, requestId: string, jobId: string): Promise<DraftRunView> {
    if (!z.uuid().safeParse(jobId).success) throw jobNotFound();

    const job = await this.jobs.findById(tenantId, jobId);
    if (!job) throw jobNotFound();
    if (job.status !== "draft") {
      throw new ConflictError("This job's requirements are already confirmed.", "job_not_draft");
    }

    await this.workRuns.closeStale(tenantId, "requirements_draft", STALE_AFTER_MS, jobId);

    let run: WorkRunRow;
    try {
      run = await this.workRuns.insert(tenantId, "requirements_draft", jobId);
    } catch (error) {
      if (error instanceof WorkRunAlreadyActiveError) {
        throw new ConflictError(
          "The requirements of this job are already being drafted.",
          "already_drafting",
        );
      }
      throw error;
    }

    try {
      await this.queue.add({ workRunId: run.id, tenantId, jobId, requestId });
    } catch (error) {
      if (error instanceof QueueUnavailableError) {
        await this.workRuns.markFailed(tenantId, run.id, "queue_unavailable");
        throw new ServiceUnavailableError(
          "The work queue cannot be reached. Try again in a moment.",
          "queue_unavailable",
        );
      }
      throw error;
    }

    return toRunView(run);
  }
}
