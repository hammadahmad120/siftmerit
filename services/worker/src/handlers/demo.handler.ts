import { setTimeout as wait } from "node:timers/promises";
import { DEMO_QUEUE_NAME, demoWorkItemSchema, type Logger, type QueuedDemoWorkItem } from "@siftmerit/core";

/** How long the pretend work takes. */
const DEMO_WORK_MS = 2000;

/**
 * Runs one demo work item. It stands in for real work, such as reading a CV:
 * it waits two seconds and changes nothing, so running it twice does no harm.
 *
 * When this function throws, the queue marks the item failed and the worker
 * logs it.
 */
export async function runDemoWorkItem(queued: QueuedDemoWorkItem, logger: Logger): Promise<void> {
  // An item comes from Redis, not from our own memory, so its shape is checked
  // before it is used. The message names no field values.
  const parsed = demoWorkItemSchema.safeParse(queued.data);
  if (!parsed.success) {
    throw new Error("The demo work item does not have the expected shape");
  }

  // Every line about this item carries its ID, the ID of the API request that
  // queued it, and the company it is for.
  const log = logger.child({
    workItemId: queued.id,
    requestId: parsed.data.requestId,
    tenantId: parsed.data.tenantId,
  });

  const startedAt = Date.now();
  log.info("work item started", { queue: DEMO_QUEUE_NAME });

  await wait(DEMO_WORK_MS);

  log.info("work item done", { queue: DEMO_QUEUE_NAME, durationMs: Date.now() - startedAt });
}
