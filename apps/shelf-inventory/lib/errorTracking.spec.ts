import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sentryMock, browserMock } = vi.hoisted(() => {
  const makeScope = () => ({
    setContext: vi.fn(),
    setTag: vi.fn(),
    addBreadcrumb: vi.fn(),
  });
  return {
    sentryMock: {
      init: vi.fn(),
      browserTracingIntegration: vi.fn(() => ({ name: 'browserTracing' })),
      replayIntegration: vi.fn(() => ({ name: 'replay' })),
      addBreadcrumb: vi.fn(),
      captureException: vi.fn(),
      withScope: vi.fn((callback: (scope: ReturnType<typeof makeScope>) => void) => {
        const scope = makeScope();
        callback(scope);
        return scope;
      }),
    },
    browserMock: {
      makeBrowserOfflineTransport: vi.fn(() => 'offline-transport'),
      makeFetchTransport: vi.fn(() => 'fetch-transport'),
    },
  };
});

vi.mock('@sentry/react', () => sentryMock);
vi.mock('@sentry/browser', () => browserMock);

const VALID_DSN = 'https://abc123@ingest.us.sentry.io/1234567';

type ErrorTrackingModule = typeof import('./errorTracking');

import type { QueuedErrorPayload } from './errorTracking';

const loadModule = (): Promise<ErrorTrackingModule> => import('./errorTracking');

/** Minimal in-memory IndexedDB with real event firing ordering. */
function createMockIndexedDB() {
  const records = new Map<string, unknown>();
  const storeNames = new Set<string>();

  const fireOnComplete = (transaction: { oncomplete: (() => void) | null }) => {
    queueMicrotask(() => {
      transaction.oncomplete?.();
    });
  };

  return {
    open: (_name: string, _version: number) => {
      const request: {
        onupgradeneeded?: (event: Event) => void;
        onsuccess?: (event: Event) => void;
        onerror?: (event: Event) => void;
        result?: unknown;
        error?: Error | null;
      } = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: (name: string) => storeNames.has(name) },
          createObjectStore: (name: string) => {
            storeNames.add(name);
          },
          transaction: (_storeName: string) => {
            const transaction: {
              oncomplete: (() => void) | null;
              onerror: (() => void) | null;
              onabort: (() => void) | null;
              objectStore: (name: string) => {
                put: (value: unknown) => void;
                getAll: () => { onsuccess: ((event: Event) => void) | null };
                clear: () => void;
              };
            } = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore: (_name: string) => ({
                put: (value: unknown) => {
                  records.set((value as { id: string }).id, value);
                  fireOnComplete(transaction);
                },
                getAll: () => {
                  const req: { onsuccess: ((event: Event) => void) | null } = { onsuccess: null };
                  queueMicrotask(() => {
                    req.onsuccess?.(new Event('success'));
                  });
                  Object.defineProperty(req, 'result', {
                    get: () => [...records.values()],
                  });
                  return req;
                },
                clear: () => {
                  records.clear();
                  fireOnComplete(transaction);
                },
              }),
            };
            return transaction;
          },
        };
        request.onupgradeneeded?.(new Event('upgrade'));
        request.onsuccess?.(new Event('success'));
      });
      return request as unknown as IDBOpenDBRequest;
    },
  };
}

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};

const samplePayload = (overrides: Partial<QueuedErrorPayload> = {}) => ({
  id: 'err-1',
  message: 'boom',
  stack: 'Error: boom\n  at fn (file.ts:1:1)',
  context: { source: 'test' },
  breadcrumbs: [{ category: 'p2p', level: 'info' as const, message: 'peer connected', timestamp: 1 }],
  timestamp: '2026-08-26T10:00:00.000Z',
  ...overrides,
});

