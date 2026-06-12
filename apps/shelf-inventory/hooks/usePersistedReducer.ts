import { decryptData, encryptData, getSessionKey } from 'p2p-mesh-core';
import { type Dispatch, useEffect, useReducer, useState } from 'react';

// Tiny IndexedDB wrapper for unlimited storage
const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ShelfStorage', 1);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('keyval')) {
        db.createObjectStore('keyval');
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
      const tx = db.transaction('keyval', 'readonly');
      const request = tx.objectStore('keyval').get(key);
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
    const tx = db.transaction('keyval', 'readwrite');
    const request = tx.objectStore('keyval').put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

function usePersistedReducer<T, A extends { type: string; payload?: any }>(
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
        const decryptedStr = await decryptData(stored, key);
        const parsed = JSON.parse(decryptedStr);

        dispatch({ type: 'RESTORE_STATE', payload: parsed } as unknown as A);
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
        const encrypted = await encryptData(JSON.stringify(state), key);
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
