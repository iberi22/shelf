import { makeBrowserOfflineTransport, makeFetchTransport } from '@sentry/browser';
import * as Sentry from '@sentry/react';

/**
 * Sentry error tracking for shelf-inventory (offline-first).
 *
 * Responsibilities:
 * - Initialise Sentry with the DSN from `VITE_SENTRY_DSN` (graceful no-op when
 *   the DSN is missing, so the app always boots).
 * - Keep an IndexedDB-backed offline queue: errors captured while the device is
 *   offline are persisted locally and replayed as soon as the network returns.
 * - Record breadcrumbs for P2P events (peer connect/disconnect/sync) that are
 *   attached to both live events and replayed offline errors.
 *
 * The module never throws: every failure path degrades to a console warning so
 * error tracking can never break the application.
 */

export type CaptureResult = 'sent' | 'queued' | 'ignored';

export interface QueuedErrorPayload {
  id: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  breadcrumbs: Sentry.Breadcrumb[];
  timestamp: string;
}

export interface P2PBreadcrumbOptions {
  level?: Sentry.SeverityLevel;
  data?: Record<string, unknown>;
}

const DEFAULT_DB_NAME = 'shelf-error-queue';
const DEFAULT_STORE_NAME = 'errors';
const DB_VERSION = 1;
const MAX_BREADCRUMBS = 30;
const PLACEHOLDER_DSN_MARKER = 'sentry.example.com';

/**
 * IndexedDB-backed FIFO queue for error payloads captured while offline.
 * The store uses `id` as key path, so enqueuing the same payload twice is a
 * no-op overwrite (payload ids are unique, though).
 */
export class OfflineErrorQueue {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName: string = DEFAULT_DB_NAME,
    private readonly storeName: string = DEFAULT_STORE_NAME,
  ) {}

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is not available in this environment'));
          return;
        }
        const request = indexedDB.open(this.dbName, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
      });
      // Drop the cached promise on failure so a later call can retry.
      this.dbPromise.catch(() => {
        this.dbPromise = null;
      });
    }
    return this.dbPromise;
  }

  /** Persist one error payload. Resolves once the transaction commits. */
  async enqueue(payload: QueuedErrorPayload): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      transaction.objectStore(this.storeName).put(payload);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Queue write failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Queue write aborted'));
    });
  }

  /** Read every queued payload without removing them. */
  async peekAll(): Promise<QueuedErrorPayload[]> {
    const db = await this.openDb();
    return new Promise<QueuedErrorPayload[]>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const request = transaction.objectStore(this.storeName).getAll();
      request.onsuccess = () => resolve((request.result ?? []) as QueuedErrorPayload[]);
      request.onerror = () => reject(request.error ?? new Error('Queue read failed'));
    });
  }

  /** Number of payloads currently queued. */
  async count(): Promise<number> {
    const items = await this.peekAll();
    return items.length;
  }

  /** Drop every queued payload (called after a successful replay). */
  async clear(): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      transaction.objectStore(this.storeName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Queue clear failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Queue clear aborted'));
    });
  }
}

/** Shared queue used by `captureError` / `flushOfflineQueue`. */
export const offlineQueue = new OfflineErrorQueue();

let enabled = false;
let initialized = false;
let listenersAttached = false;
let breadcrumbBuffer: Sentry.Breadcrumb[] = [];

/** Whether Sentry was successfully initialised with a real DSN. */
export function isErrorTrackingEnabled(): boolean {
  return enabled;
}

/** Snapshot of the in-memory breadcrumb buffer. */
export function getBreadcrumbs(): Sentry.Breadcrumb[] {
  return [...breadcrumbBuffer];
}

/** Clear the in-memory breadcrumb buffer (useful for tests). */
export function clearBreadcrumbs(): void {
  breadcrumbBuffer = [];
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function appendBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
  breadcrumbBuffer.push(breadcrumb);
  if (breadcrumbBuffer.length > MAX_BREADCRUMBS) {
    breadcrumbBuffer = breadcrumbBuffer.slice(-MAX_BREADCRUMBS);
  }
}

function recordBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
  appendBreadcrumb(breadcrumb);
  if (enabled) {
    try {
      Sentry.addBreadcrumb(breadcrumb);
    } catch {
      // Breadcrumbs must never break the app.
    }
  }
}

function attachConnectivityListeners(): void {
  if (listenersAttached || typeof window === 'undefined') {
    return;
  }
  listenersAttached = true;
  window.addEventListener('online', () => {
    recordBreadcrumb({
      category: 'connection',
      level: 'info',
      message: 'Network is back online',
      timestamp: Date.now() / 1000,
    });
    void flushOfflineQueue();
  });
  window.addEventListener('offline', () => {
    recordBreadcrumb({
      category: 'connection',
      level: 'warning',
      message: 'Network went offline',
      timestamp: Date.now() / 1000,
    });
  });
}

