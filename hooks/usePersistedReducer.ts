import { type Dispatch, useEffect, useReducer } from 'react';

function usePersistedReducer<T, A>(
  reducer: (state: T, action: A) => T,
  initialState: T,
  localStorageKey: string,
): [T, Dispatch<A>] {
  const [state, dispatch] = useReducer(reducer, initialState, (initial: T): T => {
    if (typeof window === 'undefined') {
      return initial;
    }
    try {
      const stored = window.localStorage.getItem(localStorageKey);
      return stored ? JSON.parse(stored) : initial;
    } catch (error) {
      console.warn(`Error reading localStorage key “${localStorageKey}”:`, error);
      return initial;
    }
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(localStorageKey, JSON.stringify(state));
      } catch (error) {
        console.error(`Error setting localStorage key “${localStorageKey}”:`, error);
      }
    }
  }, [state, localStorageKey]);

  return [state, dispatch];
}

export default usePersistedReducer;
