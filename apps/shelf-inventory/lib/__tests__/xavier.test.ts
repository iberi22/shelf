import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetXavierSyncScheduler,
  DEFAULT_XAVIER_URL,
  getOrCreateInstanceId,
  INSTANCE_ID_STORAGE_KEY,
  xavierAdd,
  xavierSearch,
} from '../xavier';

describe('xavier client', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetXavierSyncScheduler();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetXavierSyncScheduler();
  });

  it('getOrCreateInstanceId persists UUID under shelf_instance_id', () => {
    const first = getOrCreateInstanceId();
    const second = getOrCreateInstanceId();
    expect(first).toBe(second);
    expect(localStorage.getItem(INSTANCE_ID_STORAGE_KEY)).toBe(first);
    expect(first.length).toBeGreaterThanOrEqual(8);
  });

  it('xavierAdd uses canonical namespace path', async () => {
    localStorage.setItem(INSTANCE_ID_STORAGE_KEY, 'test-instance-uuid');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'mem-1', status: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await xavierAdd('sync/events', '{"hello":true}');

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_XAVIER_URL}/memory/add`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.path).toBe('app/shelf/instance/test-instance-uuid/sync/events');
    expect(body.content).toBe('{"hello":true}');
  });

  it('xavierSearch builds POST /memory/search correctly', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: '1' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await xavierSearch('inventory sync');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.results).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_XAVIER_URL}/memory/search`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ query: 'inventory sync' });
  });

  it('fails gracefully without throwing when server is down', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(xavierAdd('sync/events', 'x')).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });
    await expect(xavierSearch('q')).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
      results: [],
    });
    expect(warn).toHaveBeenCalled();
  });
});
