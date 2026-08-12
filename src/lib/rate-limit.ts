import { RateLimitError } from "@/lib/errors";

type Bucket = { count: number; resetAt: number };

// In-memory fixed-window limiter. Sufficient for a single-node deployment and
// local development; swap `store` for Redis/Upstash when running multi-region.
const globalForLimiter = globalThis as unknown as { rateLimitStore?: Map<string, Bucket> };
const store: Map<string, Bucket> = globalForLimiter.rateLimitStore ?? new Map();
globalForLimiter.rateLimitStore = store;

export type RateLimitRule = {
  /** Requests permitted inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export const RATE_LIMITS = {
  login: { limit: 5, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 3600 },
  verifyOtp: { limit: 10, windowSeconds: 900 },
  resendOtp: { limit: 5, windowSeconds: 900 },
  forgotPassword: { limit: 5, windowSeconds: 900 },
  resetPassword: { limit: 10, windowSeconds: 900 },
  // Keyed by account, not IP: this one guards a guessing attack on the current
  // password from a machine the owner left signed in.
  changePassword: { limit: 5, windowSeconds: 900 },
  aiLeave: { limit: 15, windowSeconds: 3600 },
  // Looser than the employee's: an administrator working through a morning's
  // roster asks several questions in a row, and each is a read rather than
  // something that books time off. Still a bound, because it is the same paid
  // AI quota behind both.
  aiAdmin: { limit: 40, windowSeconds: 3600 },
  // Tighter than the questions, and bounding something else entirely: no AI quota
  // is spent here, but every call deletes an account or mails an invitation. A run
  // of these in one hour is either somebody working through a reorganisation or
  // somebody using a session they should not have, and 20 sits comfortably above
  // the first while capping how far the second gets.
  adminStaffAction: { limit: 20, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Consumes one token for `key`, throwing RateLimitError when the window is
 * exhausted. Expired buckets are pruned opportunistically to bound memory.
 */
export function enforceRateLimit(key: string, rule: RateLimitRule): void {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    pruneExpired(now);
    return;
  }

  if (bucket.count >= rule.limit) {
    throw new RateLimitError(
      "Too many attempts. Please wait a moment before trying again.",
      Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    );
  }

  bucket.count += 1;
}

/** Builds a limiter key from the caller's IP and a logical scope. */
export function rateLimitKey(scope: string, request: Request, identifier?: string): string {
  return `${scope}:${identifier ?? clientIp(request)}`;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function pruneExpired(now: number): void {
  if (store.size < 5_000) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}
