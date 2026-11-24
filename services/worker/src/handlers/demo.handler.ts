import { setTimeout as wait } from "node:timers/promises";
import {
  DEMO_QUEUE_NAME,
  demoWorkItemSchema,
  type Logger,
  type QueuedDemoWorkItem,
  type WorkRunRepository,
} from "@siftmerit/core";

/** How long the pretend work takes. */
const DEMO_WORK_MS = 2000;

/** The pretend work. It stands in for real work, such as reading a CV. */
async function doDemoWork(): Promise<void> {
  await wait(DEMO_WORK_MS);
}

/**
 * Runs one demo work item and keeps its run's row in Postgres in step:
 * `running` when it starts, `done` when it ends, `failed` when the work
 * throws.
 *
 * It is safe to run twice. The work changes nothing, and a run that is
 * already done or failed is left alone: the item is then skipped.
 *
 * When this function throws, the queue marks the item failed and the worker
 * logs it.
 */
export async function runDemoWorkItem(
  queued: QueuedDemoWorkItem,
  deps: { logger: Logger; workRuns: WorkRunRepository },
): Promise<void> {
  // An item comes from Redis, not from our own memory, so its shape is checked
  // before it is used. The message names no field values.
  const parsed = demoWorkItemSchema.safeParse(queued.data);
  if (!parsed.success) {
    throw new Error("The demo work item does not have the expected shape");
  }
  const { workRunId, tenantId, requestId } = parsed.data;

  // Every line about this item carries the item's own ID, its run's ID, the
  // ID of the API request that queued it, and the company it is for.
  const log = deps.logger.child({ workItemId: queued.id, workRunId, requestId, tenantId });

  // `attemptsMade` counts the tries that already ended, so this try is one more.
  const attempt = queued.attemptsMade + 1;

  const started = await deps.workRuns.markRunning(tenantId, workRunId, attempt);
  if (!started) {
    // The run is already done or failed, or its company is gone. There is
    // nothing to do, and doing the work again would be wrong.
    log.warn("work item skipped: its run is already finished or gone", { queue: DEMO_QUEUE_NAME });
    return;
  }

  const startedAt = Date.now();
  log.info("work item started", { queue: DEMO_QUEUE_NAME, attempt });

  try {
    await doDemoWork();
  } catch (error) {
    // With one try and no retry, a failure is final. Part 2 of task 10 adds
    // retries; then the run is marked failed only after the last try.
    await deps.workRuns.markFailed(tenantId, workRunId, "work_failed");
    throw error;
  }

  await deps.workRuns.markDone(tenantId, workRunId);
  log.info("work item done", { queue: DEMO_QUEUE_NAME, durationMs: Date.now() - startedAt });
}
