import { DatabaseError } from "@siftmerit/core";
import type { NextFunction, Request, Response } from "express";
import { ZodError, z } from "zod";
import { AppError, NotFoundError } from "../lib/errors.js";

/** Runs when no route matched. Turns it into a normal "not found" error. */
export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError(`No route for ${req.method} ${req.path}`, "route_not_found"));
}

/**
 * Runs last. Turns any error into a clean JSON answer that carries the
 * request ID, so a reported error can be found in the logs.
 *
 * `showDatabaseMessages` is true in development only. A database's own
 * wording can repeat the data that caused the error, so it never reaches the
 * production logs.
 */
export function createErrorMiddleware(options: { showDatabaseMessages: boolean }) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction) => {
    handleError(error, req, res, options.showDatabaseMessages);
  };
}

function handleError(error: unknown, req: Request, res: Response, showDatabaseMessages: boolean) {
  const requestId = req.requestId;

  // A failed database call. The log line holds only the table and action (fixed
  // words we write) and the database's code. The caller learns nothing more
  // than "something went wrong".
  if (error instanceof DatabaseError) {
    req.log.error("request failed", {
      errorName: error.name,
      operation: error.operation,
      dbCode: error.dbCode,
      ...(showDatabaseMessages ? { databaseSaid: error.rawMessage } : {}),
    });
    res.status(500).json({
      error: { code: "internal_error", message: "Internal server error", requestId },
    });
    return;
  }

  // One of our own errors. The log line holds the name and the code only:
  // both are fixed words we write, so they can never hold personal data.
  if (error instanceof AppError) {
    const code = error.code ?? "app_error";
    req.log.warn("request refused", {
      errorName: error.name,
      code,
      status: error.statusCode,
    });
    res.status(error.statusCode).json({
      error: { code, message: error.message, requestId },
    });
    return;
  }

  if (error instanceof ZodError) {
    req.log.warn("request refused", {
      errorName: error.name,
      code: "validation_error",
      status: 400,
    });
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Invalid request body",
        details: z.flattenError(error),
        requestId,
      },
    });
    return;
  }

  // Anything else is a bug or an outside failure. The details go to the logs
  // only; the caller gets a plain message.
  req.log.error("request failed", {
    errorName: error instanceof Error ? error.name : "unknown",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  res.status(500).json({
    error: { code: "internal_error", message: "Internal server error", requestId },
  });
}
