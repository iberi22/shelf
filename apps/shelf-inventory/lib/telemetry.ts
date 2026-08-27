/**
 * GA4 offline-first telemetry for shelf-inventory.
 *
 * Events are queued in IndexedDB (durable across offline sessions) and flushed
 * to the GA4 Measurement Protocol endpoint in batches of 25 whenever the
 * browser is online. If the queue grows past 500 events, the oldest events are
 * dropped first (FIFO).
 *
 * Configuration (env vars, evaluated at construction):
 *   - VITE_TELEMETRY_DISABLED  'true' | '1'  disables tracking entirely
 *   - VITE_GA4_MEASUREMENT_ID  GA4 measurement id (e.g. G-XXXXXXX)
 *   - VITE_GA4_API_SECRET       Measurement Protocol api secret
 *   - VITE_GA4_ENDPOINT         optional full endpoint override (tests/mocks)
 *
 * NOTE: Measurement Protocol `params` support flat scalar values only
 * (strings/numbers/booleans). Nested objects are rejected by GA4.
 */

import { localAuthManager } from './localAuth';

export interface TelemetryEvent {
  name: string;
  params?: Record<string, unknown>;
  timestamp: number;
}

export interface TelemetryProviderOptions {
  /** GA4 measurement id (overrides VITE_GA4_MEASUREMENT_ID). */
  measurementId?: string;
  /** GA4 Measurement Protocol api secret (overrides VITE_GA4_API_SECRET). */
  apiSecret?: string;
  /** Full Measurement Protocol endpoint override (overrides VITE_GA4_ENDPOINT). */
  endpoint?: string;
  /** Disable telemetry entirely (overrides VITE_TELEMETRY_DISABLED). */
  disabled?: boolean;
  /** Auto-flush cadence in ms (default 60_000). */
  autoFlushIntervalMs?: number;
  /** Initial flush delay after construction in ms (default 3_000). */
  initialFlushDelayMs?: number;
  /** Max queued events, oldest dropped first (default 500). */
  maxQueueSize?: number;
}

const DB_NAME = 'shelf-telemetry';
const DB_VERSION = 1;
const STORE_NAME = 'events';
const CLIENT_ID_KEY = 'shelf_telemetry_client_id';
const MP_BATCH_SIZE = 25;
const MP_DEFAULT_URL = 'https://www.google-analytics.com/mp/collect';

type QueuedEvent = { key: number; event: TelemetryEvent };

const envDisabled = (): boolean => {
  const raw = import.meta.env.VITE_TELEMETRY_DISABLED;
  return raw === 'true' || raw === '1';
};

const hasIndexedDB = (): boolean => typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function';

export class TelemetryProvider {
  readonly disabled: boolean;
  readonly maxQueueSize: number;
  private readonly measurementId: string;
  private readonly apiSecret: string;
  private readonly collectUrl: string;
  private readonly clientId: string;
  private readonly autoFlushIntervalMs: number;
  private readonly initialFlushDelayMs: number;
  private ready: Promise<void>;

  private dbPromise: Promise<IDBDatabase> | null = null;
  private useIdb = false;
  private memoryQueue: QueuedEvent[] | null = null;
  private nextMemoryKey = 1;
  private autoFlushTimer: ReturnType<typeof setInterval> | null = null;
  private initialFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushPromise: Promise<void> | null = null;
  private disposed = false;
  private readonly handleOnline = () => {
    void this.flushEvents();
  };

