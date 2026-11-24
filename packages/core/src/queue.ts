// The work queue, shared by the API and the worker.
//
// A queue lets the API say "do this later" and answer at once. The API adds a
// small note, a work item, to a list kept in Redis. The worker, a separate
// program, takes items from that list one by one and does the work.
//
// The library is BullMQ. Its own word for a work item is "job". Ours is not:
// in this product "job" always means a hiring job.
//
// For now there is one queue, `demo`, with one kind of item that does no real
// work. Real queues are added by the tasks that first need them.

import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";
import { z } from "zod";
import type { Logger } from "./logger.js";

/** The name of the demo queue. In Redis its keys start with `bull:demo:`. */
export const DEMO_QUEUE_NAME = "demo";

/**
 * What a demo work item carries. IDs only, never names or text: an item is
 * saved in Redis and its fields are written to the logs.
 *
 * - `workRunId`: the row in `work_runs` this item belongs to. The worker
 *   updates that row, and the screens read it. A run can have many items;
 *   every item carries its run's ID.
 * - `tenantId`: the company the work is for. The API takes it from the
 *   signed-in user, never from the request.
 * - `requestId`: the ID of the API request that queued the item, so one click
 *   can be followed from the API's log into the worker's.
 */
export const demoWorkItemSchema = z.object({
  workRunId: z.uuid(),
  tenantId: z.uuid(),
  requestId: z.uuid(),
  mode: z.enum(["ok", "fail_once", "fail_always", "slow"]),
});

/**
 * How a demo item behaves, so each failure case can be seen. Test only: it
 * goes away with the demo, and real work items have no such field.
 *
 * - `ok`: works.
 * - `fail_once`: throws on the first try and works on the second.
 * - `fail_always`: throws on every try.
 * - `slow`: takes 20 seconds, which leaves time to kill the worker.
 */
export type DemoMode = z.infer<typeof demoWorkItemSchema>["mode"];

/** How many times a demo item is tried in all. Each real queue picks its own number. */
export const DEMO_TRIES = 3;

/**
 * The wait before the second try, in milliseconds. It doubles each time
 * (BullMQ's "exponential" wait): 2 seconds, then 4.
 */
const DEMO_FIRST_WAIT_MS = 2000;

export type DemoWorkItem = z.infer<typeof demoWorkItemSchema>;

/** A demo work item as the worker receives it: the data, plus the ID the queue gave it. */
export type QueuedDemoWorkItem = Job<DemoWorkItem, void, typeof DEMO_QUEUE_NAME>;

/** The queue could not take the item, because Redis cannot be reached. */
export class QueueUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The work queue cannot be reached", options);
    this.name = "QueueUnavailableError";
  }
}

/**
 * The adding side of the demo queue, used by the API.
 *
 * It is built for a web request, which must not wait: when Redis cannot be
 * reached, `add` fails at once with a `QueueUnavailableError` and never hangs.
 * Two things make that true.
 *
 * - `enableOfflineQueue: false` tells the Redis library not to hold a command
 *   back until the connection returns. Once the queue has connected, a
 *   stopped Redis makes `add` fail straight away.
 * - That setting does not cover the time before the first connection: a queue
 *   created while Redis is down would keep `add` waiting until Redis comes up
 *   (tried on 2026-11-19). So `ready` is kept here, and `add` refuses until
 *   the first connection is made.
 *
 * The API therefore starts with Redis stopped, and the queue starts working
 * by itself when Redis comes up.
 */
export class DemoQueue {
  private readonly queue: Queue<DemoWorkItem, void, typeof DEMO_QUEUE_NAME>;
  private ready = false;

