/**
 * SwalNodeContext — SWAL node heartbeat as Pro gate.
 *
 * Canonical Pro rule: Pro ⇔ SWAL node active (heartbeat reachable).
 * This context probes Xavier `/health` when a local node id exists
 * (`swal.node.id` in localStorage) and exposes `status` for gating.
 *
 * Mirrors ecosystem helper `isProEnabled(node: SwalNode|null)` from
 * `@swal/node` / maloca-node `pro-features.ts` — here operating on the
 * lightweight `SwalNodeStatus` string instead of the full node object.
 *
 * Probe contract (see OLA-S1.04):
 *  - key: localStorage `swal.node.id`
 *  - url: `${import.meta.env.VITE_XAVIER_URL ?? "http://127.0.0.1:8006"}/health`
 *  - timeout: AbortController 3s
 *  - reachability + node id ⇒ active, otherwise inactive
 *  - re-probe every 60s while document is visible
 */

import type React from 'react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

/** Discrete lifecycle of the local SWAL node link. */
export type SwalNodeStatus = 'idle' | 'probing' | 'active' | 'inactive';

export interface SwalNodeState {
  status: SwalNodeStatus;
  lastCheck: number;
}

export interface SwalNodeContextType extends SwalNodeState {
  /** Force a fresh probe irrespective of interval. */
  refresh: () => Promise<void>;
  /** Convenience: true only when status === "active". */
  isPro: boolean;
}

const SwalNodeContext = createContext<SwalNodeContextType | undefined>(undefined);

/** Local storage key where the node id is persisted by the SWAL desktop/node. */
export const SWAL_NODE_ID_KEY = 'swal.node.id';

/**
 * Mirrors `isProEnabled(node: SwalNode|null)` from `@swal/node`.
 * In Shelf we operate on the derived status string — active means Pro.
 */
export function isProEnabled(status: SwalNodeStatus): boolean {
  return status === 'active';
}

/** Resolve Xavier base URL (Vite env, fallback to local default). */
function getXavierBaseUrl(): string {
  const envUrl = import.meta.env.VITE_XAVIER_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8006';
}

interface SwalNodeProviderProps {
  children: ReactNode;
}

export const SwalNodeProvider: React.FC<SwalNodeProviderProps> = ({ children }) => {
  const [status, setStatus] = useState<SwalNodeStatus>('idle');
  const [lastCheck, setLastCheck] = useState<number>(0);

  // Avoid overlapping fetches.
  const probingRef = useRef(false);

  const probe = useCallback(async () => {
    if (probingRef.current) return;
    probingRef.current = true;
    setStatus((prev) => (prev === 'idle' ? 'probing' : prev));

    // If no local node id, we are definitively not Pro — no network call.
    let nodeId: string | null = null;
    try {
      nodeId = localStorage.getItem(SWAL_NODE_ID_KEY);
    } catch {
      // Storage unavailable (e.g. SSR or blocked) => treat as inactive.
      nodeId = null;
    }

    if (!nodeId) {
      setStatus('inactive');
      setLastCheck(Date.now());
      probingRef.current = false;
      return;
    }

    // Node id present — verify Xavier reachability.
    // Keep "probing" visible while fetching so consumers can show a spinner.
    const prevStatus = status;
    if (prevStatus !== 'probing') {
      setStatus('probing');
    }

    const baseUrl = getXavierBaseUrl();
    const healthUrl = `${baseUrl}/health`;
    const controller = new AbortController();
    const timeoutMs = 3000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    let nextStatus: SwalNodeStatus = 'inactive';
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      // Any 2xx is considered reachable; the node id already proves identity intent.
      // Xavier health typically returns { status: "ok" }.
      if (response.ok) {
        nextStatus = 'active';
      } else {
        nextStatus = 'inactive';
      }
    } catch {
      // Network error, timeout, abort, CORS, or offline => inactive.
      nextStatus = 'inactive';
    } finally {
      window.clearTimeout(timeoutId);
      probingRef.current = false;
    }

    setStatus(nextStatus);
    setLastCheck(Date.now());
  }, [status]);

  // Initial probe + interval + visibility-aware re-probing.
  useEffect(() => {
    // Kick off first probe after mount (avoid SSR issues).
    void probe();

    const intervalMs = 60_000;
    let intervalId: number | undefined;

    const startInterval = () => {
      if (intervalId !== undefined) return;
      intervalId = window.setInterval(() => {
        // Only poll while the tab is visible to save resources.
        if (document.visibilityState === 'visible') {
          void probe();
        }
      }, intervalMs);
    };

    const stopInterval = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    startInterval();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Re-probe promptly when user returns to the tab.
        void probe();
        startInterval();
      } else {
        // Pause polling while hidden; will resume on next visible event.
        stopInterval();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also re-probe when localStorage node id changes in another tab.
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SWAL_NODE_ID_KEY) {
        void probe();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [probe]);

  const refresh = useCallback(async () => {
    await probe();
  }, [probe]);

  const value: SwalNodeContextType = {
    status,
    lastCheck,
    refresh,
    isPro: isProEnabled(status),
  };

  return <SwalNodeContext.Provider value={value}>{children}</SwalNodeContext.Provider>;
};

export const useSwalNode = (): SwalNodeContextType => {
  const context = useContext(SwalNodeContext);
  if (context === undefined) {
    throw new Error('useSwalNode must be used within a SwalNodeProvider');
  }
  return context;
};

export default SwalNodeContext;
