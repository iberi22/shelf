/**
 * cloudSync.ts — Cloud backup & sync for shelf-inventory via Supabase (PostgREST).
 *
 * Shelf is offline-first and replicates via a Yjs CRDT doc over the P2P mesh
 * (`dbSync.doc`). This module adds a durable cloud copy of the same doc so
 * inventory survives device loss, plus a last-writer-wins (LWW) conflict
 * resolution layer on top of the underlying CRDT merge:
 *
 *  1. `CloudSyncProvider` — owns the doc, the Supabase credentials and the
 *     sync loop.
 *  2. `pushToCloud(doc)` — serializes the full Yjs state
 *     (`Y.encodeStateAsUpdate`) and UPSERTs it into a single-row-per-doc
 *     Supabase table.
 *  3. `pullFromCloud()` — downloads the newest row for this doc and applies it
 *     with the `cloud` origin (ignored by the local-change clock, so a pull
 *     never masquerades as a local write).
 *  4. LWW conflict resolution — every row carries `updated_at`; a local
 *     mutation clock is compared against it. The newer side wins the sync
 *     direction, then Yjs merges the content (CRDT), and the merged state is
 *     pushed back so the cloud converges.
 *  5. Auto-sync every 5 minutes while the browser reports online.
 *  6. Offline push queue — pushes attempted while offline (or that fail with a
 *     network error) are queued as encoded deltas and replayed on the `online`
 *     event as a single full-state UPSERT (a full state subsumes every queued
 *     delta).
 *
 * Credentials come from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * (see .env.example). No `@supabase/supabase-js` dependency is needed: the
 * PostgREST REST API is spoken directly with fetch, matching the existing
 * pattern in `p2p-mesh-core/src/cloud-sync.ts`.
 *
 * Supabase table (run once in the SQL editor):
 *   create table cloud_sync (
 *     id         text primary key,          -- doc id (default 'shelf-inventory')
 *     user_id    text not null,             -- device/user that last wrote
 *     state      text not null,             -- base64 Yjs update
 *     updated_at timestamptz not null default now()
 *   );
 *   alter table cloud_sync enable row level security;
 *   create policy "cloud sync upsert" on cloud_sync for insert to anon with check (true);
 *   create policy "cloud sync read"   on cloud_sync for select to anon using (true);
 */
import * as Y from 'yjs';

export const CLOUD_SYNC_ORIGIN = 'cloud';
/** Auto-sync cadence: 5 minutes. */
export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_SYNC_TABLE = 'cloud_sync';
export const DEFAULT_DOC_ID = 'shelf-inventory';

export type SyncDirection = 'push' | 'pull' | 'noop' | 'queued' | 'error';

export interface CloudSyncConfig {
  /** Supabase project URL (VITE_SUPABASE_URL). */
  url: string;
  /** Supabase anon key (VITE_SUPABASE_ANON_KEY). */
  anonKey: string;
  /** PostgREST table used as the cloud backup store. */
  table: string;
  /** Primary key / doc id — one row per inventory doc. */
  docId: string;
  /** Device/user identifier stamped on every row. */
  userId: string;
  /** Auto-sync cadence while online. */
  intervalMs: number;
  /** Injectable fetch implementation (testability / SSR safety). */
  fetchImpl: typeof fetch;
  /** Optional status sink for UI wiring. */
  onStatusChange?: (status: CloudSyncStatus) => void;
}

export interface CloudSyncStatus {
  configured: boolean;
  online: boolean;
  lastPushAt: number | null;
  lastPullAt: number | null;
  lastError: string | null;
  pendingPushes: number;
}

export interface CloudSyncEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

/** Serializes the full Yjs state of a doc into a base64 blob for storage. */
export function encodeStateToBase64(doc: Y.Doc): string {
  return bytesToBase64(Y.encodeStateAsUpdate(doc));
}

/** Restores a stored base64 blob into a Yjs update ready for `Y.applyUpdate`. */
export function decodeStateFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function isNetworkError(error: unknown): boolean {
  // fetch rejects with TypeError on network failures / offline rejects.
  return error instanceof TypeError;
}

function resolveGlobalFetch(): typeof fetch {
  if (typeof fetch === 'undefined') {
    throw new Error('CloudSyncProvider requires a fetch implementation (browser global or injected fetchImpl)');
  }
  return fetch;
}

/**
 * Reads the Supabase credentials from Vite env vars. Accepts an explicit env
 * map for testability; defaults to `import.meta.env`.
 */
export function cloudSyncConfigFromEnv(
  env: CloudSyncEnv | Record<string, string | undefined> = readImportMetaEnv(),
): Pick<CloudSyncConfig, 'url' | 'anonKey'> {
  return {
    url: env.VITE_SUPABASE_URL ?? '',
    anonKey: env.VITE_SUPABASE_ANON_KEY ?? '',
  };
}