describe('errorTracking', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('indexedDB', createMockIndexedDB());
    setOnline(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as { onLine?: boolean }).onLine;
  });

  describe('OfflineErrorQueue', () => {
    it('enqueues, peeks, counts and clears payloads', async () => {
      const { OfflineErrorQueue } = await loadModule();
      const queue = new OfflineErrorQueue('shelf-error-queue', 'errors');

      expect(await queue.count()).toBe(0);
      await queue.enqueue(samplePayload({ id: 'err-1' }));
      await queue.enqueue(samplePayload({ id: 'err-2' }));

      expect(await queue.count()).toBe(2);
      const items = await queue.peekAll();
      expect(items.map((i) => i.id).sort()).toEqual(['err-1', 'err-2']);
      expect(items[0]?.breadcrumbs[0]?.message).toBe('peer connected');

      await queue.clear();
      expect(await queue.count()).toBe(0);
    });
  });

  describe('initErrorTracking', () => {
    it('stays disabled and never calls Sentry.init without a DSN', async () => {
      const mod = await loadModule();
      expect(mod.initErrorTracking()).toBe(false);
      expect(mod.isErrorTrackingEnabled()).toBe(false);
      expect(sentryMock.init).not.toHaveBeenCalled();
    });

    it('stays disabled for the placeholder DSN', async () => {
      const mod = await loadModule();
      expect(mod.initErrorTracking('https://key@sentry.example.com/1')).toBe(false);
      expect(sentryMock.init).not.toHaveBeenCalled();
    });

    it('initialises Sentry with a valid DSN and offline transport', async () => {
      const mod = await loadModule();
      expect(mod.initErrorTracking(VALID_DSN)).toBe(true);
      expect(mod.isErrorTrackingEnabled()).toBe(true);
      expect(sentryMock.init).toHaveBeenCalledTimes(1);
      expect(sentryMock.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: VALID_DSN,
          tracesSampleRate: 1.0,
        }),
      );
      expect(browserMock.makeBrowserOfflineTransport).toHaveBeenCalledWith(browserMock.makeFetchTransport);
    });

    it('is idempotent across repeated calls', async () => {
      const mod = await loadModule();
      mod.initErrorTracking(VALID_DSN);
      mod.initErrorTracking();
      expect(sentryMock.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('captureError', () => {
    it('sends directly to Sentry while online and enabled', async () => {
      const mod = await loadModule();
      mod.initErrorTracking(VALID_DSN);
      sentryMock.captureException.mockClear();
      const result = await mod.captureError(new Error('online failure'), { screen: 'pos' });
      expect(result).toBe('sent');
      expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
      const [error, options] = sentryMock.captureException.mock.calls[0] as unknown as [
        Error,
        { extra: Record<string, unknown> },
      ];
      expect(error.message).toBe('online failure');
      expect(options.extra).toEqual({ screen: 'pos' });
    });

    it('ignores online errors when tracking is disabled', async () => {
      const mod = await loadModule();
      await expect(mod.captureError('plain string')).resolves.toBe('ignored');
      expect(sentryMock.captureException).not.toHaveBeenCalled();
    });

    it('queues errors while offline with breadcrumb context', async () => {
      const mod = await loadModule();
      setOnline(false);
      mod.addP2PBreadcrumb('peer-connect', 'peer-42 joined', { level: 'info' });

      const result = await mod.captureError(new Error('offline failure'));
      expect(result).toBe('queued');
      expect(sentryMock.captureException).not.toHaveBeenCalled();
      expect(await mod.offlineQueue.count()).toBe(1);
      const [queued] = await mod.offlineQueue.peekAll();
      expect(queued?.message).toBe('offline failure');
      expect(queued?.breadcrumbs[0]?.message).toBe('peer-42 joined');
    });

    it('normalizes non-Error inputs', async () => {
      const mod = await loadModule();
      mod.initErrorTracking(VALID_DSN);
      sentryMock.captureException.mockClear();
      await mod.captureError({ code: 42 });
      const [error] = sentryMock.captureException.mock.calls[0] as unknown as [Error];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('[object Object]');
    });

    it('drops the payload when IndexedDB is unavailable (ignored)', async () => {
      vi.stubGlobal('indexedDB', undefined);
      const mod = await loadModule();
      setOnline(false);
      await expect(mod.captureError(new Error('no idb'))).resolves.toBe('ignored');
    });
  });

  describe('flushOfflineQueue', () => {
    it('replays queued payloads with offline context and drains the queue', async () => {
      const mod = await loadModule();
      mod.initErrorTracking(VALID_DSN);
      setOnline(false);
      await mod.captureError(new Error('queued-1'));
      await mod.captureError(new Error('queued-2'));

      const flushed = await mod.flushOfflineQueue();
      expect(flushed).toBe(2);
      expect(sentryMock.withScope).toHaveBeenCalledTimes(2);

      const scope = sentryMock.withScope.mock.results[0]?.value as {
        setContext: ReturnType<typeof vi.fn>;
        setTag: ReturnType<typeof vi.fn>;
      };
      expect(scope.setTag).toHaveBeenCalledWith('offline_queued', 'true');
      expect(sentryMock.captureException).toHaveBeenCalledTimes(2);
      expect(await mod.offlineQueue.count()).toBe(0);
    });

    it('returns 0 and drains nothing when the queue is empty', async () => {
      const mod = await loadModule();
      await expect(mod.flushOfflineQueue()).resolves.toBe(0);
      expect(sentryMock.withScope).not.toHaveBeenCalled();
    });
  });

  describe('breadcrumbs', () => {
    it('records P2P breadcrumbs with default level info', async () => {
      const mod = await loadModule();
      mod.addP2PBreadcrumb('peer-connect', 'peer joined');
      const crumbs = mod.getBreadcrumbs();
      expect(crumbs).toHaveLength(1);
      expect(crumbs[0]).toMatchObject({
        category: 'p2p',
        type: 'peer-connect',
        level: 'info',
        message: 'peer joined',
      });
    });

    it('caps the buffer at 30 breadcrumbs and clearBreadcrumbs empties it', async () => {
      const mod = await loadModule();
      for (let i = 0; i < 35; i += 1) {
        mod.addP2PBreadcrumb('event', `msg-${i}`);
      }
      expect(mod.getBreadcrumbs()).toHaveLength(30);
      mod.clearBreadcrumbs();
      expect(mod.getBreadcrumbs()).toHaveLength(0);
    });
  });

  describe('connectivity listeners', () => {
    it('replays the offline queue when the network comes back online', async () => {
      const mod = await loadModule();
      mod.initErrorTracking(VALID_DSN);
      setOnline(false);
      await mod.captureError(new Error('waiting for connectivity'));

      setOnline(true);
      window.dispatchEvent(new Event('online'));
      await vi.waitFor(async () => {
        expect(await mod.offlineQueue.count()).toBe(0);
      });
      expect(sentryMock.captureException).toHaveBeenCalled();
    });
  });
});
