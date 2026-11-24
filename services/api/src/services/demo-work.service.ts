import {
  QueueUnavailableError,
  WorkRunAlreadyActiveError,
  type DemoMode,
  type DemoQueue,
  type WorkRunRepository,
  type WorkRunRow,
} from "@siftmerit/core";
import { z } from "zod";
import { ConflictError, ServiceUnavailableError } from "../lib/errors.js";

/** How many runs the page lists. */
const RECENT_RUNS = 10;

/** How long the "Run in 20 seconds" item is kept aside before a worker may take it. */
const DELAY_MS = 20_000;

/**
 * An unfinished run that has not changed for this long is taken to be stuck
 * and is closed before a new one starts. Far longer than any demo run takes.
 * Real work picks its own limit.
 */
const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * What the page may ask for. Test only, like the whole demo.
 * `delayed` is an ordinary item that is kept aside for 20 seconds first.
 */
export const demoRunRequestSchema = z.object({
  mode: z.enum(["ok", "delayed", "fail_once", "fail_always", "slow"]).default("ok"),
});

export type DemoRunRequest = z.infer<typeof demoRunRequestSchema>;

/** What the web app may know about a run. The company ID is left out. */
export type WorkRunView = {
  id: string;
  kind: string;
  status: string;
  attempt: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

function toView(row: WorkRunRow): WorkRunView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    attempt: row.attempt,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/**
 * The demo work: starting a run and listing a company's runs. This service
 * does no work itself. It saves a row and adds a note to the queue; the
 * worker, a separate program, does the work a moment later.
 *
 * In both functions `tenantId` must come from the sign-in check, never from
 * the request.
 */
export class DemoWorkService {
  constructor(
    private readonly workRuns: WorkRunRepository,
    private readonly queue: DemoQueue,
  ) {}

  /**
   * Starts one demo run. The order matters:
   *
   * 1. Runs of this company that stopped moving long ago are closed, so one
   *    stuck run cannot block the button for ever.
   * 2. The row is saved, with the status `waiting`. What HR sees lives in
   *    Postgres, so the row must exist before any work can. If the company
   *    already has an unfinished demo run, the database refuses the row and
   *    the caller gets 409 "already queued": nothing is queued twice.
   * 3. Then the work item is queued, carrying the row's ID.
   * 4. If queuing fails, the row is marked failed, so it does not say
   *    "waiting" for work that will never come.
   */
  async startRun(tenantId: string, requestId: string, request: DemoRunRequest): Promise<WorkRunView> {
    await this.workRuns.closeStale(tenantId, "demo", STALE_AFTER_MS);

    let run: WorkRunRow;
    try {
      run = await this.workRuns.insert(tenantId, "demo");
    } catch (error) {
      if (error instanceof WorkRunAlreadyActiveError) {
        throw new ConflictError(
          "A demo run is already waiting or running. Wait for it to finish.",
          "already_queued",
        );
      }
      throw error;
    }

    const delayed = request.mode === "delayed";
    const mode: DemoMode = request.mode === "delayed" ? "ok" : request.mode;

    try {
      await this.queue.add(
        { workRunId: run.id, tenantId, requestId, mode },
        delayed ? { delayMs: DELAY_MS } : undefined,
      );
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

    return toView(run);
  }

  /** The company's newest demo runs, newest first. */
  async listRuns(tenantId: string): Promise<WorkRunView[]> {
    const rows = await this.workRuns.listRecent(tenantId, "demo", RECENT_RUNS);
    return rows.map(toView);
  }
}
