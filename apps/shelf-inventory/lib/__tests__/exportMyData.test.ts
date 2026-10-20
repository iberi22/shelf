// Needs sql.js as a dev dependency to parse SQL strings
// @ts-expect-error sql.js ships no type declarations and no @types package is installed
import initSqlJs from 'sql.js';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../../../packages/p2p-mesh-core/src';
import { buildSqlDump, buildStateJson, readDecryptedState } from '../exportMyData';
import { installIndexedDBMock, resetIndexedDBMock, uninstallIndexedDBMock } from './idb-mock';

// Setup idb mock
beforeEach(() => {
  installIndexedDBMock();
  resetIndexedDBMock();

  // Clean mock implementations
  vi.clearAllMocks();
});

afterAll(() => {
  uninstallIndexedDBMock();
});

// Mock getSessionKey
let mockKey: CryptoKey | null = null;
vi.mock('../../../../packages/p2p-mesh-core/src', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../packages/p2p-mesh-core/src')>();
  return {
    ...actual,
    getSessionKey: vi.fn().mockImplementation(() => {
      return mockKey;
    }),
  };
});

const mockState: AppState = {
  products: [{ id: 'p1', name: "O'Reilly Book", createdAt: '2026-01-01', updatedAt: '2026-01-02' } as any],
  sales: [{ id: 's1', total: 100 } as any],
  clients: [],
  suppliers: [],
  purchaseOrders: [],
  auditLogs: [],
  peers: [],
  teamMembers: [],
  branches: [],
  inventoryConfig: { lowStockThreshold: 10 } as any,
  localPeerId: 'peer-1',
  activeBranch: undefined,
  activeBranchId: undefined,
  role: 'admin',
  arqueoSessions: [],
  ocrResults: [],
  pendingEdits: [],
  productChangeHistory: [],
};

describe('exportMyData module', () => {
  it('readDecryptedState returns null when no DB exists', async () => {
    const state = await readDecryptedState();
    expect(state).toBeNull();
  });

  it('round-trips the state properly from IndexedDB', async () => {
    // Wrap to simulate PersistedEnvelope
    const enveloped = {
      __shelfStorageVersion: 2,
      appVersion: '1.0.0',
      persistedAt: new Date().toISOString(),
      state: mockState,
    };

    mockKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    // Generate an actual key for the underlying crypto operation to use in JS dom tests
    // because vitest mocked getSessionKey returns a different object reference from what SubtleCrypto expects.
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      mockKey,
      encoder.encode(JSON.stringify(enveloped)),
    );
    const combined = new Uint8Array(iv.length + encryptedBuf.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuf), iv.length);
    const encrypted = btoa(String.fromCharCode(...combined));

    // Manually push to IDB
    const request = indexedDB.open('ShelfStorage', 2);
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        db.createObjectStore('keyval');
      };
      request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      let putReq: IDBRequest<any>;
      if (store.put) {
        putReq = store.put(encrypted, 'shelfState');
      } else {
        putReq = store.add(encrypted, 'shelfState'); // mock only implements add
      }
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });

    const state = await readDecryptedState();
    expect(state).toEqual(mockState);
  });

  it('buildStateJson wraps the state and round-trips deep-equal', () => {
    const jsonStr = buildStateJson(mockState);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.format).toBe('shelf-export');
    expect(parsed.state).toEqual(mockState);
  });

  it('buildSqlDump generates correct SQL insert statements for all arrays and scalar values', async () => {
    const sqlStr = buildSqlDump(mockState);

    // Contains double quotes for the product name
    expect(sqlStr).toContain("O''Reilly Book");
    expect(sqlStr).toContain('INSERT INTO "products" ');
    expect(sqlStr).toContain('INSERT INTO "_settings" (key, value) VALUES (\'inventoryConfig\',');

    const SQL = await initSqlJs({
      locateFile: (file: string) => `../../node_modules/.pnpm/sql.js@1.14.2/node_modules/sql.js/dist/${file}`,
    });

    const db = new SQL.Database();

    // Execute the dump into the empty db
    db.run(sqlStr);

    // Test product count
    const [productsResult] = db.exec('SELECT count(*) as count FROM products');
    expect(productsResult.values[0][0]).toBe(1);

    // Test sales count
    const [salesResult] = db.exec('SELECT count(*) as count FROM sales');
    expect(salesResult.values[0][0]).toBe(1);

    // Test settings rows (since we have inventoryConfig, localPeerId, activeBranch, activeBranchId, role)
    const [settingsResult] = db.exec('SELECT count(*) as count FROM _settings');

    // We expect some settings
    expect(settingsResult.values[0][0] as number).toBeGreaterThan(0);

    // Test product name recovery
    const [productNameResult] = db.exec("SELECT data FROM products WHERE id='p1'");
    const parsedProduct = JSON.parse(productNameResult.values[0][0] as string);
    expect(parsedProduct.name).toBe("O'Reilly Book");
  });
});
