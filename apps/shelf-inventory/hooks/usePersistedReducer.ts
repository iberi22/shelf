import { decryptData, encryptData, getSessionKey } from 'p2p-mesh-core';
import { type Dispatch, useEffect, useReducer, useState } from 'react';

const DB_NAME = 'ShelfStorage';
const DB_VERSION = 2;
const STORE_NAME = 'keyval';
const STORAGE_SCHEMA_VERSION = 2;

type PersistedEnvelope<T> = {
  __shelfStorageVersion: number;
  appVersion: string;
  persistedAt: string;
  state: T;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const unwrapPersistedState = <T,>(stored: unknown): T | null => {
  if (!isPlainObject(stored)) return stored as T | null;

  if (
    typeof stored.__shelfStorageVersion === 'number' &&
    'state' in stored &&
    stored.state !== undefined
  ) {
    return stored.state as T;
  }

  return stored as T;
};

const normalizePersistedState = <T extends Record<string, any>>(candidate: Partial<T>, initialState: T): T => {
  const normalized = { ...initialState } as T;

  for (const key of Object.keys(initialState) as (keyof T)[]) {
    const fallback = initialState[key];
    const incoming = candidate[key];

    if (Array.isArray(fallback)) {
      normalized[key] = (Array.isArray(incoming) ? incoming : fallback) as T[keyof T];
      continue;
    }

    if (isPlainObject(fallback)) {
      normalized[key] = (isPlainObject(incoming) ? { ...fallback, ...incoming } : fallback) as T[keyof T];
      continue;
    }

    normalized[key] = (incoming !== undefined ? incoming : fallback) as T[keyof T];
  }

  return normalized;
};

const migratePersistedState = <T extends Record<string, any>>(stored: unknown, initialState: T): T => {
  const unwrapped = unwrapPersistedState<Partial<T>>(stored) || {};
  return normalizePersistedState(unwrapped, initialState);
};

const wrapPersistedState = <T>(state: T): PersistedEnvelope<T> => ({
  __shelfStorageVersion: STORAGE_SCHEMA_VERSION,
  appVersion: __APP_VERSION__,
  persistedAt: new Date().toISOString(),
  state,
});

// Tiny IndexedDB wrapper for unlimited storage
const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    request.onerror = () => reject(request.error);
  });
};

const idbGet = async (key: string): Promise<string | null> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('IDB Get Error', err);
    return null;
  }
};

const idbSet = async (key: string, value: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

function usePersistedReducer<T extends Record<string, any>, A extends { type: string; payload?: any }>(
  reducer: (state: T, action: A) => T,
  initialState: T,
  localStorageKey: string,
): [T, Dispatch<A>, boolean] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load asynchronously
  useEffect(() => {
    const loadState = async () => {
      if (typeof window === 'undefined') return;
      try {
        // Try IDB first
        let stored = await idbGet(localStorageKey);

        // Fallback to localStorage for migration
        if (!stored) {
          stored = window.localStorage.getItem(localStorageKey);
          if (stored) {
            // Migrate to IDB immediately
            await idbSet(localStorageKey, stored);
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
  }, [localStorageKey]);

  // Save asynchronously
  useEffect(() => {
    if (!isLoaded || typeof window === 'undefined') return;

    const saveState = async () => {
      try {
        const key = await getSessionKey();
        const encrypted = await encryptData(JSON.stringify(wrapPersistedState(state)), key);
        await idbSet(localStorageKey, encrypted);
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
  }, [state, isLoaded, localStorageKey]);

  return [state, dispatch, isLoaded];
}

export default usePersistedReducer;
