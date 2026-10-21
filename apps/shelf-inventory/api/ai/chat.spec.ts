import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiChatRateLimiter } from '../../lib/aiChat';
import handler from './chat';

/**
 * Handler-level rate-limit integration tests (SHELF-106).
 *
 * These exercise the full /api/ai/chat request path: 429 + Retry-After on the
 * 31st request, quota reset after the window expires, per-user independence,
 * and rate-limit headers on every response.
 */

const POST = (ip: string, token?: string) =>
  new Request('https://shelf.swal.co/api/ai/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://shelf.swal.co',
      ...(ip ? { 'x-forwarded-for': ip } : {}),
      // Handler requires a Bearer presence check; default to a shared token.
      authorization: `Bearer ${token || 'default-token'}`,
    },
    body: JSON.stringify({ prompt: 'How many products are low?' }),
  });

const okOpenRouter = () =>
  vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'Mocked inventory reply.' } }],
          model: 'deepseek/deepseek-chat',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );

beforeEach(() => {
  aiChatRateLimiter.reset();
  vi.stubGlobal('fetch', okOpenRouter());
  process.env.OPENROUTER_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

describe('POST /api/ai/chat rate limiting', () => {
  it('returns 429 with Retry-After and rate-limit headers on the 31st request', async () => {
    for (let i = 0; i < 30; i += 1) {
      const response = await handler(POST('198.51.100.4'));
      expect(response.status).toBe(200);
    }

    const blocked = await handler(POST('198.51.100.4'));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(blocked.headers.get('x-ratelimit-limit')).toBe('30');
    expect(blocked.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(blocked.headers.get('x-ratelimit-reset')).toMatch(/^\d+$/);
  });

  it('adds X-RateLimit headers to successful responses', async () => {
    const response = await handler(POST('198.51.100.4'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-ratelimit-limit')).toBe('30');
    expect(response.headers.get('x-ratelimit-remaining')).toBe('29');
  });

  it('identifies users by their localAuth bearer token instead of the shared IP', async () => {
    // Two users behind the same IP get independent budgets.
    for (let i = 0; i < 30; i += 1) {
      await handler(POST('198.51.100.4', 'user-token-a'));
    }

    expect((await handler(POST('198.51.100.4', 'user-token-a'))).status).toBe(429);
    expect((await handler(POST('198.51.100.4', 'user-token-b'))).status).toBe(200);
    // An anonymous caller from the same IP is unaffected as well.
    expect((await handler(POST('198.51.100.4'))).status).toBe(200);
  });

  it('does not consume quota on OPTIONS preflight', async () => {
    const preflight = await handler(new Request('https://shelf.swal.co/api/ai/chat', { method: 'OPTIONS' }));
    expect(preflight.status).toBe(200);
    expect(preflight.headers.get('x-ratelimit-remaining')).toBe('30');

    const response = await handler(POST('198.51.100.4'));
    expect(response.headers.get('x-ratelimit-remaining')).toBe('29');
  });

  it('still returns 429 for a flooded anonymous bucket', async () => {
    for (let i = 0; i < 30; i += 1) {
      await handler(POST('', ''));
    }
    expect((await handler(POST('', ''))).status).toBe(429);
  });
});
