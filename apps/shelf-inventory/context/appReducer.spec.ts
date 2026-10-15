import { describe, expect, it } from 'vitest';
import { appReducer, initialState } from './appReducer';

describe('appReducer', () => {
  it('RESET_DATA returns initialState', () => {
    const modifiedState = { ...initialState, localPeerId: '123' } as any;
    const nextState = appReducer(modifiedState, { type: 'RESET_DATA' });
    expect(nextState).toEqual(initialState);
  });

  it('unknown action returns same state', () => {
    const modifiedState = { ...initialState, localPeerId: '123' } as any;
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
    const payload = { localPeerId: 'abc' } as any;
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
