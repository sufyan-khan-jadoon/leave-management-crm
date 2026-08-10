import type { ApiResult } from "@/lib/api";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/**
 * Thin fetch wrapper that unwraps the `{ success, data }` envelope and turns
 * failures into a typed error, so callers can `try/catch` instead of branching
 * on response shape.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  // A multipart body must be left to declare its own content type: the boundary
  // is generated per request and lives in that header, so writing
  // `application/json` over it would leave the server unable to parse anything.
  const isMultipart = typeof FormData !== "undefined" && init?.body instanceof FormData;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(isMultipart ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiClientError("Network error. Check your connection and try again.", 0, "NETWORK_ERROR");
  }

  let body: ApiResult<T> | null = null;
  try {
    body = (await response.json()) as ApiResult<T>;
  } catch {
    // Fall through to the status-based error below.
  }

  if (!response.ok || !body?.success) {
    const failure = body && !body.success ? body : null;
    throw new ApiClientError(
      failure?.error ?? "Something went wrong. Please try again.",
      response.status,
      failure?.code ?? "UNKNOWN_ERROR",
      failure?.details as Record<string, string> | undefined,
    );
  }

  return body.data;
}

export const apiClient = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: "GET" }),

  post: <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: "POST", body: payload === undefined ? undefined : JSON.stringify(payload) }),

  /** For a request carrying files. Unwraps the same envelope as the rest. */
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),

  put: <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: "PUT", body: payload === undefined ? undefined : JSON.stringify(payload) }),

  patch: <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: "PATCH", body: payload === undefined ? undefined : JSON.stringify(payload) }),

  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Builds a query string, omitting empty values. */
export function toQueryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}