/**
 * Initialise Sentry error tracking.
 *
 * - Reads the DSN from `VITE_SENTRY_DSN` (an explicit `dsn` argument overrides
 *   it, mainly for tests). Without a valid DSN the app simply continues
 *   without error tracking.
 * - Wrapped in try/catch: any Sentry failure must never block the app boot.
 * - Registers window online/offline listeners that replay the offline queue.
 *
 * Idempotent: calling it twice keeps the first result.
 */
export function initErrorTracking(dsn?: string): boolean {
  if (initialized) {
    return enabled;
  }
  initialized = true;
  try {
    const resolvedDsn = (dsn ?? (import.meta.env.VITE_SENTRY_DSN as string | undefined))?.trim();
    if (!resolvedDsn || resolvedDsn.includes(PLACEHOLDER_DSN_MARKER)) {
      console.info('[errorTracking] Sentry disabled: no valid VITE_SENTRY_DSN configured');
      attachConnectivityListeners();
      return false;
    }
    Sentry.init({
      dsn: resolvedDsn,
      integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      // Sentry's own IndexedDB offline transport is kept as a second safety
      // net on top of our explicit offline queue.
      transport: makeBrowserOfflineTransport(makeFetchTransport),
    });
    enabled = true;
    attachConnectivityListeners();
    return true;
  } catch (error) {
    console.warn('[errorTracking] Sentry initialization failed; continuing without error tracking', error);
    attachConnectivityListeners();
    return false;
  }
}

/**
 * Capture an error. While online the error is sent straight to Sentry; while
 * offline the payload (including the current breadcrumb context) is persisted
 * to the IndexedDB queue for later replay.
 */
export async function captureError(error: unknown, context?: Record<string, unknown>): Promise<CaptureResult> {
  const normalized = error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));
  if (isOnline()) {
    if (!enabled) {
      return 'ignored';
    }
    try {
      Sentry.captureException(normalized, context ? { extra: context } : undefined);
      return 'sent';
    } catch {
      return 'ignored';
    }
  }
  const payload: QueuedErrorPayload = {
    id: makeId(),
    message: normalized.message,
    stack: normalized.stack,
    context,
    breadcrumbs: getBreadcrumbs(),
    timestamp: new Date().toISOString(),
  };
  try {
    await offlineQueue.enqueue(payload);
    return 'queued';
  } catch (queueError) {
    console.warn('[errorTracking] Failed to persist offline error; dropping it', queueError);
    return 'ignored';
  }
}

/**
 * Replay every queued error payload to Sentry and clear the queue.
 * Safe to call any time: with no DSN configured the payloads are simply
 * discarded (the queue is still drained).
 */
export async function flushOfflineQueue(): Promise<number> {
  let items: QueuedErrorPayload[] = [];
  try {
    items = await offlineQueue.peekAll();
  } catch (readError) {
    console.warn('[errorTracking] Failed to read offline queue', readError);
    return 0;
  }
  if (items.length === 0) {
    return 0;
  }
  for (const item of items) {
    try {
      if (enabled) {
        Sentry.withScope((scope) => {
          if (item.context) {
            scope.setContext('offlineContext', item.context);
          }
          scope.setTag('offline_queued', 'true');
          scope.setTag('queued_at', item.timestamp);
          for (const breadcrumb of item.breadcrumbs) {
            scope.addBreadcrumb(breadcrumb);
          }
          const error = new Error(item.message);
          if (item.stack) {
            error.stack = item.stack;
          }
          Sentry.captureException(error);
        });
      }
    } catch (sendError) {
      console.warn('[errorTracking] Failed to replay queued error', sendError);
    }
  }
  try {
    await offlineQueue.clear();
  } catch (clearError) {
    console.warn('[errorTracking] Failed to clear replayed queue', clearError);
  }
  return items.length;
}

/**
 * Record a breadcrumb for a P2P event (peer connected / disconnected / sync
 * applied, mesh errors, …). Breadcrumbs are kept locally so they can be
 * attached to errors queued while offline and replayed later.
 */
export function addP2PBreadcrumb(eventType: string, message?: string, options: P2PBreadcrumbOptions = {}): void {
  recordBreadcrumb({
    category: 'p2p',
    type: eventType,
    level: options.level ?? 'info',
    message: message ?? eventType,
    data: options.data,
    timestamp: Date.now() / 1000,
  });
}
