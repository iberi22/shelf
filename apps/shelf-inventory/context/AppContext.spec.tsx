import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../hooks/usePersistedReducer', () => ({
  default: () => [{}, vi.fn(), true],
}));

vi.mock('../hooks/useReactiveProducts', () => ({
  useReactiveProducts: vi.fn(() => []),
}));

vi.mock('../hooks/useReactiveSales', () => ({
  useReactiveSales: vi.fn(() => []),
}));

vi.mock('p2p-mesh-core', () => ({
  p2pManager: {
    onConnectionChange: vi.fn(),
    onSyncStatusChange: vi.fn(),
    onDiscovery: vi.fn(),
    setConfig: vi.fn(),
    init: vi.fn(),
    stop: vi.fn(),
    connectToPeer: vi.fn(),
    disconnect: vi.fn()
  },
  dbSync: { upsertEntity: vi.fn() },
}));

vi.mock('edge-mesh-react', () => ({
  EdgeMeshProvider: ({ children }: any) => <div data-testid="edge-mesh">{children}</div>,
}));

vi.mock('../components/EdgeMeshTransportBinder', () => ({
  default: () => <div data-testid="transport-binder" />,
}));

vi.mock('../components/EdgeMeshWorkflowBridge', () => ({
  default: () => <div data-testid="workflow-bridge" />,
}));

vi.mock('../lib/cloudAuth', () => ({
  cloudAuthProvider: {
    isConfigured: () => false,
    restoreSession: vi.fn(),
    syncLocalToCloud: vi.fn().mockResolvedValue(undefined)
  },
}));

vi.mock('../lib/cloudSync', () => ({
  CloudSyncProvider: class {
    constructor() {}
    isConfigured() { return false; }
    start() {}
    stop() {}
  },
}));

vi.mock('../lib/xavier', () => ({
  scheduleXavierInventorySync: vi.fn(),
}));

import { AppProvider } from './AppContext';
import { useReactiveProducts } from '../hooks/useReactiveProducts';
import { useReactiveSales } from '../hooks/useReactiveSales';

describe('AppContext', () => {
  it('binds reactive hooks to injected sync document', () => {
    const fakeDoc = { guid: 'fake-doc' };
    const fakeSync = {
      doc: fakeDoc,
      onObserve: vi.fn(() => () => {}), // Return unobserve fn
      onChange: vi.fn(),
      getState: vi.fn(),
      getLinkedNodes: vi.fn(),
      getMasterPeerId: vi.fn(),
      initWithState: vi.fn(),
      startGarbageCollection: vi.fn(),
      stopGarbageCollection: vi.fn(),
      upsertEntity: vi.fn(),
      deleteEntity: vi.fn(),
      setInventoryConfig: vi.fn(),
      isLocalAuthority: vi.fn(),
      localPeerId: 'fake-peer',
      activeBranchId: 'fake-branch',
    } as any;

    const { unmount } = render(
      <AppProvider sync={fakeSync}>
        <div data-testid="child" />
      </AppProvider>
    );

    unmount();

    expect(useReactiveProducts).toHaveBeenCalledWith({ doc: fakeDoc });
    expect(useReactiveSales).toHaveBeenCalledWith({ doc: fakeDoc });
  });
});
