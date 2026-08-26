import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  type CloudSyncConfig,
  CloudSyncProvider,
  cloudSyncConfigFromEnv,
  DEFAULT_DOC_ID,
  DEFAULT_SYNC_INTERVAL_MS,
  decodeStateFromBase64,
  encodeStateToBase64,
} from './cloudSync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

function responseStub(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function recordRequest(input: RequestInfo | URL, init?: RequestInit): RecordedRequest {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  return {
    method: init?.method ?? 'GET',
    url: String(input),
    headers,
    body,
  };
}

function createFetchRecorder(handler: (request: RecordedRequest) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  fetchMock: ReturnType<typeof vi.fn>;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = recordRequest(input, init);
    requests.push(request);
    return handler(request);
  });
  return {
    fetchImpl: fetchMock as unknown as typeof fetch,
    fetchMock,
    requests,
  };
}

function makeConfig(fetchImpl: typeof fetch, overrides: Partial<CloudSyncConfig> = {}): CloudSyncConfig {
  return {
    url: 'https://abc.supabase.co',
    anonKey: 'anon-key',
    table: 'cloud_sync',
    docId: DEFAULT_DOC_ID,
    userId: 'test-user',
    intervalMs: DEFAULT_SYNC_INTERVAL_MS,
    fetchImpl,
    ...overrides,
  };
}

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (navigator as unknown as { onLine?: boolean }).onLine;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cloudSync env configuration', () => {
  it('reads Supabase credentials from Vite env vars', () => {
    const creds = cloudSyncConfigFromEnv({
      VITE_SUPABASE_URL: 'https://proj.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-123',
    });
    expect(creds.url).toBe('https://proj.supabase.co');
    expect(creds.anonKey).toBe('anon-123');
  });

  it('returns error without hitting the network when credentials are missing', async () => {
    const fetchImpl = vi.fn();
    const provider = new CloudSyncProvider(
      new Y.Doc(),
      makeConfig(fetchImpl as unknown as typeof fetch, { url: '', anonKey: '' }),
    );
    expect(provider.isConfigured()).toBe(false);
    expect(await provider.syncNow()).toBe('error');
    expect(await provider.pushToCloud()).toBe('error');
    expect(await provider.pullFromCloud()).toBe('error');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(provider.getStatus().lastError).toContain('VITE_SUPABASE_URL');
  });
});

describe('pushToCloud', () => {
  it('serializes the Yjs state and upserts it into Supabase', async () => {
    const { fetchImpl, requests } = createFetchRecorder(() => responseStub({}));
    const doc = new Y.Doc();
    doc.getMap('products').set('p1', { name: 'Laptop' });
    const provider = new CloudSyncProvider(doc, makeConfig(fetchImpl));

    const result = await provider.pushToCloud();
    expect(result).toBe('push');
    expect(requests.length).toBe(1);

    const post = requests[0];
    expect(post.method).toBe('POST');
    expect(post.url).toContain('/rest/v1/cloud_sync');
    expect(post.headers.apikey).toBe('anon-key');
    expect(post.headers.Authorization).toBe('Bearer anon-key');
    expect(post.headers.Prefer).toBe('resolution=merge-duplicates');
    expect(post.body?.id).toBe(DEFAULT_DOC_ID);
    expect(post.body?.user_id).toBe('test-user');
    expect(post.body?.updated_at).toBeTruthy();

    // The base64 state round-trips into the same Yjs content.
    const replay = new Y.Doc();
    Y.applyUpdate(replay, decodeStateFromBase64(String(post.body?.state)));
    expect(replay.getMap('products').get('p1')).toEqual({ name: 'Laptop' });

    const status = provider.getStatus();
    expect(status.lastPushAt).not.toBeNull();
    expect(status.pendingPushes).toBe(0);
  });

  it('returns queued instead of pushing when offline', async () => {
    setNavigatorOnline(false);
    const { fetchImpl, requests } = createFetchRecorder(() => responseStub({}));
    const doc = new Y.Doc();
    doc.getMap('products').set('p1', { name: 'Local' });
    const provider = new CloudSyncProvider(doc, makeConfig(fetchImpl));

    expect(await provider.pushToCloud()).toBe('queued');
    expect(requests.length).toBe(0);
    expect(provider.getStatus().pendingPushes).toBe(1);
  });
});

