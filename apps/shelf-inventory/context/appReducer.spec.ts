import type { AppState, Product } from 'p2p-mesh-core';
import { dbSync } from 'p2p-mesh-core';
import { describe, expect, it, vi } from 'vitest';
import { type AppSync, appReducer, initialState, syncInventoryStockChanges } from './appReducer';

describe('appReducer', () => {
  it('RESET_DATA returns initialState', () => {
    const modifiedState = { ...initialState, localPeerId: '123' } as unknown as AppState;
    const nextState = appReducer(modifiedState, { type: 'RESET_DATA' });
    expect(nextState).toEqual(initialState);
  });

  it('unknown action returns same state', () => {
    const modifiedState = { ...initialState, localPeerId: '123' } as unknown as AppState;
    // @ts-expect-error testing invalid action
    const nextState = appReducer(modifiedState, { type: 'UNKNOWN_ACTION' });
    expect(nextState).toBe(modifiedState);
  });

  it('SET_EXPELLED sets isExpelled correctly', () => {
    const nextState = appReducer(initialState, { type: 'SET_EXPELLED', payload: true });
    expect(nextState.isExpelled).toBe(true);
  });

  it('SYNC_STATE updates state with incoming payload', () => {
    const payload = { role: 'collaborator' as const };
    const nextState = appReducer(initialState, { type: 'SYNC_STATE', payload });
    expect(nextState.role).toBe('collaborator');
  });

  it('RESTORE_STATE merges payload with initialState', () => {
    const payload = { localPeerId: 'abc' } as unknown as AppState;
    const nextState = appReducer(initialState, { type: 'RESTORE_STATE', payload });
    expect(nextState.localPeerId).toBe('abc');
    expect(nextState.role).toBe(initialState.role); // Keeps other default values
  });

  it('SET_ACTIVE_BRANCH updates activeBranchId', () => {
    const nextState = appReducer(initialState, { type: 'SET_ACTIVE_BRANCH', payload: 'branch-1' });
    expect(nextState.activeBranchId).toBe('branch-1');

    const nullState = appReducer(nextState, { type: 'SET_ACTIVE_BRANCH', payload: null });
    expect(nullState.activeBranchId).toBeUndefined();
  });
});

describe('Sync Injection', () => {
  it('syncInventoryStockChanges uses injected sync instead of global dbSync', () => {
    const fakeSync = { upsertEntity: vi.fn() } as unknown as AppSync;
    const globalSpy = vi.spyOn(dbSync, 'upsertEntity');
    const baseProducts = [
      { id: 'p1', productId: 'p1', variants: [{ id: 'v1', quantity: 10 }] },
    ] as unknown as Product[];
    const items = [{ productId: 'p1', quantity: 2 }];

    syncInventoryStockChanges(initialState, baseProducts, items, -1, fakeSync);

    expect(fakeSync.upsertEntity).toHaveBeenCalledWith('products', expect.anything());
    expect(globalSpy).not.toHaveBeenCalled();
    globalSpy.mockRestore();
  });

  it('SET_ACTIVE_BRANCH writes to injected sync', () => {
    const fakeSync = { activeBranchId: undefined } as unknown as AppSync;
    const nextState = appReducer(initialState, { type: 'SET_ACTIVE_BRANCH', payload: 'b1' }, fakeSync);
    expect(fakeSync.activeBranchId).toBe('b1');
    expect(nextState.activeBranchId).toBe('b1');
  });

  it('SET_ROLE uses injected sync for authority check', () => {
    const fakeSync = { isLocalAuthority: vi.fn(() => false) } as unknown as AppSync;
    const collaboratorState = { ...initialState, role: 'collaborator' } as unknown as AppState;

    const nextState = appReducer(collaboratorState, { type: 'SET_ROLE', payload: 'admin' }, fakeSync);

    expect(fakeSync.isLocalAuthority).toHaveBeenCalled();
    expect(nextState.role).toBe('collaborator'); // Should not change if not local authority
  });
});
