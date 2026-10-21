import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiChatRateLimiter } from '../../lib/aiChat';
import handler from './chat';

const req = (headers: Record<string, string>, method = 'POST') =>
  new Request('https://shelf.swal.co/api/ai/chat', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify({ prompt: 'hi' }) } : {}),
  });

beforeEach(() => {
  aiChatRateLimiter.reset();
  process.env.OPENROUTER_API_KEY = 'test-key';
  delete process.env.ALLOWED_ORIGINS;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })),
  );
});

describe('chat CORS + auth', () => {
  it('never answers with a wildcard origin', async () => {
    const res = await handler(req({ origin: 'https://evil.example', authorization: 'Bearer t' }, 'OPTIONS'));
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
    expect(res.status).toBe(403);
  });
  it('rejects a foreign origin with 403 and no upstream call', async () => {
    const res = await handler(req({ origin: 'https://evil.example', authorization: 'Bearer t' }));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects missing token with 403', async () => {
    const res = await handler(req({ origin: 'https://shelf.swal.co' }));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('allows the app origin with a token and echoes it', async () => {
    const res = await handler(req({ origin: 'https://shelf.swal.co', authorization: 'Bearer t' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://shelf.swal.co');
  });
  it('honours ALLOWED_ORIGINS env', async () => {
    process.env.ALLOWED_ORIGINS = 'https://a.test, https://b.test';
    const ok = await handler(req({ origin: 'https://b.test', authorization: 'Bearer t' }));
    expect(ok.status).toBe(200);
    const bad = await handler(req({ origin: 'https://shelf.swal.co', authorization: 'Bearer t' }));
    expect(bad.status).toBe(403);
  });
});
