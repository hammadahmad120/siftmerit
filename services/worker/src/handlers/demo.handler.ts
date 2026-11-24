import { setTimeout as wait } from "node:timers/promises";
import {
  DEMO_QUEUE_NAME,
  demoWorkItemSchema,
  type DemoMode,
  type Logger,
  type QueuedDemoWorkItem,
  type WorkRunRepository,
} from "@siftmerit/core";

/** How long the pretend work takes. */
const DEMO_WORK_MS = 2000;

/** How long the `slow` item takes: long enough to kill the worker in the middle. */
const SLOW_WORK_MS = 20_000;

/** How long a try that fails on purpose runs first, so "running" can be seen. */
const BEFORE_FAILING_MS = 1000;

/**
 * The pretend work. It stands in for real work, such as reading a CV.
 *
 * Test only: three of the four modes fail or stall on purpose, so the retry
 * limit and a killed worker can be seen. Real handlers have no such code;
 * they fail only when something really fails.
 */
async function doDemoWork(mode: DemoMode, attempt: number): Promise<void> {
  if (mode === "slow") {
    await wait(SLOW_WORK_MS);
    return;
  }
  if (mode === "fail_always" || (mode === "fail_once" && attempt === 1)) {
    await wait(BEFORE_FAILING_MS);
    throw new Error("The demo work failed on purpose");
  }
  await wait(DEMO_WORK_MS);
}

/**
 * Runs one try of a demo work item and keeps its run's row in Postgres in
 * step:
 *
 * - `running` when the try starts;
 * - `done` when it ends well;
 * - back to `waiting` when it throws and a later try will follow;
 * - `failed` when it throws on the last try.
 *
 * It is safe to run twice. The work changes nothing, and a run that is
 * already done or failed is left alone: the item is then skipped.
 *
 * When this function throws, the queue counts the try as failed. If tries
 * are left it runs the item again after a wait; if not, the item is failed
 * for good.
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
  const { workRunId, tenantId, requestId, mode } = parsed.data;

  // Every line about this item carries the item's own ID, its run's ID, the
  // ID of the API request that queued it, and the company it is for.
  const log = deps.logger.child({ workItemId: queued.id, workRunId, requestId, tenantId });

  // `attemptsMade` counts the tries that already failed, so this try is one
  // more. An item taken back from a dead worker does not count as a try: it
  // comes here again with the same number.
  const attempt = queued.attemptsMade + 1;
  const allowed = queued.opts.attempts ?? 1;

  const started = await deps.workRuns.markRunning(tenantId, workRunId, attempt);
  if (!started) {
    // The run is already done or failed, or its company is gone. There is
    // nothing to do, and doing the work again would be wrong.
    log.warn("work item skipped: its run is already finished or gone", { queue: DEMO_QUEUE_NAME });
    return;
  }

  const startedAt = Date.now();
  log.info("work item started", { queue: DEMO_QUEUE_NAME, attempt, allowed });

  try {
    await doDemoWork(mode, attempt);
  } catch (error) {
    // The row is updated here, before the error is handed to the queue, so
    // the row is right before the queue plans the next try.
    if (attempt >= allowed) {
      await deps.workRuns.markFailed(tenantId, workRunId, "work_failed");
    } else {
      await deps.workRuns.markWaitingForRetry(tenantId, workRunId);
    }
    throw error;
  }

  await deps.workRuns.markDone(tenantId, workRunId);
  log.info("work item done", {
    queue: DEMO_QUEUE_NAME,
    attempt,
    durationMs: Date.now() - startedAt,
  });
}
