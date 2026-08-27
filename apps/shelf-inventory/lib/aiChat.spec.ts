import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_CHAT_RATE_LIMIT, buildRateLimitHeaders, resolveChatClientKey, SlidingWindowRateLimiter } from './aiChat';

const makeHeaders = (values: Record<string, string>): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(values)) {
    headers.set(key, value);
  }
  return headers;
};

const makeRequest = (headers: Headers): Request => ({ headers }) as unknown as Request;

describe('SlidingWindowRateLimiter', () => {
  let now: number;
  let clock: () => number;

  beforeEach(() => {
    now = 1_000_000;
    clock = () => now;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows requests up to the limit and rejects the overflow', () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 3, windowMs: 60_000, now: clock });
    expect(limiter.check('client-a').allowed).toBe(true);
    expect(limiter.check('client-a').allowed).toBe(true);
    expect(limiter.check('client-a').allowed).toBe(true);
    const blocked = limiter.check('client-a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.resetEpochMs).toBeGreaterThan(now);
  });

  it('reports remaining quota while allowed', () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 5, windowMs: 60_000, now: clock });
    const first = limiter.check('k');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(4);
    expect(first.retryAfterSeconds).toBe(0);
  });

  it('slides the window: expired timestamps no longer count', () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000, now: clock });
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(false);
    now += 60_001;
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000, now: clock });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.size).toBe(2);
  });

  it('peek does not record a request', () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000, now: clock });
    expect(limiter.peek('k').allowed).toBe(true);
    expect(limiter.peek('k').allowed).toBe(true);
    limiter.reset();
    expect(limiter.size).toBe(0);
  });
});

describe('buildRateLimitHeaders', () => {
  it('emits the three standard X-RateLimit-* headers', () => {
    const headers = buildRateLimitHeaders({
      allowed: true,
      remaining: 12,
      retryAfterSeconds: 0,
      resetEpochMs: 1_750_000_000_000,
    });
    expect(headers['X-RateLimit-Limit']).toBe(String(AI_CHAT_RATE_LIMIT.limit));
    expect(headers['X-RateLimit-Remaining']).toBe('12');
    expect(headers['X-RateLimit-Reset']).toBe('1750000000');
  });
});

describe('resolveChatClientKey', () => {
  it('prefers a hashed bearer token over the IP', () => {
    const req = makeRequest(
      makeHeaders({ authorization: 'Bearer super-secret-token', 'cf-connecting-ip': '10.0.0.1' }),
    );
    expect(resolveChatClientKey(req)).toMatch(/^user:/);
    expect(resolveChatClientKey(req)).not.toContain('super-secret-token');
  });

  it('hashes the same token to the same bucket key', () => {
    const req = makeRequest(makeHeaders({ authorization: 'Bearer token-123' }));
    expect(resolveChatClientKey(req)).toBe(resolveChatClientKey(req));
  });

  it('falls back to cf-connecting-ip when no bearer token', () => {
    const req = makeRequest(makeHeaders({ 'cf-connecting-ip': '203.0.113.9' }));
    expect(resolveChatClientKey(req)).toBe('ip:203.0.113.9');
  });

  it('falls back to x-forwarded-for, then to the shared unknown bucket', () => {
    const viaForwarded = makeRequest(makeHeaders({ 'x-forwarded-for': '198.51.100.7' }));
    expect(resolveChatClientKey(viaForwarded)).toBe('ip:198.51.100.7');

    const anonymous = makeRequest(makeHeaders({}));
    expect(resolveChatClientKey(anonymous)).toBe('ip:unknown');
  });
});
