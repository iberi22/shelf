/**
 * Minimal in-memory IndexedDB implementation for unit tests.
 *
 * jsdom does not ship an IndexedDB implementation, so specs that need durable
 * persistence testing install this mock. It implements only the surface used
 * by the telemetry provider:
 *   indexedDB.open / db.objectStoreNames / db.createObjectStore /
 *   db.transaction / store.add / store.getAll / store.getAllKeys /
 *   store.openCursor / store.delete / store.clear / store.count
 *
 * Requests resolve asynchronously (queueMicrotask) and fire `onsuccess`/
 * `onerror` exactly like the real API, so promise wrappers behave the same.
 */

type MockStore = {
  records: Map<number, unknown>;
  autoIncrement: number;
};

type MockDB = {
  name: string;
  version: number;
  stores: Map<string, MockStore>;
};

const databases = new Map<string, MockDB>();

function makeRequest<T>(result: T): any {
  const request: any = { result, error: null };
  let cb: ((event: any) => void) | null = null;
  Object.defineProperty(request, 'onsuccess', {
    get: () => cb,
    set: (fn: ((event: any) => void) | null) => {
      cb = fn;
      if (cb) {
        const handler = cb;
        queueMicrotask(() => handler({ target: request }));
      }
    },
    configurable: true,
  });
  Object.defineProperty(request, 'onerror', {
    get: () => null,
    set: () => {
      // errors are never simulated
    },
    configurable: true,
  });
  return request;
}

type Cursor = {
  key: IDBValidKey;
  value: unknown;
  continue: () => void;
};

function makeCursorRequest(entries: Array<[number, unknown]>): any {
  let index = 0;
  const request: any = { result: null };
  let cb: ((event: any) => void) | null = null;
  const step = () => {
    if (index >= entries.length) {
      request.result = null;
      cb?.({ target: request, preventDefault: () => {} });
      return;
    }
    const [key, value] = entries[index] as [number, unknown];
    const cursor: Cursor = {
      key,
      value: structuredClone(value),
      continue: () => {
        index += 1;
        queueMicrotask(step);
      },
    };
    request.result = cursor;
    cb?.({ target: request, preventDefault: () => {} });
  };
  Object.defineProperty(request, 'onsuccess', {
    get: () => cb,
    set: (fn: ((event: any) => void) | null) => {
      cb = fn;
      if (cb) queueMicrotask(step);
    },
    configurable: true,
  });
  Object.defineProperty(request, 'onerror', {
    get: () => null,
    set: () => {},
    configurable: true,
  });
  return request;
}

class MockObjectStore {
  constructor(
    private readonly db: MockDB,
    private readonly name: string,
  ) {}

  private getStore(): MockStore {
    let store = this.db.stores.get(this.name);
    if (!store) {
      store = { records: new Map(), autoIncrement: 0 };
      this.db.stores.set(this.name, store);
    }
    return store;
  }

  add(value: unknown): any {
    const store = this.getStore();
    const key = ++store.autoIncrement;
    store.records.set(key, structuredClone(value));
    return makeRequest(key);
  }

  getAll(): any {
    const store = this.getStore();
    return makeRequest([...store.records.values()].map((value) => structuredClone(value)));
  }

  getAllKeys(): any {
    const store = this.getStore();
    return makeRequest([...store.records.keys()]);
  }

  openCursor(): any {
    const store = this.getStore();
    return makeCursorRequest([...store.records.entries()]);
  }

  delete(key: IDBValidKey): any {
    const store = this.getStore();
    store.records.delete(key as number);
    return makeRequest(undefined);
  }

  clear(): any {
    const store = this.getStore();
    store.records.clear();
    return makeRequest(undefined);
  }

  count(): any {
    const store = this.getStore();
    return makeRequest(store.records.size);
  }
}

type MockObjectStoreNames = { contains: (name: string) => boolean };

function makeDB(db: MockDB): {
  name: string;
  version: number;
  objectStoreNames: MockObjectStoreNames;
  createObjectStore: (name: string, options?: { autoIncrement?: boolean }) => MockObjectStore;
  transaction: (storeName: string, mode?: IDBTransactionMode) => any;
  close: () => void;
} {
  return {
    name: db.name,
    version: db.version,
    objectStoreNames: {
      contains: (name: string) => db.stores.has(name),
    },
    createObjectStore: (name: string, _options?: { autoIncrement?: boolean }) => {
      if (!db.stores.has(name)) {
        db.stores.set(name, { records: new Map(), autoIncrement: 0 });
      }
      return new MockObjectStore(db, name);
    },
    transaction: (_storeName: string, _mode?: IDBTransactionMode) => ({
      objectStore: (name: string) => new MockObjectStore(db, name),
      oncomplete: null,
      onerror: null,
      abort: () => {},
    }),
    close: () => {},
  };
}

function open(name: string, version: number): any {
  const existing = databases.get(name);
  const isNew = !existing || existing.version < version;
  const db: MockDB = {
    name,
    version,
    stores: existing?.stores ?? new Map(),
  };
  databases.set(name, db);
  const request: any = { result: makeDB(db), error: null };
  let successCb: ((event: any) => void) | null = null;
  let upgradeCb: ((event: any) => void) | null = null;
  Object.defineProperty(request, 'onupgradeneeded', {
    get: () => upgradeCb,
    set: (fn: ((event: any) => void) | null) => {
      upgradeCb = fn;
    },
    configurable: true,
  });
  Object.defineProperty(request, 'onsuccess', {
    get: () => successCb,
    set: (fn: ((event: any) => void) | null) => {
      successCb = fn;
      if (!successCb) return;
      const handler = successCb;
      queueMicrotask(() => {
        if (isNew && upgradeCb) {
          const upgrade = upgradeCb;
          upgrade({ target: request, oldVersion: 0, newVersion: version });
        }
        handler({ target: request });
      });
    },
    configurable: true,
  });
  Object.defineProperty(request, 'onerror', {
    get: () => null,
    set: () => {},
    configurable: true,
  });
  return request;
}

/** Installs the mock as globalThis.indexedDB (idempotent). */
export function installIndexedDBMock(): void {
  if ((globalThis as any).indexedDB) return;
  (globalThis as any).indexedDB = { open };
}

/** Removes the mock, restoring the pre-test environment. */
export function uninstallIndexedDBMock(): void {
  delete (globalThis as any).indexedDB;
}

/** Clears every database (call in beforeEach to isolate tests). */
export function resetIndexedDBMock(): void {
  databases.clear();
}
