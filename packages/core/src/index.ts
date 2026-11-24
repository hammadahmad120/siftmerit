// The one entry file of the core package. The API and the worker import from
// "@siftmerit/core", and everything core offers is listed here.
//
// Core is read as TypeScript source in development (see `exports` in
// package.json), so there is no compile step and no watch script.

export { loadSettings, sharedEnvSchema } from "./env.js";
export type { SharedEnv } from "./env.js";
export { createLogger } from "./logger.js";
export type { Logger, LoggerOptions } from "./logger.js";
export { createSecretClient, DatabaseError, databaseEnvShape, toDatabaseError } from "./database.js";
export type { DatabaseEnv } from "./database.js";
export { WorkRunAlreadyActiveError, WorkRunRepository } from "./work-runs.repository.js";
export type { WorkRunError, WorkRunKind, WorkRunRow, WorkRunStatus } from "./work-runs.repository.js";
export {
  createDemoWorker,
  createQueueTroubleLogger,
  DEMO_QUEUE_NAME,
  DEMO_TRIES,
  DemoQueue,
  demoWorkItemSchema,
  isFinalFailure,
  isWorkerLost,
  QueueUnavailableError,
} from "./queue.js";
export type { DemoMode, DemoWorkItem, QueuedDemoWorkItem } from "./queue.js";
