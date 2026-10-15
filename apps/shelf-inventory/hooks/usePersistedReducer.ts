import { decryptData, encryptData, getSessionKey } from 'p2p-mesh-core';
import { type Dispatch, useEffect, useReducer, useState } from 'react';
import {
  createIdbPersistStorage,
  migratePersistedState,
  type PersistStorage,
  wrapPersistedState,
} from './persistStorage';

function usePersistedReducer<T extends Record<string, any>, A extends { type: string; payload?: any }>(
  reducer: (state: T, action: A) => T,
  initialState: T,
  localStorageKey: string,
  options?: { storage?: PersistStorage },
): [T, Dispatch<A>, boolean] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isLoaded, setIsLoaded] = useState(false);

  const storage = options?.storage || createIdbPersistStorage();

  // Load asynchronously
  useEffect(() => {
    const loadState = async () => {
      if (typeof window === 'undefined') return;
      try {
        // Try provided storage first
        let stored = await storage.load(localStorageKey);

        // Fallback to localStorage for migration
        if (!stored) {
          stored = window.localStorage.getItem(localStorageKey);
          if (stored) {
            // Migrate to new storage immediately
            await storage.save(localStorageKey, stored);
          }
        }

        if (!stored) {
          setIsLoaded(true);
          return;
        }

        const key = await getSessionKey();
        let parsed: unknown;
        try {
          const decryptedStr = await decryptData(stored, key);
          parsed = JSON.parse(decryptedStr);
        } catch (decryptError) {
          // Support older unencrypted/localStorage-based state snapshots during migration.
          try {
            parsed = JSON.parse(stored);
          } catch (_legacyParseError) {
            throw decryptError;
          }
        }

        const migrated = migratePersistedState(parsed, initialState);
        dispatch({ type: 'RESTORE_STATE', payload: migrated } as unknown as A);
      } catch (error) {
        console.warn(`Error decrypting/reading key “${localStorageKey}”:`, error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadState();
  }, [localStorageKey, initialState, storage]);

  // Save asynchronously
  useEffect(() => {
    if (!isLoaded || typeof window === 'undefined') return;

    const saveState = async () => {
      try {
        const key = await getSessionKey();
        const encrypted = await encryptData(JSON.stringify(wrapPersistedState(state)), key);
        await storage.save(localStorageKey, encrypted);
        // Optional: clear localstorage to free up 5MB quota once successfully migrated
        window.localStorage.removeItem(localStorageKey);
      } catch (error) {
        console.error(`Error encrypting/setting key “${localStorageKey}”:`, error);
      }
    };

    saveState();

    // Expose for E2E tests
    if (typeof window !== 'undefined') {
      (window as any)._shelfStateForTest = state;
    }
  }, [state, isLoaded, localStorageKey, storage]);

  return [state, dispatch, isLoaded];
}

export default usePersistedReducer;
