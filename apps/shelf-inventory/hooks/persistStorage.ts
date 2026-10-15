export interface PersistStorage {
  load(key: string): Promise<string | null>;
  save(key: string, value: string): Promise<void>;
}

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

export const unwrapPersistedState = <T>(stored: unknown): T | null => {
  if (!isPlainObject(stored)) return stored as T | null;

  if (typeof stored.__shelfStorageVersion === 'number' && 'state' in stored && stored.state !== undefined) {
    return stored.state as T;
  }

  return stored as T;
};

export const normalizePersistedState = <T extends Record<string, any>>(candidate: Partial<T>, initialState: T): T => {
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

export const migratePersistedState = <T extends Record<string, any>>(stored: unknown, initialState: T): T => {
  const unwrapped = unwrapPersistedState<Partial<T>>(stored) || {};
  return normalizePersistedState(unwrapped, initialState);
};

export const wrapPersistedState = <T>(state: T): PersistedEnvelope<T> => ({
  __shelfStorageVersion: STORAGE_SCHEMA_VERSION,
  appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
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

export const createIdbPersistStorage = (): PersistStorage => ({
  load: idbGet,
  save: idbSet,
});

export const createMemoryPersistStorage = (): PersistStorage => {
  const store = new Map<string, string>();
  return {
    load: async (key: string) => store.get(key) || null,
    save: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
};
