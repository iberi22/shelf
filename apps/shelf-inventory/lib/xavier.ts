/**
 * Xavier memory client — SWAL DoD namespace `app/shelf/instance/{instanceId}`.
 *
 * Best-effort / offline-first: if Xavier is unreachable or misconfigured,
 * operations log a warning and resolve without throwing.
 */

import { generateId } from '../utils/id';

export const XAVIER_APP_ID = 'shelf';
export const INSTANCE_ID_STORAGE_KEY = 'shelf_instance_id';
export const DEFAULT_XAVIER_URL = 'http://localhost:8006';

export type XavierConnectionStatus = 'connected' | 'disconnected' | 'unknown';

export type XavierSyncCounts = {
  products: number;
  sales: number;
  clients?: number;
  suppliers?: number;
  purchaseOrders?: number;
  action?: string;
};

export type XavierAddResult = { ok: true; id?: string } | { ok: false; reason: string };
export type XavierSearchResult = { ok: true; results: unknown[] } | { ok: false; reason: string; results: unknown[] };

const SYNC_DEBOUNCE_MS = 2_000;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSyncCounts: XavierSyncCounts | null = null;

function readEnv(key: 'VITE_XAVIER_URL' | 'VITE_XAVIER_TOKEN'): string | undefined {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      const value = import.meta.env[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
  } catch {
    // ignore — vitest / non-vite contexts
  }
  return undefined;
}

/** Base URL for Xavier HTTP API (no trailing slash). */
export function getXavierUrl(): string {
  return (readEnv('VITE_XAVIER_URL') || DEFAULT_XAVIER_URL).replace(/\/$/, '');
}

export function getXavierToken(): string | undefined {
  return readEnv('VITE_XAVIER_TOKEN');
}

/** Stable per-install instance id (UUID), persisted in localStorage. */
export function getOrCreateInstanceId(): string {
  if (typeof localStorage === 'undefined') {
    return generateId();
  }
  try {
    const existing = localStorage.getItem(INSTANCE_ID_STORAGE_KEY);
    if (existing && existing.length >= 8) {
      return existing;
    }
    const created = generateId();
    localStorage.setItem(INSTANCE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return generateId();
  }
}

/** Canonical Xavier memory namespace for this Shelf install. */
export function getXavierNamespace(instanceId?: string): string {
  const id = instanceId ?? getOrCreateInstanceId();
  return `app/${XAVIER_APP_ID}/instance/${id}`;
}

/**
 * Build a full Xavier path under the canonical namespace.
 * Absolute paths already under `app/shelf/instance/` are left as-is.
 */
export function resolveXavierPath(path: string, instanceId?: string): string {
  const trimmed = path.replace(/^\/+/, '');
  if (trimmed.startsWith(`app/${XAVIER_APP_ID}/instance/`)) {
    return trimmed;
  }
  const ns = getXavierNamespace(instanceId);
  if (!trimmed) return ns;
  return `${ns}/${trimmed}`;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getXavierToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-Xavier-Token'] = token;
  }
  return headers;
}

async function xavierFetch(url: string, init: RequestInit): Promise<Response | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeout =
      controller && typeof setTimeout !== 'undefined' ? setTimeout(() => controller.abort(), 5_000) : undefined;
    const res = await fetch(url, {
      ...init,
      headers: { ...buildHeaders(), ...(init.headers || {}) },
      signal: controller?.signal,
    });
    if (timeout) clearTimeout(timeout);
    return res;
  } catch (err) {
    console.warn('[Xavier] request failed (offline-first, continuing):', err);
    return null;
  }
}

/**
 * POST /memory/add — path is always under `app/shelf/instance/{id}/...`.
 * Never throws.
 */
export async function xavierAdd(path: string, content: string): Promise<XavierAddResult> {
  const fullPath = resolveXavierPath(path);
  const base = getXavierUrl();
  const res = await xavierFetch(`${base}/memory/add`, {
    method: 'POST',
    body: JSON.stringify({ path: fullPath, content }),
  });
  if (!res) {
    return { ok: false, reason: 'unreachable' };
  }
  if (!res.ok) {
    console.warn(`[Xavier] add failed: ${res.status} ${res.statusText}`);
    return { ok: false, reason: `http_${res.status}` };
  }
  try {
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch {
    return { ok: true };
  }
}

/**
 * POST /memory/search — never throws.
 */
export async function xavierSearch(query: string): Promise<XavierSearchResult> {
  const base = getXavierUrl();
  const res = await xavierFetch(`${base}/memory/search`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  if (!res) {
    return { ok: false, reason: 'unreachable', results: [] };
  }
  if (!res.ok) {
    console.warn(`[Xavier] search failed: ${res.status} ${res.statusText}`);
    return { ok: false, reason: `http_${res.status}`, results: [] };
  }
  try {
    const data = (await res.json()) as { results?: unknown[]; memories?: unknown[] } | unknown[];
    if (Array.isArray(data)) {
      return { ok: true, results: data };
    }
    return { ok: true, results: data.results ?? data.memories ?? [] };
  } catch {
    return { ok: true, results: [] };
  }
}

/** Lightweight health probe for UI connection status. */
export async function probeXavierConnection(): Promise<XavierConnectionStatus> {
  const base = getXavierUrl();
  const res = await xavierFetch(`${base}/health`, { method: 'GET' });
  if (res?.ok) return 'connected';
  // Some Xavier builds only expose /
  const root = await xavierFetch(`${base}/`, { method: 'GET' });
  if (root?.ok || root?.status === 404) return 'connected';
  return 'disconnected';
}

/**
 * Persist an inventory sync summary under
 * `app/shelf/instance/{id}/sync/events` (debounced, best-effort).
 */
export function scheduleXavierInventorySync(counts: XavierSyncCounts): void {
  pendingSyncCounts = counts;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const snapshot = pendingSyncCounts;
    pendingSyncCounts = null;
    syncTimer = null;
    if (!snapshot) return;
    void recordXavierInventorySync(snapshot);
  }, SYNC_DEBOUNCE_MS);
}

export async function recordXavierInventorySync(counts: XavierSyncCounts): Promise<XavierAddResult> {
  const content = JSON.stringify({
    kind: 'inventory-sync',
    timestamp: new Date().toISOString(),
    instanceId: getOrCreateInstanceId(),
    counts: {
      products: counts.products,
      sales: counts.sales,
      clients: counts.clients ?? 0,
      suppliers: counts.suppliers ?? 0,
      purchaseOrders: counts.purchaseOrders ?? 0,
    },
    action: counts.action,
  });
  return xavierAdd('sync/events', content);
}

/** Test helper — clears debounce state. */
export function __resetXavierSyncScheduler(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  pendingSyncCounts = null;
}