describe('pullFromCloud', () => {
  it('downloads the remote state and applies it to the local doc', async () => {
    const remote = new Y.Doc();
    remote.getMap('products').set('p2', { name: 'Monitor' });
    const { fetchImpl, requests } = createFetchRecorder(() =>
      responseStub([
        {
          id: DEFAULT_DOC_ID,
          user_id: 'u',
          state: encodeStateToBase64(remote),
          updated_at: '2026-08-26T10:00:00.000Z',
        },
      ]),
    );
    const doc = new Y.Doc();
    doc.getMap('products').set('p1', { name: 'Laptop' });
    const provider = new CloudSyncProvider(doc, makeConfig(fetchImpl));

    const result = await provider.pullFromCloud();
    expect(result).toBe('pull');

    const get = requests[0];
    expect(get.method).toBe('GET');
    expect(get.url).toContain('/rest/v1/cloud_sync');
    expect(get.url).toContain(`id=eq.${DEFAULT_DOC_ID}`);

    // Local + remote content coexist (CRDT merge).
    expect(doc.getMap('products').get('p1')).toEqual({ name: 'Laptop' });
    expect(doc.getMap('products').get('p2')).toEqual({ name: 'Monitor' });
    expect(provider.getStatus().lastPullAt).not.toBeNull();
  });

  it('returns noop when the cloud has no row for this doc', async () => {
    const { fetchImpl } = createFetchRecorder(() => responseStub([]));
    const provider = new CloudSyncProvider(new Y.Doc(), makeConfig(fetchImpl));
    expect(await provider.pullFromCloud()).toBe('noop');
    expect(provider.getStatus().lastPullAt).toBeNull();
  });
});

describe('conflict resolution (last-writer-wins)', () => {
  it('pushes when the local change is the last writer (local clock >= remote updated_at)', async () => {
    const { fetchImpl, requests } = createFetchRecorder((request) => {
      if (request.method === 'GET') {
        return responseStub([
          {
            id: DEFAULT_DOC_ID,
            user_id: 'other',
            state: encodeStateToBase64(new Y.Doc()),
            updated_at: new Date(Date.now() - 60_000).toISOString(), // older than local change
          },
        ]);
      }
      return responseStub({});
    });
    const doc = new Y.Doc();
    const provider = new CloudSyncProvider(doc, makeConfig(fetchImpl));
    doc.getMap('products').set('p1', { name: 'Local' }); // local write happens now

    const result = await provider.syncNow();
    expect(result).toBe('push');
    const posts = requests.filter((r) => r.method === 'POST');
    expect(posts.length).toBe(1);
  });

  it('pulls and merges when the remote row is the last writer (remote updated_at > local clock)', async () => {
    const remote = new Y.Doc();
    remote.getMap('products').set('remote', { name: 'Remote' });
    const { fetchImpl, requests } = createFetchRecorder((request) => {
      if (request.method === 'GET') {
        return responseStub([
          {
            id: DEFAULT_DOC_ID,
            user_id: 'other',
            state: encodeStateToBase64(remote),
            updated_at: new Date(Date.now() + 60_000).toISOString(), // future — remote wins
          },
        ]);
      }
      return responseStub({});
    });
    const doc = new Y.Doc();
    const provider = new CloudSyncProvider(doc, makeConfig(fetchImpl));
    doc.getMap('products').set('local', { name: 'Local' });

    const result = await provider.syncNow();
    expect(result).toBe('pull');

    // Remote state applied locally, local changes preserved.
    expect(doc.getMap('products').get('remote')).toEqual({ name: 'Remote' });
    expect(doc.getMap('products').get('local')).toEqual({ name: 'Local' });

    // Merged state pushed back so the cloud converges.
    const posts = requests.filter((r) => r.method === 'POST');
    expect(posts.length).toBe(1);
    const replay = new Y.Doc();
    Y.applyUpdate(replay, decodeStateFromBase64(String(posts[0].body?.state)));
    expect(replay.getMap('products').get('remote')).toEqual({ name: 'Remote' });
    expect(replay.getMap('products').get('local')).toEqual({ name: 'Local' });
  });
});

