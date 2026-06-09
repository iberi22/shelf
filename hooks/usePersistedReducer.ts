import { type Dispatch, useEffect, useReducer, useState } from 'react';
import { decryptData, encryptData, getSessionKey } from '../lib/crypto';

function usePersistedReducer<T, A extends { type: string; payload?: any }>(
  reducer: (state: T, action: A) => T,
  initialState: T,
  localStorageKey: string,
): [T, Dispatch<A>] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load asynchronously
  useEffect(() => {
    const loadState = async () => {
      if (typeof window === 'undefined') return;
      try {
        const stored = window.localStorage.getItem(localStorageKey);
        if (!stored) {
          setIsLoaded(true);
          return;
        }

        const key = await getSessionKey();
        const decryptedStr = await decryptData(stored, key);
        const parsed = JSON.parse(decryptedStr);

        // Dispatch an action to restore state (requires reducer to support RESTORE_STATE)
        // @ts-expect-error - assuming action structure supports this generic payload
        dispatch({ type: 'RESTORE_STATE', payload: parsed });
      } catch (error) {
        console.warn(`Error decrypting/reading localStorage key “${localStorageKey}”:`, error);
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
        window.localStorage.setItem(localStorageKey, encrypted);
      } catch (error) {
        console.error(`Error encrypting/setting localStorage key “${localStorageKey}”:`, error);
      }
    };

    saveState();
  }, [state, isLoaded, localStorageKey]);

  return [state, dispatch];
}

export default usePersistedReducer;
