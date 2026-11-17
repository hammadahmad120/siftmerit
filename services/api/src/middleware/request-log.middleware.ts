import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "@siftmerit/core";

/**
 * Runs first for every request. Makes the request ID, attaches a logger that
 * carries it, and prints one line when the answer has been sent.
 */
export function createRequestLogMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    // `req.path` has no query string. What comes after `?` can hold search
    // words later, so it is kept out of the logs.
    const path = req.path;

    req.requestId = requestId;
    req.log = logger.child({ requestId });
    res.setHeader("x-request-id", requestId);

    res.on("finish", () => {
      req.log.info("request finished", {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  };
}
