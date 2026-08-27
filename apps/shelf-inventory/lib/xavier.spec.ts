import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetXavierSyncScheduler,
  DEFAULT_XAVIER_URL,
  getOrCreateInstanceId,
  getXavierNamespace,
  getXavierUrl,
  INSTANCE_ID_STORAGE_KEY,
  localFallbackStorage,
  probeXavierConnection,
  recordXavierInventorySync,
  resolveXavierPath,
  scheduleXavierInventorySync,
  xavierAdd,
  xavierSearch,
} from './xavier';

type FetchMock = ReturnType<typeof vi.fn>;

const okResponse = (json: unknown) =>
  Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => json });

describe('getXavierUrl / getXavierToken', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the canonical local URL without trailing slash', () => {
    expect(getXavierUrl()).toBe(DEFAULT_XAVIER_URL);
  });

  it('honors VITE_XAVIER_URL and strips a trailing slash', () => {
    vi.stubEnv('VITE_XAVIER_URL', 'https://xavier.internal:8006/');
    expect(getXavierUrl()).toBe('https://xavier.internal:8006');
  });

  it('ignores blank VITE_XAVIER_URL values', () => {
    vi.stubEnv('VITE_XAVIER_URL', '   ');
    expect(getXavierUrl()).toBe(DEFAULT_XAVIER_URL);
  });
});

describe('getOrCreateInstanceId / getXavierNamespace / resolveXavierPath', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists a stable instance id in localStorage', () => {
    const first = getOrCreateInstanceId();
    expect(getOrCreateInstanceId()).toBe(first);
    expect(localStorage.getItem(INSTANCE_ID_STORAGE_KEY)).toBe(first);
  });

  it('builds the canonical app/shelf/instance/{id} namespace', () => {
    localStorage.setItem(INSTANCE_ID_STORAGE_KEY, 'test-instance-1234');
    expect(getXavierNamespace()).toBe('app/shelf/instance/test-instance-1234');
    expect(getXavierNamespace('custom-id')).toBe('app/shelf/instance/custom-id');
  });

  it('resolves relative paths under the namespace', () => {
    localStorage.setItem(INSTANCE_ID_STORAGE_KEY, 'inst-42-abc');
    expect(resolveXavierPath('sync/events')).toBe('app/shelf/instance/inst-42-abc/sync/events');
    expect(resolveXavierPath('/sync/events')).toBe('app/shelf/instance/inst-42-abc/sync/events');
  });

  it('leaves absolute shelf paths untouched and handles the root path', () => {
    expect(resolveXavierPath('app/shelf/instance/other/memories')).toBe(
      'app/shelf/instance/other/memories',
    );
    localStorage.setItem(INSTANCE_ID_STORAGE_KEY, 'inst-42-abc');
    expect(resolveXavierPath('')).toBe('app/shelf/instance/inst-42-abc');
  });
});

describe('InMemoryStorage fallback', () => {
  beforeEach(() => {
    localFallbackStorage.clear();
  });

  it('stores and finds memories by content query', () => {
    localFallbackStorage.add('sync/events', '{"products": 5}');
    const results = localFallbackStorage.search('products');
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toContain('app/shelf/instance/');
  });

  it('searches are case-insensitive over path and content', () => {
    localFallbackStorage.add('Sync/EVENTS', 'Hello World');
    expect(localFallbackStorage.search('hello')).toHaveLength(1);
    expect(localFallbackStorage.search('EVENTS')).toHaveLength(1);
  });

  it('clear removes every memory', () => {
    localFallbackStorage.add('a', '1');
    localFallbackStorage.clear();
    expect(localFallbackStorage.search('1')).toHaveLength(0);
  });
});

describe('xavierAdd / xavierSearch HTTP behavior', () => {
  let fetchMock: FetchMock;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(INSTANCE_ID_STORAGE_KEY, 'inst-http');
    localFallbackStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warnSpy.mockRestore();
  });

  it('falls back to local storage on HTTP 500', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'ERR' });
    const result = await xavierAdd('sync/sales', '{"n":1}');
    expect(result).toEqual({ ok: false, reason: 'http_500' });
    expect(localFallbackStorage.search('sync/sales')).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('treats a non-JSON success body as ok without an id', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => {
      throw new Error('invalid json');
    } });
    await expect(xavierAdd('a', 'b')).resolves.toEqual({ ok: true });
  });

  it('parses array and object search responses', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([{ id: 'm1' }]));
    const arrayResult = await xavierSearch('query');
    expect(arrayResult.ok).toBe(true);
    if (arrayResult.ok) expect(arrayResult.results).toEqual([{ id: 'm1' }]);

    fetchMock.mockImplementation(() => okResponse({ memories: [{ id: 'm2' }] }));
    const objectResult = await xavierSearch('query');
    expect(objectResult.ok).toBe(true);
    if (objectResult.ok) expect(objectResult.results).toEqual([{ id: 'm2' }]);
  });

  it('returns local results when the search endpoint fails', async () => {
    localFallbackStorage.add('sync/events', '{"products": 1}');
    fetchMock.mockResolvedValue({ ok: false, status: 404, statusText: 'NF' });
    const result = await xavierSearch('products');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('http_404');
    expect(result.results).toHaveLength(1);
  });
});

describe('probeXavierConnection', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports connected when /health responds ok', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/health') ? Promise.resolve({ ok: true }) : Promise.resolve({ ok: false }),
    );
    await expect(probeXavierConnection()).resolves.toBe('connected');
  });

  it('falls back to the root endpoint for compatibility', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/health') || url.endsWith('/')
        ? Promise.resolve({ ok: false, status: 404 })
        : Promise.resolve({ ok: false }),
    );
    await expect(probeXavierConnection()).resolves.toBe('connected');
  });

  it('reports disconnected when every endpoint fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(probeXavierConnection()).resolves.toBe('disconnected');
  });
});

describe('scheduleXavierInventorySync / recordXavierInventorySync', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    __resetXavierSyncScheduler();
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem(INSTANCE_ID_STORAGE_KEY, 'inst-sync');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    __resetXavierSyncScheduler();
  });

  it('records an inventory sync event with serialized counts', async () => {
    await recordXavierInventorySync({ products: 3, sales: 2, clients: 1, action: 'daily' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_XAVIER_URL}/memory/add`);
    const body = JSON.parse(String(init.body));
    expect(body.path).toBe('app/shelf/instance/inst-sync/sync/events');
    const payload = JSON.parse(body.content);
    expect(payload.kind).toBe('inventory-sync');
    expect(payload.instanceId).toBe('inst-sync');
    expect(payload.counts).toEqual({ products: 3, sales: 2, clients: 1, suppliers: 0, purchaseOrders: 0 });
    expect(payload.action).toBe('daily');
  });

  it('debounces burst calls into a single sync after the window', async () => {
    scheduleXavierInventorySync({ products: 1, sales: 0 });
    scheduleXavierInventorySync({ products: 2, sales: 0 });
    scheduleXavierInventorySync({ products: 3, sales: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    const payload = JSON.parse(body.content);
    expect(payload.counts.products).toBe(3);
  });

  it('records nothing when the debounce fires without pending counts', async () => {
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});