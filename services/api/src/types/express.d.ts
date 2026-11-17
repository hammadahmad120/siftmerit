import type { Logger } from "../lib/logger.js";

// Tells TypeScript about the two things the request-log middleware adds to
// every request.
declare global {
  namespace Express {
    interface Request {
      /** ID made for this one request. Also sent back as `x-request-id`. */
      requestId: string;
      /** Logger that adds `requestId` to every line it prints. */
      log: Logger;
    }
  }
}

export {};
