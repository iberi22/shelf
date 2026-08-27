import { describe, expect, it } from 'vitest';
import {
  AI_CHAT_RATE_LIMIT,
  buildRateLimitHeaders,
  RATE_LIMIT_HEADERS,
  resolveChatClientKey,
  SlidingWindowRateLimiter,
} from './aiChat';

describe('AI chat rate limit configuration (SHELF-106)', () => {
  it('is configured at 30 requests per minute', () => {
    expect(AI_CHAT_RATE_LIMIT.limit).toBe(30);
    expect(AI_CHAT_RATE_LIMIT.windowMs).toBe(60_000);
  });
});

describe('SlidingWindowRateLimiter', () => {
  it('allows the first 30 requests within a minute', () => {
    const now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({ now: () => now });

    for (let i = 0; i < 30; i += 1) {
      expect(limiter.check('alice').allowed).toBe(true);
    }
  });

  it('blocks the 31st request in the same minute', () => {
    const now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({ now: () => now });

    for (let i = 0; i < 30; i += 1) {
      limiter.check('alice');
    }
    const blocked = limiter.check('alice');

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('reports Retry-After seconds on a blocked request', () => {
    const now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({ now: () => now });

    for (let i = 0; i < 30; i += 1) {
      limiter.check('alice');
    }
    const blocked = limiter.check('alice');

    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    // The oldest timestamp sits at `now`; the window drains 60s later.
    expect(blocked.retryAfterSeconds).toBe(60);
    expect(blocked.resetEpochMs).toBe(now + AI_CHAT_RATE_LIMIT.windowMs);
  });

  it('resets after the window expires', () => {
    let now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({ now: () => now });

    for (let i = 0; i < 30; i += 1) {
      limiter.check('alice');
    }
    expect(limiter.check('alice').allowed).toBe(false);

    now += AI_CHAT_RATE_LIMIT.windowMs + 1;
    expect(limiter.check('alice').allowed).toBe(true);
  });

  it('is a true sliding window: requests age out individually', () => {
    let now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({ now: () => now });

    // 30 requests, 1s apart, all inside the 60s window.
    for (let i = 0; i < 30; i += 1) {
      limiter.check('alice');
      now += 1000;
    }
    expect(limiter.check('alice').allowed).toBe(false);

    // Advance 30 seconds: exactly the oldest request (at t) falls out of the
    // window — the request at t+1s (1_001_000) is still inside until t+61s.
    now += 30_000;
    const result = limiter.check('alice');

    expect(result.allowed).toBe(true);
    // 29 retained + 1 new = 30 inside the window → 0 remaining.
    expect(result.remaining).toBe(0);
  });

  it('gives different users independent limits', () => {
    const now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({ now: () => now });

    for (let i = 0; i < 30; i += 1) {
      limiter.check('alice');
    }
    expect(limiter.check('alice').allowed).toBe(false);
    const bobFirst = limiter.check('bob');
    expect(bobFirst.allowed).toBe(true);
    expect(bobFirst.remaining).toBe(29);
  });

  it('reports the remaining budget on allowed requests', () => {
    const now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({ now: () => now });

    const first = limiter.check('alice');
    expect(first.remaining).toBe(29);

    for (let i = 0; i < 29; i += 1) {
      limiter.check('alice');
    }
    expect(limiter.check('alice').remaining).toBe(0);
  });

  it('peek does not consume quota', () => {
    const now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({ now: () => now });

    expect(limiter.peek('alice').allowed).toBe(true);
    expect(limiter.peek('alice').remaining).toBe(30);

    limiter.check('alice');
    expect(limiter.peek('alice').remaining).toBe(29);
    expect(limiter.peek('alice').remaining).toBe(29);
  });

  it('reset clears all tracked state', () => {
    const now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({ now: () => now });

    for (let i = 0; i < 30; i += 1) {
      limiter.check('alice');
    }
    expect(limiter.check('alice').allowed).toBe(false);

    limiter.reset();
    expect(limiter.size).toBe(0);
    expect(limiter.check('alice').allowed).toBe(true);
  });
});

describe('buildRateLimitHeaders', () => {
  it('emits limit / remaining / reset headers as strings', () => {
    const now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({ now: () => now });
    limiter.check('alice');
    const headers = buildRateLimitHeaders(limiter.peek('alice'));

    expect(headers[RATE_LIMIT_HEADERS.limit]).toBe('30');
    expect(headers[RATE_LIMIT_HEADERS.remaining]).toBe('29');
    expect(headers[RATE_LIMIT_HEADERS.reset]).toMatch(/^\d+$/);
  });
});

describe('resolveChatClientKey', () => {
  it('uses the localAuth bearer token when present (hashed, no raw token retained)', () => {
    const req = new Request('https://shelf.swal.co/api/ai/chat', {
      headers: { authorization: 'Bearer my-local-auth-token' },
    });
    const key = resolveChatClientKey(req);

    expect(key.startsWith('user:')).toBe(true);
    expect(key).not.toContain('my-local-auth-token');
  });

  it('falls back to the caller IP when no token is sent', () => {
    const req = new Request('https://shelf.swal.co/api/ai/chat', {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(resolveChatClientKey(req)).toBe('ip:203.0.113.7');
  });

  it('prefers cf-connecting-ip over x-forwarded-for', () => {
    const req = new Request('https://shelf.swal.co/api/ai/chat', {
      headers: { 'cf-connecting-ip': '198.51.100.9', 'x-forwarded-for': '203.0.113.7' },
    });
    expect(resolveChatClientKey(req)).toBe('ip:198.51.100.9');
  });

  it('collapses anonymous traffic without headers into a shared unknown bucket', () => {
    const req = new Request('https://shelf.swal.co/api/ai/chat', {});
    expect(resolveChatClientKey(req)).toBe('ip:unknown');
  });

  it('treats the same token as the same bucket', () => {
    const token = 'jwt-header.payload.signature';
    const first = resolveChatClientKey(
      new Request('https://shelf.swal.co/api/ai/chat', {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const second = resolveChatClientKey(
      new Request('https://shelf.swal.co/api/ai/chat', {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(first).toBe(second);
  });
});
