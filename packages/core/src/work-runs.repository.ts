import type { SupabaseClient } from "@supabase/supabase-js";
import { toDatabaseError } from "./database.js";

/** What sort of work a run is. A new kind of work adds its name here. */
export type WorkRunKind = "demo";

export type WorkRunStatus = "waiting" | "running" | "done" | "failed";

/**
 * Why a run failed, as a short fixed word. Never a raw error message, which
 * could repeat personal data. The full error goes to the logs.
 */
export type WorkRunError = "queue_unavailable" | "work_failed";

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
 * Company separation: every function takes the company's ID first and filters
 * by it, so a run is only ever found inside its own company.
 *
 * The three `mark...` functions change a row only while it is unfinished, and
 * answer whether a row was changed. A run that is done or failed is never
 * touched again, so a late update, for example from a work item that ran
 * twice, cannot undo it.
 */
export class WorkRunRepository {
  constructor(private readonly db: SupabaseClient) {}

  /** Adds a run with the status `waiting`. The database makes its ID. */
  async insert(tenantId: string, kind: WorkRunKind): Promise<WorkRunRow> {
    const { data, error } = await this.db
      .from("work_runs")
      .insert({ tenant_id: tenantId, kind })
      .select(COLUMNS)
      .single();

    if (error) throw toDatabaseError("work_runs insert", error);
    return data as WorkRunRow;
  }

  /** A company's newest runs of one kind, newest first. */
  async listRecent(tenantId: string, kind: WorkRunKind, limit: number): Promise<WorkRunRow[]> {
    const { data, error } = await this.db
      .from("work_runs")
      .select(COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw toDatabaseError("work_runs list recent", error);
    return (data ?? []) as WorkRunRow[];
  }

  /** A worker has started a try. Answers false when the run is finished or gone. */
  async markRunning(tenantId: string, runId: string, attempt: number): Promise<boolean> {
    return this.updateUnfinished("work_runs mark running", tenantId, runId, {
      status: "running",
      attempt,
      started_at: new Date().toISOString(),
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
    const { data, error } = await this.db
      .from("work_runs")
      .update(changes)
      .eq("tenant_id", tenantId)
      .eq("id", runId)
      .in("status", UNFINISHED)
      .select("id");

    if (error) throw toDatabaseError(operation, error);
    return (data ?? []).length > 0;
  }
}
