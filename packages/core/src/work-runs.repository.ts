import type { SupabaseClient } from "@supabase/supabase-js";
import { toDatabaseError } from "./database.js";
import { forTenant } from "./tenant-db.js";

/** What sort of work a run is. A new kind of work adds its name here. */
export type WorkRunKind = "demo";

export type WorkRunStatus = "waiting" | "running" | "done" | "failed";

/**
 * Why a run failed, as a short fixed word. Never a raw error message, which
 * could repeat personal data. The full error goes to the logs.
 */
export type WorkRunError =
  /** The item could not be put into the queue, because Redis was away. */
  | "queue_unavailable"
  /** The work threw an error on its last try. */
  | "work_failed"
  /** The worker running it died twice, and the queue gave up on it. */
  | "worker_lost"
  /** It did not move for too long and was closed when a new run was started. */
  | "timed_out";

/**
 * The company already has an unfinished run of this kind, so the database
 * refused a second one. See `insert`.
 */
export class WorkRunAlreadyActiveError extends Error {
  constructor() {
    super("An unfinished run of this kind already exists");
    this.name = "WorkRunAlreadyActiveError";
  }
}

/** The database's code for "this would break a unique rule". */
const UNIQUE_RULE_BROKEN = "23505";

export type WorkRunRow = {
  id: string;
  tenant_id: string;
  kind: WorkRunKind;
  status: WorkRunStatus;
  /** Which try the run is on. 0 until a worker has started it. */
  attempt: number;
  error: WorkRunError | null;
  created_at: string;
  /** When the latest try started. */
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

const COLUMNS =
  "id, tenant_id, kind, status, attempt, error, created_at, started_at, finished_at, updated_at";

/** A run in one of these states can still change. `done` and `failed` are final. */
const UNFINISHED: WorkRunStatus[] = ["waiting", "running"];

/**
 * The status table for background work: one row per piece of work, as HR sees
 * it. The API adds a row before it queues anything, and the worker updates it.
 *
 * Company separation: every function takes the company's ID first and reaches
 * the table only through `forTenant`, which adds the company filter itself.
 * So a run is only ever found inside its own company.
 *
 * The three `mark...` functions change a row only while it is unfinished, and
 * answer whether a row was changed. A run that is done or failed is never
 * touched again, so a late update, for example from a work item that ran
 * twice, cannot undo it.
 */
export class WorkRunRepository {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Adds a run with the status `waiting`. The database makes its ID.
   *
   * A company may have only one unfinished run of a kind. That is a rule in
   * the database (a unique index over unfinished rows), not a check made
   * here first: two clicks at the same moment would both pass a check, but
   * the database lets only one row in. The refused one gets a
   * `WorkRunAlreadyActiveError`, and no row and no ID exist for it.
   */
  async insert(tenantId: string, kind: WorkRunKind): Promise<WorkRunRow> {
    const { data, error } = await forTenant(this.db, tenantId)
      .insert("work_runs", { kind })
      .select(COLUMNS)
      .single();

    if (error?.code === UNIQUE_RULE_BROKEN) throw new WorkRunAlreadyActiveError();
    if (error) throw toDatabaseError("work_runs insert", error);
    return data as WorkRunRow;
  }

  /**
   * Closes a company's unfinished runs of one kind that have not changed for
   * `olderThanMs`: they are marked failed with the error `timed_out`.
   * Answers how many were closed.
   *
   * Without this, one run stuck on `running`, for example because a worker
   * died and no worker ever came back, would block that company's next run
   * for ever, since only one unfinished run is allowed. It is called just
   * before a new run is added.
   */
  async closeStale(tenantId: string, kind: WorkRunKind, olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const { data, error } = await forTenant(this.db, tenantId)
      .update("work_runs", {
        status: "failed",
        error: "timed_out",
        finished_at: new Date().toISOString(),
      })
      .eq("kind", kind)
      .in("status", UNFINISHED)
      .lt("updated_at", cutoff)
      .select("id");

    if (error) throw toDatabaseError("work_runs close stale", error);
    return (data ?? []).length;
  }

  /** A company's newest runs of one kind, newest first. */
  async listRecent(tenantId: string, kind: WorkRunKind, limit: number): Promise<WorkRunRow[]> {
    const { data, error } = await forTenant(this.db, tenantId)
      .select("work_runs", COLUMNS)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw toDatabaseError("work_runs list recent", error);
    return (data ?? []) as WorkRunRow[];
  }

  /**
   * A worker has started a try. Answers false when the run is finished or
   * gone, or when a later try has already started: an older try can never
   * write over a newer one.
   */
  async markRunning(tenantId: string, runId: string, attempt: number): Promise<boolean> {
    const { data, error } = await forTenant(this.db, tenantId)
      .update("work_runs", { status: "running", attempt, started_at: new Date().toISOString() })
      .eq("id", runId)
      .in("status", UNFINISHED)
      .lte("attempt", attempt)
      .select("id");

    if (error) throw toDatabaseError("work_runs mark running", error);
    return (data ?? []).length > 0;
  }

  /**
   * A try failed and another one will follow after a wait. The run goes back
   * to `waiting` and keeps its try number, so the page can say which try it
   * was. Answers false when the run is finished or gone.
   */
  async markWaitingForRetry(tenantId: string, runId: string): Promise<boolean> {
    return this.updateUnfinished("work_runs mark waiting for retry", tenantId, runId, {
      status: "waiting",
    });
  }

  /** The work finished well. Answers false when the run was already finished or is gone. */
  async markDone(tenantId: string, runId: string): Promise<boolean> {
    return this.updateUnfinished("work_runs mark done", tenantId, runId, {
      status: "done",
      error: null,
      finished_at: new Date().toISOString(),
    });
  }

  /** The work failed for good. Answers false when the run was already finished or is gone. */
  async markFailed(tenantId: string, runId: string, reason: WorkRunError): Promise<boolean> {
    return this.updateUnfinished("work_runs mark failed", tenantId, runId, {
      status: "failed",
      error: reason,
      finished_at: new Date().toISOString(),
    });
  }

  /** Changes one run of one company, and only while it is unfinished. */
  private async updateUnfinished(
    operation: string,
    tenantId: string,
    runId: string,
    changes: Partial<Pick<WorkRunRow, "status" | "attempt" | "error" | "started_at" | "finished_at">>,
  ): Promise<boolean> {
    const { data, error } = await forTenant(this.db, tenantId)
      .update("work_runs", changes)
      .eq("id", runId)
      .in("status", UNFINISHED)
      .select("id");

    if (error) throw toDatabaseError(operation, error);
    return (data ?? []).length > 0;
  }
}