  constructor(options: TelemetryProviderOptions = {}) {
    this.disabled = options.disabled ?? envDisabled();
    this.maxQueueSize = options.maxQueueSize ?? 500;
    this.measurementId = options.measurementId ?? import.meta.env.VITE_GA4_MEASUREMENT_ID ?? '';
    this.apiSecret = options.apiSecret ?? import.meta.env.VITE_GA4_API_SECRET ?? '';
    const endpointOverride = options.endpoint ?? import.meta.env.VITE_GA4_ENDPOINT ?? null;
    this.collectUrl =
      endpointOverride ??
      `${MP_DEFAULT_URL}?measurement_id=${encodeURIComponent(this.measurementId)}&api_secret=${encodeURIComponent(this.apiSecret)}`;
    this.autoFlushIntervalMs = options.autoFlushIntervalMs ?? 60_000;
    this.initialFlushDelayMs = options.initialFlushDelayMs ?? 3_000;
    this.clientId = this.getOrCreateClientId();

    if (this.disabled) {
      this.ready = Promise.resolve();
      return;
    }

    if (hasIndexedDB()) {
      this.dbPromise = this.openDB()
        .then((db) => {
          this.useIdb = true;
          return db;
        })
        .catch((err) => {
          console.warn('[Telemetry] IndexedDB unavailable, using in-memory queue:', err);
          this.useIdb = false;
          this.memoryQueue = [];
          return null as unknown as IDBDatabase;
        });
      this.ready = this.dbPromise.then(() => undefined);
    } else {
      this.memoryQueue = [];
      this.ready = Promise.resolve();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      this.initialFlushTimer = setTimeout(() => {
        void this.flushEvents();
      }, this.initialFlushDelayMs);
      this.autoFlushTimer = setInterval(() => {
        void this.flushEvents();
      }, this.autoFlushIntervalMs);
    }
  }

  /**
   * Tracks an event. The event is persisted in the IndexedDB queue and, when
   * the browser is online and GA4 is configured, flushed immediately.
   */
  trackEvent(name: string, params?: Record<string, unknown>): Promise<void> {
    if (this.disabled || !name || this.disposed) return Promise.resolve();
    const event: TelemetryEvent = { name, params, timestamp: Date.now() };
    return this.enqueue(event)
      .catch((err) => {
        console.warn('[Telemetry] Failed to enqueue event:', err);
      })
      .then(() => {
        if (this.isOnline() && this.isConfigured()) return this.flushEvents();
      });
  }

