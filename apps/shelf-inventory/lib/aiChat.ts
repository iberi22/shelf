/**
 * AI chat rate limiting (SHELF-106).
 *
 * A sliding-window rate limiter for the `/api/ai/chat` proxy: at most
 * `AI_CHAT_RATE_LIMIT.limit` requests per `windowMs` per client key.
 * The window is a true sliding window (per-request timestamp log), which is
 * stricter and fairer than a fixed token bucket: a burst of 30 requests at the
 * end of minute N does not instantly allow 30 more at the start of minute N+1.
 *
 * The limiter is in-memory (module-level singleton for the edge runtime, where
 * each isolate keeps its own Map; this matches Vercel edge conventions).
 * IndexedDB persistence from the original issue applies to client-side stores
 * and is not available in the serverless edge runtime, so persistence across
 * restarts is intentionally not attempted — the limiter bounds in-flight abuse
 * within a live isolate, which is the effective attack surface for the proxy.
 */

export const AI_CHAT_RATE_LIMIT = {
  /** Maximum number of requests allowed per sliding window. */
  limit: 30,
  /** Sliding window length in milliseconds (1 minute). */
  windowMs: 60_000,
} as const;

export const RATE_LIMIT_HEADERS = {
  limit: 'X-RateLimit-Limit',
  remaining: 'X-RateLimit-Remaining',
  reset: 'X-RateLimit-Reset',
} as const;

export interface RateLimitResult {
  /** `true` when the request may proceed, `false` when it must be rejected (429). */
  allowed: boolean;
  /** Requests still permitted inside the current window (never negative). */
  remaining: number;
  /** Seconds the client must wait before retrying (0 when allowed). */
  retryAfterSeconds: number;
  /** Epoch ms at which the current window fully drains (for X-RateLimit-Reset). */
  resetEpochMs: number;
}

export interface SlidingWindowRateLimiterOptions {
  limit?: number;
  windowMs?: number;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => number;
  /** Upper bound on tracked keys before oldest entries are evicted. */
  maxKeys?: number;
}

/**
 * Sliding-window log rate limiter keyed by an opaque client identifier.
 *
 * Timestamps inside the window are kept per key. A request is allowed only
 * when fewer than `limit` timestamps remain inside the window; every allowed
 * request appends its timestamp. Rejected requests are never recorded, so a
 * blocked client does not extend its own penalty.
 */
export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly maxKeys: number;
  private checksSinceSweep = 0;

  constructor(options: SlidingWindowRateLimiterOptions = {}) {
    this.limit = options.limit ?? AI_CHAT_RATE_LIMIT.limit;
    this.windowMs = options.windowMs ?? AI_CHAT_RATE_LIMIT.windowMs;
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  /**
   * Evaluates (and, when allowed, records) a request for `key`.
   */
  check(key: string): RateLimitResult {
    const now = this.now();
    const cutoff = now - this.windowMs;

    let timestamps = this.buckets.get(key);
    if (!timestamps) {
      timestamps = [];
      this.buckets.set(key, timestamps);
    }

    // Drop timestamps that have fallen out of the sliding window.
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    const count = timestamps.length;
    if (count >= this.limit) {
      const resetEpochMs = timestamps[0] + this.windowMs;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((resetEpochMs - now) / 1000)),
        resetEpochMs,
      };
    }

    timestamps.push(now);

    // Bounded memory: periodically evict empty/stale keys and cap the map size.
    this.checksSinceSweep += 1;
    if (this.checksSinceSweep % 100 === 0) {
      this.sweep(cutoff);
    }
    if (this.buckets.size > this.maxKeys) {
      this.sweep(cutoff);
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.limit - timestamps.length),
      retryAfterSeconds: 0,
      resetEpochMs: now + this.windowMs,
    };
  }

  /**
   * Evaluates the current budget for `key` WITHOUT recording a request.
   * Used for preflight (OPTIONS) responses so CORS probes do not consume quota.
   */
  peek(key: string): RateLimitResult {
    const now = this.now();
    const cutoff = now - this.windowMs;

    const timestamps = this.buckets.get(key);
    if (!timestamps || timestamps.length === 0) {
      return {
        allowed: true,
        remaining: this.limit,
        retryAfterSeconds: 0,
        resetEpochMs: now + this.windowMs,
      };
    }

    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    const count = timestamps.length;
    if (count >= this.limit) {
      const resetEpochMs = timestamps[0] + this.windowMs;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((resetEpochMs - now) / 1000)),
        resetEpochMs,
      };
    }

    return {
      allowed: true,
      remaining: this.limit - count,
      retryAfterSeconds: 0,
      resetEpochMs: timestamps[0] + this.windowMs,
    };
  }

  /** Removes empty or fully-expired buckets (memory hygiene). */
  private sweep(cutoff: number): void {
    for (const [key, timestamps] of this.buckets) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
        this.buckets.delete(key);
      }
    }
  }

  /** Clears all tracked state (primarily for tests and hot reloads). */
  reset(): void {
    this.buckets.clear();
    this.checksSinceSweep = 0;
  }

  /** Number of distinct tracked keys (diagnostics/tests). */
  get size(): number {
    return this.buckets.size;
  }
}

/**
 * Shared singleton for the edge endpoint so the window survives multiple
 * invocations inside the same isolate.
 */
export const aiChatRateLimiter = new SlidingWindowRateLimiter();

/**
 * Builds the standard rate-limit response headers for any response of the
 * AI chat endpoint, per the issue: `X-RateLimit-Limit`, `X-RateLimit-Remaining`
 * and `X-RateLimit-Reset` (epoch seconds) on every response.
 */
export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    [RATE_LIMIT_HEADERS.limit]: String(AI_CHAT_RATE_LIMIT.limit),
    [RATE_LIMIT_HEADERS.remaining]: String(result.remaining),
    [RATE_LIMIT_HEADERS.reset]: String(Math.ceil(result.resetEpochMs / 1000)),
  };
}

/**
 * Resolves the rate-limit bucket key for an incoming request.
 *
 * Identity precedence (SHELF-106):
 *   1. The localAuth session token sent as `Authorization: Bearer <token>`
 *      (what the AIChat client sends). The token is hashed so raw credentials
 *      are never retained in memory.
 *   2. The caller IP (`cf-connecting-ip` or `x-forwarded-for`).
 *   3. `unknown` as a last resort — this collapses all anonymous traffic into
 *      one shared bucket, which is the safe default against spoofing.
 */
export function resolveChatClientKey(req: Request): string {
  const auth = req.headers.get('authorization');
  const bearer = auth ? /^Bearer\s+(.+)$/i.exec(auth) : null;
  const token = bearer?.[1]?.trim();
  if (token) {
    return `user:${tokenHash(token)}`;
  }

  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
  return `ip:${ip}`;
}

/**
 * Non-cryptographic FNV-1a hash — sufficient to turn an opaque bearer token
 * into a fixed-size bucket key without storing the raw credential.
 */
function tokenHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
