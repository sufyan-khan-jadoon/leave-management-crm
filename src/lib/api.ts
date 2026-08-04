import { NextResponse } from "next/server";
import { ZodError, type ZodType, type z } from "zod";

import { AppError, RateLimitError, ValidationError } from "@/lib/errors";

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: string; code: string; details?: unknown };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, { status: 200, ...init });
}

export function created<T>(data: T) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, { status: 201 });
}

export function failure(error: AppError) {
  const headers = error instanceof RateLimitError ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;

  return NextResponse.json<ApiFailure>(
    { success: false, error: error.message, code: error.code, details: error.details },
    { status: error.status, headers },
  );
}

/**
 * Wraps a route handler so every thrown error becomes a well-formed JSON
 * response. Unexpected errors are logged server-side and reported generically
 * so internals never leak to the client.
 */
export function handleRoute<T>(handler: () => Promise<NextResponse<ApiResult<T>>>) {
  return handler().catch((error: unknown) => {
    if (error instanceof AppError) {
      return failure(error);
    }

    if (error instanceof ZodError) {
      return failure(new ValidationError("The submitted data is invalid.", flattenZodError(error)));
    }

    console.error("[api] Unhandled error:", error);
    return NextResponse.json<ApiFailure>(
      { success: false, error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  });
}

/** Parses a JSON request body against a schema, raising ValidationError on failure. */
export async function parseBody<TSchema extends ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("The submitted data is invalid.", flattenZodError(parsed.error));
  }

  return parsed.data;
}

/** Parses URL search params against a schema. */
export function parseQuery<TSchema extends ZodType>(
  request: Request,
  schema: TSchema,
): z.infer<TSchema> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(params);

  if (!parsed.success) {
    throw new ValidationError("Invalid query parameters.", flattenZodError(parsed.error));
  }

  return parsed.data;
}

function flattenZodError(error: ZodError): Record<string, string> {
  return error.issues.reduce<Record<string, string>>((acc, issue) => {
    const key = issue.path.join(".") || "_";
    acc[key] ??= issue.message;
    return acc;
  }, {});
}