  /**
   * Sends all queued events to the GA4 Measurement Protocol endpoint. No-op
   * while offline, when telemetry is disabled, or when GA4 is not configured.
   * Events are only removed from the queue after a successful send, so an
   * offline window or server error never loses events.
   */
  flushEvents(): Promise<void> {
    if (this.disabled || this.disposed || !this.isOnline() || !this.isConfigured()) {
      return Promise.resolve();
    }
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.doFlush().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  /** @deprecated use flushEvents() */
  flushQueue(): Promise<void> {
    return this.flushEvents();
  }

  /** Current number of events waiting in the queue. */
  getQueueSize(): Promise<number> {
    return this.readAll().then((queued) => queued.length);
  }

  /** Stops timers and listeners. Keeps the persisted queue intact. */
  dispose(): void {
    this.disposed = true;
    if (this.autoFlushTimer !== null) {
      clearInterval(this.autoFlushTimer);
      this.autoFlushTimer = null;
    }
    if (this.initialFlushTimer !== null) {
      clearTimeout(this.initialFlushTimer);
      this.initialFlushTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
    }
  }

  /** Test helper: dispose timers and drop the persisted queue. */
  __reset(): void {
    this.dispose();
    void this.clearAll();
  }

  // --- queue persistence -------------------------------------------------

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`indexedDB open failed (${DB_NAME})`));
    });
  }

  private idbReadAll(): Promise<QueuedEvent[]> {
    const db = this.dbPromise as Promise<IDBDatabase>;
    return new Promise((resolve, reject) => {
      void db.then((database) => {
        const tx = database.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).openCursor();
        const queued: QueuedEvent[] = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            queued.push({ key: Number(cursor.key), event: cursor.value as TelemetryEvent });
            cursor.continue();
          } else {
            resolve(queued);
          }
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  private idbGetAllKeys(): Promise<number[]> {
    const db = this.dbPromise as Promise<IDBDatabase>;
    return new Promise((resolve, reject) => {
      void db.then((database) => {
        const tx = database.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).getAllKeys();
        request.onsuccess = () => resolve((request.result as IDBValidKey[]).map((key) => Number(key)));
        request.onerror = () => reject(request.error);
      });
    });
  }

  private idbAddEvent(event: TelemetryEvent): Promise<void> {
    const db = this.dbPromise as Promise<IDBDatabase>;
    return new Promise((resolve, reject) => {
      void db.then((database) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const request = tx.objectStore(STORE_NAME).add(event);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }

  private idbDeleteKeys(keys: number[]): Promise<void> {
    if (keys.length === 0) return Promise.resolve();
    const db = this.dbPromise as Promise<IDBDatabase>;
    return new Promise((resolve, reject) => {
      void db.then((database) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        let pending = keys.length;
        let failed = false;
        for (const key of keys) {
          const request = store.delete(key);
          request.onsuccess = () => {
            pending -= 1;
            if (pending === 0 && !failed) resolve();
          };
          request.onerror = () => {
            failed = true;
            reject(request.error);
          };
        }
      });
    });
  }

  private idbClearAll(): Promise<void> {
    const db = this.dbPromise as Promise<IDBDatabase>;
    return new Promise((resolve, reject) => {
      void db.then((database) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const request = tx.objectStore(STORE_NAME).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }

  private async enqueue(event: TelemetryEvent): Promise<void> {
    await this.ready;
    if (this.useIdb && this.dbPromise) {
      await this.idbAddEvent(event);
      const keys = await this.idbGetAllKeys();
      if (keys.length > this.maxQueueSize) {
        await this.idbDeleteKeys(keys.slice(0, keys.length - this.maxQueueSize));
      }
    } else if (this.memoryQueue) {
      this.memoryQueue.push({ key: this.nextMemoryKey, event });
      this.nextMemoryKey += 1;
      while (this.memoryQueue.length > this.maxQueueSize) {
        this.memoryQueue.shift();
      }
    }
  }

  private async readAll(): Promise<QueuedEvent[]> {
    await this.ready;
    if (this.useIdb && this.dbPromise) {
      return this.idbReadAll();
    }
    return [...(this.memoryQueue ?? [])];
  }

  private async clearAll(): Promise<void> {
    await this.ready;
    if (this.useIdb && this.dbPromise) {
      await this.idbClearAll();
    } else if (this.memoryQueue) {
      this.memoryQueue = [];
    }
  }

  private async deleteKeys(keys: number[]): Promise<void> {
    await this.ready;
    if (this.useIdb && this.dbPromise) {
      await this.idbDeleteKeys(keys);
    } else if (this.memoryQueue) {
      const drop = new Set(keys);
      this.memoryQueue = this.memoryQueue.filter(({ key }) => !drop.has(key));
    }
  }

  // --- flush --------------------------------------------------------------

  private async doFlush(): Promise<void> {
    try {
      const queued = await this.readAll();
      if (queued.length === 0) return;
      const userId = this.getCurrentUserId();
      for (let i = 0; i < queued.length; i += MP_BATCH_SIZE) {
        const chunk = queued.slice(i, i + MP_BATCH_SIZE);
        const payload = {
          client_id: this.clientId,
          ...(userId ? { user_id: userId } : {}),
          events: chunk.map(({ event }) => ({
            name: event.name,
            params: event.params ?? {},
            timestamp_micros: event.timestamp * 1000,
          })),
        };
        const response = await fetch(this.collectUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
          credentials: 'omit',
        });
        if (!response.ok) {
          console.warn(`[Telemetry] GA4 rejected flush (HTTP ${response.status}); events retained for retry.`);
          return;
        }
        await this.deleteKeys(chunk.map(({ key }) => key));
      }
    } catch (err) {
      console.warn('[Telemetry] GA4 flush failed; events retained for retry:', err);
    }
  }

  // --- identity -----------------------------------------------------------

  private getOrCreateClientId(): string {
    let id: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        id = localStorage.getItem(CLIENT_ID_KEY);
      }
    } catch {
      // storage unavailable
    }
    if (!id) {
      id = this.generateClientId();
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(CLIENT_ID_KEY, id);
        }
      } catch {
        // storage unavailable
      }
    }
    return id;
  }

  private generateClientId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${crypto.randomUUID().replace(/-/g, '')}.${Date.now()}`;
    }
    const rand = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    return `${rand()}.${Date.now()}`;
  }

  /** Current signed-in user id from localAuth, when available. */
  private getCurrentUserId(): string | undefined {
    try {
      return localAuthManager.getCurrentUser()?.uid ?? undefined;
    } catch {
      return undefined;
    }
  }

  private isConfigured(): boolean {
    return Boolean(this.measurementId && this.apiSecret);
  }

  private isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : false;
  }
}

export const telemetry = new TelemetryProvider();

// Expose for Playwright testing — SOLO en builds de test (nunca en producción)
if (typeof window !== 'undefined' && import.meta.env.VITE_TEST_MODE === 'true') {
  (window as any)._telemetryForTest = telemetry;
}

export default telemetry;
