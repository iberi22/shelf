import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIndexedDBMock, resetIndexedDBMock, uninstallIndexedDBMock } from './__tests__/idb-mock';
import { TelemetryProvider, telemetry } from './telemetry';

/**
 * Mock navigator.onLine (jsdom exposes it as a plain property).
 */
const mockOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
};

const GA_OPTS = {
  measurementId: 'G-TEST',
  apiSecret: 'test-secret',
  endpoint: 'http://telemetry.test/mp/collect',
};

const postBody = (fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) => {
  const options = fetchMock.mock.calls[callIndex]?.[1] as { body?: string } | undefined;
  return JSON.parse(options?.body ?? '{}') as {
    client_id: string;
    user_id?: string;
    events: Array<{ name: string; timestamp_micros: number }>;
  };
};

describe('TelemetryProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    installIndexedDBMock();
    resetIndexedDBMock();
    mockOnline(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exports a ready-to-use singleton instance', () => {
    expect(telemetry).toBeInstanceOf(TelemetryProvider);
  });

  it('is disabled when VITE_TELEMETRY_DISABLED is set', async () => {
    vi.stubEnv('VITE_TELEMETRY_DISABLED', 'true');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new TelemetryProvider({ ...GA_OPTS });
    expect(provider.disabled).toBe(true);

    await provider.trackEvent('should_not_track');
    expect(await provider.getQueueSize()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is enabled by default without the env var', () => {
    vi.stubEnv('VITE_TELEMETRY_DISABLED', 'false');
    const provider = new TelemetryProvider();
    expect(provider.disabled).toBe(false);
  });

  it('queues events in IndexedDB while offline and sends them on flush', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TelemetryProvider(GA_OPTS);
    mockOnline(false);

    await provider.trackEvent('product_created', { sku: 'ABC-1' });
    await provider.trackEvent('sale_completed', { total: 42.5 });

    // Persisted in IndexedDB, not sent while offline
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await provider.getQueueSize()).toBe(2);

    mockOnline(true);
    await provider.flushEvents();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = postBody(fetchMock);
    expect(body.client_id).toBeTruthy();
    expect(body.events).toHaveLength(2);
    expect(body.events[0]?.name).toBe('product_created');
    expect(body.events[0]?.timestamp_micros).toBeGreaterThan(0);
    expect(body.events[1]?.name).toBe('sale_completed');
    expect(await provider.getQueueSize()).toBe(0);
    provider.dispose();
  });

  it('sends events immediately when online', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TelemetryProvider(GA_OPTS);

    await provider.trackEvent('online_event');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postBody(fetchMock).events[0]?.name).toBe('online_event');
    expect(await provider.getQueueSize()).toBe(0);
    provider.dispose();
  });

  it('uses the localAuth userId when a local account exists', async () => {
    localStorage.setItem(
      'local_account',
      JSON.stringify({ id: 'local-user-123', email: 'owner@test.dev', subscriptionTier: 'free' }),
    );
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TelemetryProvider(GA_OPTS);

    await provider.trackEvent('app_init');

    expect(postBody(fetchMock).user_id).toBe('local-user-123');
    provider.dispose();
  });

  it('omits user_id for anonymous users', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TelemetryProvider(GA_OPTS);

    await provider.trackEvent('app_init');

    expect(postBody(fetchMock).user_id).toBeUndefined();
    provider.dispose();
  });

  it('keeps events queued when the server rejects the flush', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TelemetryProvider(GA_OPTS);
    mockOnline(false);

    await provider.trackEvent('will_retry');
    mockOnline(true);
    await provider.flushEvents();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await provider.getQueueSize()).toBe(1);

    // Succeeds on the next attempt
    fetchMock.mockResolvedValue({ ok: true });
    await provider.flushEvents();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await provider.getQueueSize()).toBe(0);
    provider.dispose();
  });

  it('caps the queue at maxQueueSize dropping the oldest events first (FIFO)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TelemetryProvider({ ...GA_OPTS, maxQueueSize: 5 });
    mockOnline(false);

    for (let i = 0; i < 8; i += 1) {
      await provider.trackEvent(`evt_${i}`);
    }

    expect(await provider.getQueueSize()).toBe(5);
    mockOnline(true);
    await provider.flushEvents();
    const names = postBody(fetchMock).events.map((e) => e.name);
    expect(names).toEqual(['evt_3', 'evt_4', 'evt_5', 'evt_6', 'evt_7']);
    provider.dispose();
  });

  it('flushes in Measurement Protocol batches of 25 events', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TelemetryProvider(GA_OPTS);
    mockOnline(false);

    for (let i = 0; i < 30; i += 1) {
      await provider.trackEvent(`batch_evt_${i}`);
    }

    mockOnline(true);
    await provider.flushEvents();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(postBody(fetchMock, 0).events).toHaveLength(25);
    expect(postBody(fetchMock, 1).events).toHaveLength(5);
    expect(postBody(fetchMock, 0).events[0]?.name).toBe('batch_evt_0');
    expect(postBody(fetchMock, 1).events[4]?.name).toBe('batch_evt_29');
    provider.dispose();
  });

  it('auto-flushes queued events every 60 seconds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TelemetryProvider({
      ...GA_OPTS,
      autoFlushIntervalMs: 60_000,
      initialFlushDelayMs: 999_999,
    });
    mockOnline(false);

    await provider.trackEvent('auto_flush_event');
    expect(fetchMock).not.toHaveBeenCalled();

    mockOnline(true);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postBody(fetchMock).events[0]?.name).toBe('auto_flush_event');
    expect(await provider.getQueueSize()).toBe(0);
    provider.dispose();
  });

  it('persists the queue in IndexedDB across provider instances', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    mockOnline(false);

    const first = new TelemetryProvider(GA_OPTS);
    await first.trackEvent('durable_1');
    await first.trackEvent('durable_2');
    expect(await first.getQueueSize()).toBe(2);
    first.dispose();

    // A brand new provider reads the same IndexedDB-backed queue
    const second = new TelemetryProvider(GA_OPTS);
    expect(await second.getQueueSize()).toBe(2);
    mockOnline(true);
    await second.flushEvents();
    expect(postBody(fetchMock).events.map((e) => e.name)).toEqual(['durable_1', 'durable_2']);
    expect(await second.getQueueSize()).toBe(0);
    second.dispose();
  });

  it('degrades to an in-memory queue when IndexedDB is unavailable', async () => {
    uninstallIndexedDBMock();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TelemetryProvider(GA_OPTS);
    mockOnline(false);

    await provider.trackEvent('memory_event');
    expect(await provider.getQueueSize()).toBe(1);

    mockOnline(true);
    await provider.flushEvents();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postBody(fetchMock).events[0]?.name).toBe('memory_event');
    provider.dispose();
  });
});
