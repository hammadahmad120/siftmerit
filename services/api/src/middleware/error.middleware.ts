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
 */
export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const requestId = req.requestId;

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: { code: error.code ?? "app_error", message: error.message, requestId },
    });
    return;
  }

  if (error instanceof ZodError) {
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
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  res.status(500).json({
    error: { code: "internal_error", message: "Internal server error", requestId },
  });
}