  /** `onTrouble` is called for every connection error. Pass `createQueueTroubleLogger`. */
  constructor(redisUrl: string, onTrouble: (error: Error) => void) {
    this.queue = new Queue(DEMO_QUEUE_NAME, {
      connection: { url: redisUrl, enableOfflineQueue: false },
      defaultJobOptions: {
        // Every work item has a retry limit. An item whose handler throws is
        // tried again after a wait, three tries in all, then it is failed.
        attempts: DEMO_TRIES,
        backoff: { type: "exponential", delay: DEMO_FIRST_WAIT_MS },
        // BullMQ keeps every finished item forever unless told otherwise.
        // The last 1,000 done and 5,000 failed are kept, for looking at.
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });

    // Without a listener, an error event would stop the whole program.
    this.queue.on("error", onTrouble);

    this.queue.waitUntilReady().then(
      () => {
        this.ready = true;
      },
      (error: unknown) => onTrouble(error instanceof Error ? error : new Error(String(error))),
    );
  }

  /**
   * Adds one item and returns the ID the queue gave it. With `delayMs` the
   * item is kept aside for that long before any worker may take it.
   */
  async add(item: DemoWorkItem, options?: { delayMs?: number }): Promise<string> {
    if (!this.ready) throw new QueueUnavailableError();

    try {
      const queued = await this.queue.add(DEMO_QUEUE_NAME, item, { delay: options?.delayMs });
      if (!queued.id) throw new Error("The queue gave the item no ID");
      return queued.id;
    } catch (error) {
      throw new QueueUnavailableError({ cause: error });
    }
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}

/**
 * The running side of the demo queue, used by the worker. It takes items from
 * the queue one at a time and hands each to `run`. When `run` throws, the
 * item is marked failed.
 *
 * Unlike the adding side, it waits patiently: when Redis cannot be reached it
 * keeps trying to connect and carries on when Redis is back.
 */
export function createDemoWorker(
  redisUrl: string,
  run: (item: QueuedDemoWorkItem) => Promise<void>,
): Worker<DemoWorkItem, void, typeof DEMO_QUEUE_NAME> {
  return new Worker<DemoWorkItem, void, typeof DEMO_QUEUE_NAME>(DEMO_QUEUE_NAME, run, {
    connection: { url: redisUrl },
  });
}

/**
 * Whether a failed item will not be tried again. The worker's "failed" event
 * fires after every try, so this tells the last one from the others.
 *
 * Two ways to be final (both tried on 2026-11-24):
 * - the tries are used up: `attemptsMade` has reached the allowed number;
 * - the queue gave up on the item, which it reports with an
 *   `UnrecoverableError` whatever the number of tries. See `isWorkerLost`.
 */
export function isFinalFailure(item: QueuedDemoWorkItem, error: Error): boolean {
  if (error instanceof UnrecoverableError || error.name === "UnrecoverableError") return true;
  return item.attemptsMade >= (item.opts.attempts ?? 1);
}

/**
 * Whether the queue gave up on an item because its worker died twice.
 *
 * A worker holds a 30-second lock on the item it runs and renews it while it
 * lives. When a worker is killed, the lock runs out and the item is taken
 * back, once. That does not count as a try. If the item's worker dies a
 * second time, the next worker to pick the item up is told it failed with
 * this message, and the handler is not run.
 */
export function isWorkerLost(error: Error): boolean {
  return error.message.includes("stalled more than allowable limit");
}

/** How long the trouble logger stays quiet after one line. */
const QUIET_MS = 30_000;

/**
 * A listener for a queue's or a worker's connection errors. While Redis is
 * down the same error arrives every second or so, so it logs one line and
 * then stays quiet for 30 seconds.
 *
 * These errors are about the connection (for example ECONNREFUSED), not about
 * an item, so they hold no company data.
 */
export function createQueueTroubleLogger(logger: Logger): (error: Error) => void {
  let quietUntil = 0;

  return (error) => {
    const now = Date.now();
    if (now < quietUntil) return;
    quietUntil = now + QUIET_MS;

    const code = (error as { code?: unknown }).code;
    logger.warn("The work queue cannot reach Redis. It keeps trying.", {
      errorName: error.name,
      errorCode: typeof code === "string" ? code : undefined,
      errorMessage: error.message,
    });
  };
}
