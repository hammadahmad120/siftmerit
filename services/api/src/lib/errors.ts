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
 * A call to the database (or to Supabase's sign-in service) failed.
 *
 * Its own `message` holds only facts that are safe to log: the table and
 * action in fixed words we write, and the database's error code. The
 * database's own wording is kept apart in `rawMessage`, because it can repeat
 * the data that caused the error, such as an email address. It is shown in
 * development only.
 */
export class DatabaseError extends Error {
  constructor(
    /** Table and action, for example "tenants insert". */
    public readonly operation: string,
    /** The database's error code, for example "23505". Never holds data. */
    public readonly dbCode: string | undefined,
    /** The database's own wording. May hold data. */
    public readonly rawMessage: string,
  ) {
    super(`Database call failed: ${operation}${dbCode ? ` (code ${dbCode})` : ""}`);
    this.name = "DatabaseError";
  }
}

/** Wraps an error object from the Supabase library in a DatabaseError. */
export function toDatabaseError(
  operation: string,
  error: { code?: string; message: string; details?: string | null },
): DatabaseError {
  const raw = error.details ? `${error.message} | ${error.details}` : error.message;
  return new DatabaseError(operation, error.code, raw);
}
