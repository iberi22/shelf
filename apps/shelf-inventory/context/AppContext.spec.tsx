import { act, render } from '@testing-library/react';
import { dbSync } from 'p2p-mesh-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable backing state for the mocked persistence hook so individual tests can
// render the provider with a populated reducer state.
const persisted = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  loaded: true,
}));

// Mock dependencies
vi.mock('../hooks/usePersistedReducer', () => ({
  default: () => [persisted.state, vi.fn(), persisted.loaded],
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
    disconnect: vi.fn(),
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
    syncLocalToCloud: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../lib/cloudSync', () => ({
  CloudSyncProvider: class {
    isConfigured() {
      return false;
    }
    start() {}
    stop() {}
  },
}));

vi.mock('../lib/xavier', () => ({
  scheduleXavierInventorySync: vi.fn(),
}));

import { useReactiveProducts } from '../hooks/useReactiveProducts';
import { useReactiveSales } from '../hooks/useReactiveSales';
import { AppProvider, useAppContext } from './AppContext';
import { initialState } from './appReducer';

const createFakeSync = (overrides: Record<string, unknown> = {}) =>
  ({
    doc: { guid: 'fake-doc' },
    onObserve: vi.fn(() => () => {}), // Return unobserve fn
    onChange: vi.fn(),
    getState: vi.fn(() => ({})),
    getLinkedNodes: vi.fn(() => []),
    getMasterPeerId: vi.fn(() => null),
    initWithState: vi.fn(),
    startGarbageCollection: vi.fn(),
    stopGarbageCollection: vi.fn(),
    upsertEntity: vi.fn(),
    deleteEntity: vi.fn(),
    setInventoryConfig: vi.fn(),
    isLocalAuthority: vi.fn(() => true),
    localPeerId: 'fake-peer',
    activeBranchId: 'fake-branch',
    ...overrides,
  }) as any;

const captured: { dispatch: ((action: any) => void) | null } = { dispatch: null };

const DispatchHarness = () => {
  const { dispatch } = useAppContext();
  captured.dispatch = dispatch;
  return null;
};

describe('AppContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persisted.state = {};
    persisted.loaded = true;
    captured.dispatch = null;
  });

  it('binds reactive hooks to injected sync document', () => {
    const fakeDoc = { guid: 'fake-doc' };
    const fakeSync = createFakeSync({ doc: fakeDoc });

    const { unmount } = render(
      <AppProvider sync={fakeSync}>
        <div data-testid="child" />
      </AppProvider>,
    );

    unmount();

    expect(useReactiveProducts).toHaveBeenCalledWith({ doc: fakeDoc });
    expect(useReactiveSales).toHaveBeenCalledWith({ doc: fakeDoc });
  });

  it('UPDATE_SALE restores the previous sale stock through the injected sync, not global dbSync', () => {
    const product = { id: 'p1', productId: 'p1', variants: [{ id: 'v1', quantity: 4 }] };
    const oldSale = { id: 's1', items: [{ productId: 'p1', quantity: 2 }] };
    persisted.state = { ...initialState, products: [product], sales: [oldSale] } as unknown as Record<string, unknown>;

    const upsertEntity = vi.fn();
    const fakeSync = createFakeSync({ upsertEntity });

    const { unmount } = render(
      <AppProvider sync={fakeSync}>
        <DispatchHarness />
      </AppProvider>,
    );

    expect(captured.dispatch).toBeTruthy();

    act(() => {
      captured.dispatch?.({
        type: 'UPDATE_SALE',
        payload: { id: 's1', items: [{ productId: 'p1', quantity: 3 }] },
      });
    });

    // Restoring the old quantities (4 + 2) and then applying the new sale (-3)
    // must both go to the injected sync instance.
    const productUpserts = upsertEntity.mock.calls.filter((call) => call[0] === 'products');
    expect(productUpserts).toHaveLength(2);
    expect((productUpserts[0][1] as { variants: Array<{ quantity: number }> }).variants[0].quantity).toBe(6);
    expect(vi.mocked(dbSync.upsertEntity)).not.toHaveBeenCalled();

    unmount();
  });
});