function readImportMetaEnv(): Record<string, string | undefined> {
  try {
    return import.meta.env as Record<string, string | undefined>;
  } catch {
    return {};
  }
}

const USER_ID_KEY = 'shelf:cloudSync:userId';

function getOrCreateUserId(): string {
  try {
    const stored = globalThis.localStorage?.getItem(USER_ID_KEY);
    if (stored) return stored;
    const generated = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    globalThis.localStorage?.setItem(USER_ID_KEY, generated);
    return generated;
  } catch {
    return `user-${Math.random().toString(36).slice(2, 12)}`;
  }
}

interface RemoteRow {
  id?: string;
  user_id?: string;
  state?: string;
  updated_at: string;
}

interface QueuedPush {
  state: Uint8Array;
  timestamp: number;
}

export class CloudSyncProvider {
  private readonly doc: Y.Doc;
  private readonly config: CloudSyncConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private online: boolean;
  private lastLocalChangeAt = 0;
  private lastPushAt: number | null = null;
  private lastPullAt: number | null = null;
  private lastError: string | null = null;
  private pendingQueue: QueuedPush[] = [];
  private docListenerAttached = false;

  constructor(doc: Y.Doc, config: Partial<CloudSyncConfig> = {}) {
    this.doc = doc;
    const envCredentials = cloudSyncConfigFromEnv();
    this.config = {
      url: config.url ?? envCredentials.url,
      anonKey: config.anonKey ?? envCredentials.anonKey,
      table: config.table ?? DEFAULT_SYNC_TABLE,
      docId: config.docId ?? DEFAULT_DOC_ID,
      userId: config.userId ?? getOrCreateUserId(),
      intervalMs: config.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS,
      fetchImpl: config.fetchImpl ?? resolveGlobalFetch(),
      onStatusChange: config.onStatusChange,
    };
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    // Track local mutations from the moment the provider exists so the LWW
    // clock is correct even before start() is called.
    this.attachDocListener();
  }

  isConfigured(): boolean {
    return this.config.url.length > 0 && this.config.anonKey.length > 0;
  }

  getStatus(): CloudSyncStatus {
    return {
      configured: this.isConfigured(),
      online: this.online,
      lastPushAt: this.lastPushAt,
      lastPullAt: this.lastPullAt,
      lastError: this.lastError,
      pendingPushes: this.pendingQueue.length,
    };
  }

  /**
   * Starts the sync loop: an immediate sync, then auto-sync every
   * `intervalMs` (5 minutes by default) while online. Registers the
   * online/offline listeners and the local-change clock.
   */
  start(): void {
    if (this.timer) return;
    // Initial sync seeds the cloud copy and/or hydrates from it.
    void this.syncNow();
    this.timer = setInterval(() => {
      void this.syncNow();
    }, this.config.intervalMs);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
    this.attachDocListener();
  }

  /** Stops the sync loop and detaches all listeners. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.detachDocListener();
  }

  /**
   * Serializes the given doc (defaults to the provider doc) and UPSERTs it
   * into Supabase. When offline (or on a network failure) the state is queued
   * instead and replayed once connectivity returns.
   */
  async pushToCloud(doc: Y.Doc = this.doc): Promise<SyncDirection> {
    if (!this.isConfigured()) {
      this.lastError = 'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)';
      this.emitStatus();
      return 'error';
    }
    if (!this.online) {
      this.enqueuePush(doc);
      return 'queued';
    }
    try {
      await this.postState(Y.encodeStateAsUpdate(doc), new Date().toISOString());
      // A full-state push subsumes every queued delta.
      this.pendingQueue = [];
      this.lastPushAt = Date.now();
      this.lastError = null;
      this.emitStatus();
      return 'push';
    } catch (error) {
      if (isNetworkError(error)) {
        this.online = false;
        this.enqueuePush(doc);
        return 'queued';
      }
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emitStatus();
      return 'error';
    }
  }

  /**
   * Downloads the newest cloud row for this doc and applies it to the given
   * doc (defaults to the provider doc) with the `cloud` origin so the local
   * change clock is not polluted by remote writes.
   */
  async pullFromCloud(doc: Y.Doc = this.doc): Promise<SyncDirection> {
    if (!this.isConfigured()) {
      this.lastError = 'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)';
      this.emitStatus();
      return 'error';
    }
    if (!this.online) return 'queued';
    try {
      const row = await this.fetchRemoteRow();
      if (!row?.state) return 'noop';
      Y.applyUpdate(doc, decodeStateFromBase64(row.state), CLOUD_SYNC_ORIGIN);
      this.lastPullAt = Date.now();
      this.lastError = null;
      this.emitStatus();
      return 'pull';
    } catch (error) {
      if (isNetworkError(error)) {
        this.online = false;
        return 'queued';
      }
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emitStatus();
      return 'error';
    }
  }

