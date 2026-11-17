import { createLogger } from "@siftmerit/core";
import { loadEnv } from "./config/env.js";

function start() {
  const env = loadEnv();
  const logger = createLogger({
    service: "worker",
    level: env.LOG_LEVEL,
    style: env.NODE_ENV === "production" ? "json" : "readable",
  });

  // There is no queue yet, so the worker has nothing to wait for and finishes
  // here. Task 9 adds the queue listener, which keeps the process running.
  logger.info("Worker started. No queue yet, so there is nothing to do.");
}

try {
  start();
} catch (error) {
  // The logger may not exist yet (a bad setting stops us before it is built),
  // so this one message is printed directly.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
