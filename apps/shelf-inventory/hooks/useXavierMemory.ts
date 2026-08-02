import { useCallback, useEffect, useState } from 'react';
import {
  getOrCreateInstanceId,
  getXavierNamespace,
  probeXavierConnection,
  type XavierAddResult,
  type XavierConnectionStatus,
  type XavierSearchResult,
  xavierAdd,
  xavierSearch,
} from '../lib/xavier';

export type UseXavierMemoryResult = {
  /** Canonical namespace `app/shelf/instance/{id}` */
  namespace: string;
  instanceId: string;
  status: XavierConnectionStatus;
  add: (path: string, content: string) => Promise<XavierAddResult>;
  search: (query: string) => Promise<XavierSearchResult>;
  refreshStatus: () => Promise<XavierConnectionStatus>;
};

/**
 * React hook for Xavier agentic memory (optional / offline-first).
 * Exposes add/search under the shelf instance namespace and connection status.
 */
export function useXavierMemory(): UseXavierMemoryResult {
  const instanceId = getOrCreateInstanceId();
  const namespace = getXavierNamespace(instanceId);
  const [status, setStatus] = useState<XavierConnectionStatus>('unknown');

  const refreshStatus = useCallback(async () => {
    const next = await probeXavierConnection();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const add = useCallback(async (path: string, content: string) => {
    const result = await xavierAdd(path, content);
    setStatus(result.ok ? 'connected' : 'disconnected');
    return result;
  }, []);

  const search = useCallback(async (query: string) => {
    const result = await xavierSearch(query);
    setStatus(result.ok ? 'connected' : 'disconnected');
    return result;
  }, []);

  return {
    namespace,
    instanceId,
    status,
    add,
    search,
    refreshStatus,
  };
}

export default useXavierMemory;
