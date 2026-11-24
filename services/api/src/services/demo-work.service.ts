import {
  QueueUnavailableError,
  type DemoQueue,
  type WorkRunRepository,
  type WorkRunRow,
} from "@siftmerit/core";
import { ServiceUnavailableError } from "../lib/errors.js";

/** How many runs the page lists. */
const RECENT_RUNS = 10;

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
   * 1. The row is saved first, with the status `waiting`. What HR sees lives
   *    in Postgres, so the row must exist before any work can.
   * 2. Then the work item is queued, carrying the row's ID.
   * 3. If queuing fails, the row is marked failed, so it does not say
   *    "waiting" for work that will never come.
   */
  async startRun(tenantId: string, requestId: string): Promise<WorkRunView> {
    const run = await this.workRuns.insert(tenantId, "demo");

    try {
      await this.queue.add({ workRunId: run.id, tenantId, requestId });
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
