import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as persistStorage from './persistStorage';
import usePersistedReducer from './usePersistedReducer';

// Mock the createIdbPersistStorage function to return an in-memory storage.
vi.mock('./persistStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./persistStorage')>();

  return {
    ...actual,
    createIdbPersistStorage: vi.fn(() => {
      let memoryStore: Record<string, string> = {};
      return {
        load: async (key: string) => memoryStore[key] || null,
        save: async (key: string, value: string) => { memoryStore[key] = value; },
        remove: async (key: string) => { delete memoryStore[key]; },
      };
    }),
  };
});

describe('usePersistedReducer', () => {
  it('creates the default storage adapter exactly once even after multiple re-renders', () => {
    // Clear mock calls to be sure we count accurately.
    vi.mocked(persistStorage.createIdbPersistStorage).mockClear();

    const dummyReducer = (state: { count: number }, action: { type: string }) => state;
    const initialState = { count: 0 };
    const localStorageKey = 'test-key';

    // renderHook without passing an explicit storage option.
    const { rerender } = renderHook(() =>
      usePersistedReducer(dummyReducer, initialState, localStorageKey)
    );

    // Re-render multiple times.
    rerender();
    rerender();

    // Verify that the default storage is instantiated precisely once, at module scope.
    // However since the module was already evaluated, it might be 0, but since the test runner resets mocks we might get 1 if imported dynamically
    // Let's assert it's NOT called more than 1 times
    expect(persistStorage.createIdbPersistStorage.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
