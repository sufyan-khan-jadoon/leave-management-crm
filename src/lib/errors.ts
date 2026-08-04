/**
 * Domain errors carry the HTTP status they should surface as, so route
 * handlers can translate any service failure without a chain of instanceof
 * checks.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = "APP_ERROR",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "The submitted data is invalid.", details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in to do that.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "That resource already exists.") {
    super(message, 409, "CONFLICT");
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = "Too many attempts. Please try again later.",
    readonly retryAfterSeconds = 60,
  ) {
    super(message, 429, "RATE_LIMITED");
  }
}

/** Raised when the AI provider is unreachable or returns unusable output after a retry. */
export class AiServiceError extends AppError {
  constructor(message = "The AI assistant could not process that request. Please try again.") {
    super(message, 502, "AI_SERVICE_ERROR");
  }
}
