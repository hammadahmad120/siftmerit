import {
  createDemoWorker,
  createLogger,
  createQueueTroubleLogger,
  createSecretClient,
  DEMO_QUEUE_NAME,
  demoWorkItemSchema,
  WorkRunRepository,
} from "@siftmerit/core";
import { loadEnv } from "./config/env.js";
import { runDemoWorkItem } from "./handlers/demo.handler.js";

function start() {
  const env = loadEnv();
  const logger = createLogger({
    service: "worker",
    level: env.LOG_LEVEL,
    style: env.NODE_ENV === "production" ? "json" : "readable",
  });

  // The worker saves the status of every run in Postgres, where the screens
  // read it. It uses the secret key, so each update filters by the company.
  const workRuns = new WorkRunRepository(createSecretClient(env));

  // The worker listens to the queue. This is what keeps the program running:
  // it waits for the next work item for as long as it lives.
  const worker = createDemoWorker(env.REDIS_URL, (item) =>
    runDemoWorkItem(item, { logger, workRuns }),
  );

  // Connected, or connected again after Redis was away.
  worker.on("ready", () => {
    logger.info("Worker connected to Redis. Waiting for work items.", { queue: DEMO_QUEUE_NAME });
  });

  // Connection trouble. Without this listener an error would stop the worker.
  worker.on("error", createQueueTroubleLogger(logger));

  // An item whose handler threw. `item` is missing only when the queue lost
  // track of it, which should not happen. The line holds IDs and the error,
  // never the item's content. The IDs inside the item are logged only
  // when the item has the right shape: an item with the wrong shape could
  // hold anything in those fields.
  worker.on("failed", (item, error) => {
    const checked = demoWorkItemSchema.safeParse(item?.data);
    logger.error("work item failed", {
      queue: DEMO_QUEUE_NAME,
      workItemId: item?.id,
      ...(checked.success
        ? {
            workRunId: checked.data.workRunId,
            requestId: checked.data.requestId,
            tenantId: checked.data.tenantId,
          }
        : {}),
      errorName: error.name,
      errorMessage: error.message,
    });
  });

  logger.info("Worker started", { queue: DEMO_QUEUE_NAME });

  // A clean stop. Ctrl+C sends SIGINT; a restart after a file change, or a
  // hosting service stopping the program, sends SIGTERM. The worker takes no
  // new item, lets the one it is running finish, and only then ends. A second
  // signal ends it at once, for when Redis is away and the stop cannot finish.
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) {
      logger.warn("Worker stopped at once. A running work item may be left unfinished.", { signal });
      process.exit(1);
    }
    stopping = true;
    logger.info("Worker stopping. A running work item is finished first.", { signal });
    worker
      .close()
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
