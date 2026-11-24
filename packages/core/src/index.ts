// The one entry file of the core package. The API and the worker import from
// "@siftmerit/core", and everything core offers is listed here.
//
// Core is read as TypeScript source in development (see `exports` in
// package.json), so there is no compile step and no watch script.

export { loadSettings, sharedEnvSchema } from "./env.js";
export type { SharedEnv } from "./env.js";
export { createLogger } from "./logger.js";
export type { Logger, LoggerOptions } from "./logger.js";
export {
  createDemoWorker,
  createQueueTroubleLogger,
  DEMO_QUEUE_NAME,
  DemoQueue,
  demoWorkItemSchema,
  QueueUnavailableError,
} from "./queue.js";
export type { DemoWorkItem, QueuedDemoWorkItem } from "./queue.js";