describe('offline queue', () => {
  it('queues pushes while offline and replays them when back online', async () => {
    setNavigatorOnline(false);
    const { fetchImpl, requests } = createFetchRecorder(() => responseStub({}));
    const doc = new Y.Doc();
    doc.getMap('products').set('p1', { name: 'Local' });
    const provider = new CloudSyncProvider(doc, makeConfig(fetchImpl));

    expect(await provider.pushToCloud()).toBe('queued');
    expect(await provider.pushToCloud()).toBe('queued');
    expect(requests.length).toBe(0);
    expect(provider.getStatus().pendingPushes).toBe(2);

    provider.start(); // attaches online/offline listeners (+ queues the initial offline sync)
    await vi.waitFor(() => expect(provider.getStatus().pendingPushes).toBeGreaterThanOrEqual(2));

    setNavigatorOnline(true);
    window.dispatchEvent(new Event('online'));

    await vi.waitFor(() => expect(provider.getStatus().pendingPushes).toBe(0));
    const posts = requests.filter((r) => r.method === 'POST');
    expect(posts.length).toBeGreaterThanOrEqual(1);
    expect(posts[0].url).toContain('/rest/v1/cloud_sync');
    provider.stop();
  });

  it('falls back to the queue when the network request itself fails, then replays on recovery', async () => {
    const failingImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    });
    const doc = new Y.Doc();
    doc.getMap('products').set('p1', { name: 'Local' });
    const provider = new CloudSyncProvider(doc, makeConfig(failingImpl as unknown as typeof fetch));
    provider.start();

    // start()'s initial sync fails with a network error → queued + offline flag.
    await vi.waitFor(() => expect(provider.getStatus().pendingPushes).toBeGreaterThanOrEqual(1));
    expect(provider.getStatus().online).toBe(false);

    expect(await provider.pushToCloud()).toBe('queued');
    expect(provider.getStatus().pendingPushes).toBeGreaterThanOrEqual(2);

    // Recovery: fetch starts succeeding again and the online event replays the queue.
    failingImpl.mockImplementation(async () => responseStub({}));
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(provider.getStatus().pendingPushes).toBe(0));
    const posts = failingImpl.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts.length).toBeGreaterThanOrEqual(1);
    provider.stop();
  });
});

describe('auto-sync loop', () => {
  it('auto-syncs immediately on start and every 5 minutes while online', async () => {
    vi.useFakeTimers();
    const { fetchImpl, requests } = createFetchRecorder((request) =>
      request.method === 'GET' ? responseStub([]) : responseStub({}),
    );
    const provider = new CloudSyncProvider(new Y.Doc(), makeConfig(fetchImpl));

    provider.start();
    // Initial sync: GET (no row) + seed POST.
    await vi.waitFor(() => expect(requests.length).toBe(2));

    await vi.advanceTimersByTimeAsync(DEFAULT_SYNC_INTERVAL_MS);
    expect(requests.length).toBe(4);

    await vi.advanceTimersByTimeAsync(DEFAULT_SYNC_INTERVAL_MS);
    expect(requests.length).toBe(6);

    provider.stop();
    const afterStop = requests.length;
    await vi.advanceTimersByTimeAsync(DEFAULT_SYNC_INTERVAL_MS * 3);
    expect(requests.length).toBe(afterStop);
  });
});