  /**
   * Runs one full sync cycle with last-writer-wins conflict resolution:
   *  - no cloud row → seed it with a push;
   *  - local change clock >= remote `updated_at` → local is the last writer,
   *    push;
   *  - remote `updated_at` > local change clock → remote is the last writer,
   *    pull + apply, then push the merged state back so the cloud converges.
   * Any pushes queued while offline are replayed first.
   */
  async syncNow(): Promise<SyncDirection> {
    if (!this.isConfigured()) {
      this.lastError = 'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)';
      this.emitStatus();
      return 'error';
    }
    if (!this.online) {
      this.enqueuePush();
      return 'queued';
    }
    if (this.pendingQueue.length > 0) {
      await this.flushPendingPushes();
    }
    try {
      const row = await this.fetchRemoteRow();
      if (!row?.state) return this.pushToCloud();
      const remoteTs = Date.parse(row.updated_at);
      if (Number.isNaN(remoteTs) || this.lastLocalChangeAt >= remoteTs) {
        return this.pushToCloud();
      }
      // Remote is the last writer → apply it, then merge back.
      const pulled = await this.pullFromCloud();
      if (pulled === 'error') return pulled;
      await this.pushToCloud();
      return 'pull';
    } catch (error) {
      if (isNetworkError(error)) {
        this.online = false;
        this.enqueuePush();
        return 'queued';
      }
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emitStatus();
      return 'error';
    }
  }

  /**
   * Replays pushes queued while offline. A single full-state UPSERT subsumes
   * every queued delta (Yjs merges them all), so the whole queue collapses
   * into one request. Returns true when something was flushed.
   */
  async flushPendingPushes(): Promise<boolean> {
    if (this.pendingQueue.length === 0 || !this.online) return false;
    const newest = this.pendingQueue[this.pendingQueue.length - 1];
    try {
      await this.postState(newest.state, new Date(newest.timestamp).toISOString());
      this.pendingQueue = [];
      this.lastPushAt = Date.now();
      this.lastError = null;
      this.emitStatus();
      return true;
    } catch (error) {
      if (isNetworkError(error)) {
        this.online = false;
      }
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emitStatus();
      return false;
    }
  }

  private handleOnline = (): void => {
    this.online = true;
    // Replay queued pushes, then run a normal cycle on top of the merged state.
    void this.flushPendingPushes().then((replayed) => {
      if (replayed) void this.syncNow();
    });
  };

  private handleOffline = (): void => {
    this.online = false;
  };

  private readonly handleDocUpdate = (_update: Uint8Array, origin: unknown): void => {
    // Pulls apply with the `cloud` origin — they must not count as local writes.
    if (origin === CLOUD_SYNC_ORIGIN) return;
    this.lastLocalChangeAt = Date.now();
  };

  private attachDocListener(): void {
    if (this.docListenerAttached) return;
    this.doc.on('update', this.handleDocUpdate);
    this.docListenerAttached = true;
  }

  private detachDocListener(): void {
    if (!this.docListenerAttached) return;
    this.doc.off('update', this.handleDocUpdate);
    this.docListenerAttached = false;
  }

  private enqueuePush(doc: Y.Doc = this.doc): void {
    this.pendingQueue.push({
      state: Y.encodeStateAsUpdate(doc),
      timestamp: Math.max(Date.now(), this.lastLocalChangeAt),
    });
    this.emitStatus();
  }

  private async fetchRemoteRow(): Promise<RemoteRow | null> {
    const url =
      `${this.config.url}/rest/v1/${this.config.table}` +
      `?id=eq.${encodeURIComponent(this.config.docId)}&select=id,state,updated_at&order=updated_at.desc&limit=1`;
    const response = await this.config.fetchImpl(url, {
      method: 'GET',
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Supabase pull failed (${response.status} ${response.statusText})`);
    }
    const rows = (await response.json()) as RemoteRow[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  private async postState(state: Uint8Array, updatedAtIso: string): Promise<void> {
    const url = `${this.config.url}/rest/v1/${this.config.table}`;
    const response = await this.config.fetchImpl(url, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: this.config.docId,
        user_id: this.config.userId,
        state: bytesToBase64(state),
        updated_at: updatedAtIso,
      }),
    });
    if (!response.ok) {
      throw new Error(`Supabase push failed (${response.status} ${response.statusText})`);
    }
  }

  private authHeaders(): Record<string, string> {
    return {
      apikey: this.config.anonKey,
      Authorization: `Bearer ${this.config.anonKey}`,
    };
  }

  private emitStatus(): void {
    this.config.onStatusChange?.(this.getStatus());
  }
}
