import {
  IF_SILENT_MARKS,
  QueueUnavailableError,
  REQUIREMENT_KINDS,
  REQUIREMENT_TEXT_MAX,
  REQUIREMENTS_MAX,
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
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "../lib/errors.js";

/**
 * An unfinished draft run that has not changed for this long is taken to be
 * stuck and is closed before a new one starts. A healthy draft takes at most
 * about three minutes: three tries of up to a minute each, and the waits
 * between them. The job's page stops asking after the same five minutes.
 */
const STALE_AFTER_MS = 5 * 60 * 1000;

/** Postgres cannot store this character in a text column. */
const NUL = "\u0000";

/**
 * A requirement's text as HR typed it: spaces around it go, several spaces
 * inside become one, and it must then have 1 to 500 characters. The same
 * tidying is done to the AI's draft, so "the same text" means the same thing
 * for both.
 *
 * A text that breaks a limit gets a plain sentence, because HR reads it
 * under the field she typed in.
 */
function tidyText(raw: string): string {
  if (raw.includes(NUL)) {
    throw new ValidationError("The requirement holds a character that cannot be saved.");
  }
  const text = raw.replace(/\s+/g, " ").trim();
  if (text === "") throw new ValidationError("A requirement cannot be empty.");
  if (text.length > REQUIREMENT_TEXT_MAX) {
    throw new ValidationError(
      `A requirement can have at most ${REQUIREMENT_TEXT_MAX} characters.`,
    );
  }
  return text;
}

/**
 * What a caller may send to add a requirement. The company and the job are
 * not part of it: the company comes from the sign-in check and the job from
 * the address.
 */
export const addRequirementRequestSchema = z.object({
  text: z.string(),
  kind: z.enum(REQUIREMENT_KINDS),
  ifSilent: z.enum(IF_SILENT_MARKS),
});

export type AddRequirementRequest = z.infer<typeof addRequirementRequestSchema>;

/**
 * What a caller may send to change a requirement: any of the three, and at
 * least one. A field that is left out stays as it is.
 */
export const changeRequirementRequestSchema = z
  .object({
    text: z.string().optional(),
    kind: z.enum(REQUIREMENT_KINDS).optional(),
    ifSilent: z.enum(IF_SILENT_MARKS).optional(),
  })
  .refine(
    (change) =>
      change.text !== undefined || change.kind !== undefined || change.ifSilent !== undefined,
    "Nothing to change",
  );

export type ChangeRequirementRequest = z.infer<typeof changeRequirementRequestSchema>;

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

function requirementNotFound(): NotFoundError {
  return new NotFoundError("This requirement does not exist.", "requirement_not_found");
}

/** The job's requirements are confirmed, so the list cannot be changed. */
function jobNotDraft(): ConflictError {
  return new ConflictError("This job's requirements are already confirmed.", "job_not_draft");
}

function duplicateRequirement(): ConflictError {
  return new ConflictError("This requirement is already in the list.", "duplicate_requirement");
}

function isId(value: string): boolean {
  return z.uuid().safeParse(value).success;
}

/**
 * The requirements of a job: reading the list, starting a draft, and HR's
 * own edits (add a line, change one, remove one). Each edit is saved at once
 * and is allowed only while the job is a draft. Confirming comes with a later
 * step.
 *
 * This service makes no AI call itself. For a draft it saves a run's row and
 * adds a note to the queue; the worker, a separate program, makes the call a
 * moment later.
 *
 * The functions here are the actions behind the buttons of the screen. A
 * later chat agent calls the same functions.
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
   * 1. The job must be the company's and still a draft, and must have no
   *    requirements yet. A second draft would write nearly the same list
   *    again and wipe HR's own changes, so a job that has a list is refused
   *    with 409. The screen hides the button then; this check is for every
   *    other caller.
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

    const [job, existing] = await Promise.all([
      this.jobs.findById(tenantId, jobId),
      this.requirements.listForJob(tenantId, jobId),
    ]);
    if (!job) throw jobNotFound();
    if (job.status !== "draft") throw jobNotDraft();
    if (existing.length > 0) {
      throw new ConflictError("This job already has requirements.", "requirements_exist");
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

  /**
   * Adds one requirement at the end of a job's list. Refused when the job is
   * not a draft, when the list is full, and when the text is already in the
   * list.
   */
  async add(
    tenantId: string,
    jobId: string,
    request: AddRequirementRequest,
  ): Promise<RequirementView> {
    if (!isId(jobId)) throw jobNotFound();
    const text = tidyText(request.text);

    const answer = await this.requirements.addForJob(tenantId, jobId, {
      text,
      kind: request.kind,
      ifSilent: request.ifSilent,
    });

    if (answer.result === "added") return toView(answer.requirement);
    if (answer.result === "job_not_found") throw jobNotFound();
    if (answer.result === "job_not_draft") throw jobNotDraft();
    if (answer.result === "duplicate") throw duplicateRequirement();
    throw new ConflictError(
      `A job can have at most ${REQUIREMENTS_MAX} requirements.`,
      "too_many_requirements",
    );
  }

  /**
   * Changes the text, the kind or the mark of one requirement. The row keeps
   * its ID, so whatever points at it later still does.
   */
  async change(
    tenantId: string,
    jobId: string,
    requirementId: string,
    request: ChangeRequirementRequest,
  ): Promise<RequirementView> {
    if (!isId(jobId)) throw jobNotFound();
    if (!isId(requirementId)) throw requirementNotFound();

    const answer = await this.requirements.changeForJob(tenantId, jobId, requirementId, {
      text: request.text === undefined ? undefined : tidyText(request.text),
      kind: request.kind,
      ifSilent: request.ifSilent,
    });

    if (answer.result === "changed") return toView(answer.requirement);
    if (answer.result === "job_not_found") throw jobNotFound();
    if (answer.result === "job_not_draft") throw jobNotDraft();
    if (answer.result === "duplicate") throw duplicateRequirement();
    throw requirementNotFound();
  }

  /** Removes one requirement. The screen asks HR once before it calls this. */
  async remove(tenantId: string, jobId: string, requirementId: string): Promise<void> {
    if (!isId(jobId)) throw jobNotFound();
    if (!isId(requirementId)) throw requirementNotFound();

    const result = await this.requirements.removeForJob(tenantId, jobId, requirementId);

    if (result === "removed") return;
    if (result === "job_not_found") throw jobNotFound();
    if (result === "job_not_draft") throw jobNotDraft();
    throw requirementNotFound();
  }
}
