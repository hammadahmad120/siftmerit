import {
  createAiCaller,
  createDemoWorker,
  createLogger,
  createQueueTroubleLogger,
  createRequirementsWorker,
  createSecretClient,
  DEMO_QUEUE_NAME,
  demoWorkItemSchema,
  isFinalFailure,
  isWorkerLost,
  JobRepository,
  JobRequirementRepository,
  REQUIREMENTS_QUEUE_NAME,
  requirementsWorkItemSchema,
  WorkRunRepository,
  type Logger,
} from "@siftmerit/core";
import { loadEnv } from "./config/env.js";
import { runDemoWorkItem } from "./handlers/demo.handler.js";
import { runRequirementsWorkItem } from "./handlers/requirements.handler.js";

/** The IDs every work item carries, whatever its queue. */
type ItemIds = { workRunId: string; requestId: string; tenantId: string };

/** The part of a queue's listener (BullMQ's `Worker`) that `watch` and the clean stop use. */
type Listener = {
  on(event: "ready", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(
    event: "failed",
    listener: (
      item: { id?: string; data: unknown; attemptsMade: number; opts: { attempts?: number } } | undefined,
      error: Error,
    ) => void,
  ): unknown;
  close(): Promise<void>;
};

/**
 * Puts the same three listeners on a queue's listener: connected, connection
 * trouble, and a try that failed. `readIds` checks an item's shape and gives
 * back its IDs, or null for an item of the wrong shape.
 */
function watch(
  listener: Listener,
  queue: string,
  readIds: (data: unknown) => ItemIds | null,
  deps: { logger: Logger; workRuns: WorkRunRepository },
): void {
  const { logger, workRuns } = deps;

  // Connected, or connected again after Redis was away.
  listener.on("ready", () => {
    logger.info("Worker connected to Redis. Waiting for work items.", { queue });
  });

  // Connection trouble. Without this listener an error would stop the worker.
  listener.on("error", createQueueTroubleLogger(logger));

  // A try that failed. This fires after every try, not only the last one.
  // `item` is missing only when the queue lost track of it, which should not
  // happen. The line holds IDs and the error, never the item's content. The
  // IDs inside the item are logged only when the item has the right shape: an
  // item with the wrong shape could hold anything in those fields.
  listener.on("failed", (item, error) => {
    const ids = item ? readIds(item.data) : null;
    const final = item ? isFinalFailure(item, error) : true;

    logger.error(final ? "work item failed for good" : "work item failed, it will be tried again", {
      queue,
      workItemId: item?.id,
      ...(ids ?? {}),
      attempt: item?.attemptsMade,
      allowed: item?.opts.attempts,
      errorName: error.name,
      errorMessage: error.message,
    });

    // Making sure the run's row says "failed" when the item is failed for
    // good. After an ordinary last try the handler has already done this and
    // the call below changes nothing. It matters when the queue gave up on an
    // item whose worker died twice: then no handler ran, and this is the only
    // place that learns of it.
    if (final && ids) {
      const reason = isWorkerLost(error) ? "worker_lost" : "work_failed";
      workRuns.markFailed(ids.tenantId, ids.workRunId, reason).catch((updateError: unknown) => {
        logger.error("the run's row could not be marked failed", {
          queue,
          workItemId: item?.id,
          ...ids,
          errorName: updateError instanceof Error ? updateError.name : "unknown",
          errorMessage: updateError instanceof Error ? updateError.message : undefined,
        });
      });
    }
  });
}

function start() {
  const env = loadEnv();
  const logger = createLogger({
    service: "worker",
    level: env.LOG_LEVEL,
    style: env.NODE_ENV === "production" ? "json" : "readable",
  });

  // The worker saves the status of every run in Postgres, where the screens
  // read it. It uses the secret key, so each repository filters by the company.
  const db = createSecretClient(env);
  const workRuns = new WorkRunRepository(db);

  // What a requirements draft needs: the AI caller, the job it reads and the
  // list it saves.
  const draft = {
    ai: createAiCaller({ db, env, logger }),
    jobs: new JobRepository(db),
    requirements: new JobRequirementRepository(db),
  };

  // The worker listens to its queues. This is what keeps the program running:
  // it waits for the next work item for as long as it lives. Each queue has
  // its own listener, so a slow queue never holds up another.
  const demoListener = createDemoWorker(env.REDIS_URL, (item) =>
    runDemoWorkItem(item, { logger, workRuns }),
  );
  const requirementsListener = createRequirementsWorker(env.REDIS_URL, (item) =>
    runRequirementsWorkItem(item, { logger, workRuns, draft }),
  );

  watch(
    demoListener,
    DEMO_QUEUE_NAME,
    (data) => {
      const checked = demoWorkItemSchema.safeParse(data);
      if (!checked.success) return null;
      const { workRunId, requestId, tenantId } = checked.data;
      return { workRunId, requestId, tenantId };
    },
    { logger, workRuns },
  );
  watch(
    requirementsListener,
    REQUIREMENTS_QUEUE_NAME,
    (data) => {
      const checked = requirementsWorkItemSchema.safeParse(data);
      if (!checked.success) return null;
      const { workRunId, requestId, tenantId } = checked.data;
      return { workRunId, requestId, tenantId };
    },
    { logger, workRuns },
  );

  const listeners: Listener[] = [demoListener, requirementsListener];

  logger.info("Worker started", { queues: [DEMO_QUEUE_NAME, REQUIREMENTS_QUEUE_NAME] });

  // A clean stop. Ctrl+C sends SIGINT; a restart after a file change, or a
  // hosting service stopping the program, sends SIGTERM. The worker takes no
  // new item, lets the ones it is running finish, and only then ends. A
  // second signal ends it at once, for when Redis is away and the stop cannot
  // finish.
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) {
      logger.warn("Worker stopped at once. A running work item may be left unfinished.", { signal });
      process.exit(1);
    }
    stopping = true;
    logger.info("Worker stopping. Running work items are finished first.", { signal });
    Promise.all(listeners.map((listener) => listener.close()))
      .then(() => {
        logger.info("Worker stopped");
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error("Worker did not stop cleanly", {
          errorName: error instanceof Error ? error.name : "unknown",
        });
        process.exit(1);
      });
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
}

try {
  start();
} catch (error) {
  // The logger may not exist yet (a bad setting stops us before it is built),
  // so this one message is printed directly.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
