export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code?: string) {
    super(404, message, code);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** The caller is signed in, but may not do this. */
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", code?: string) {
    super(403, message, code ?? "forbidden");
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, "validation_error");
    this.name = "ValidationError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code?: string) {
    super(409, message, code ?? "conflict");
    this.name = "ConflictError";
  }
}

/**
 * Something the API depends on cannot be reached right now, such as the work
 * queue. The request itself was fine, so the caller can try again later.
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string, code?: string) {
    super(503, message, code ?? "service_unavailable");
    this.name = "ServiceUnavailableError";
  }
}

// The error for a failed database call, `DatabaseError`, lives in core, because
// the worker uses the database too.
