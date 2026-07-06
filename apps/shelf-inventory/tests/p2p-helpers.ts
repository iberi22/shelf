import { expect, type Page } from '@playwright/test';
import type { AppState, DatabaseSyncManager, P2PManager, PeerInfo, Product } from 'p2p-mesh-core';
import type { EdgeMeshWorkflowStatus } from '../components/EdgeMeshWorkflowBridge';

export type EdgeCollection =
  | 'products'
  | 'sales'
  | 'clients'
  | 'suppliers'
  | 'purchaseOrders'
  | 'arqueoSessions'
  | 'ocrResults'
  | 'auditLogs'
  | 'teamMembers';

interface ShelfEdgeMeshTest {
  getState: () => Record<EdgeCollection, unknown[]>;
  applyRemoteUpdate: (peerId: string, update: number[]) => void;
  getUpdate: () => number[];
  remove: (collection: EdgeCollection, id: string) => void;
  upsert: (collection: EdgeCollection, id: string, item: unknown) => void;
}

interface TestWindow extends Window {
  _dbSyncForTest?: DatabaseSyncManager;
  _p2pManagerForTest?: P2PManager;
  __shelfEdgeMeshStatus?: EdgeMeshWorkflowStatus;
  __shelfEdgeMeshForTest?: ShelfEdgeMeshTest;
  __shelfAppStateForTest?: AppState;
}

export type MockProduct = Partial<Product>;
export type MockPeer = Partial<PeerInfo>;

export function createMockProduct(overrides: MockProduct): Product {
  const id = overrides.id || `prod_${Math.random().toString(36).substring(2, 11)}`;
  return {
    id,
    name: 'Test Product',
    quantity: 10,
    price: 100,
    cost: 50,
    isActive: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'test-peer',
    ...overrides,
  };
}

export function createMockPeer(overrides: MockPeer): PeerInfo {
  const id = overrides.id || `peer_${Math.random().toString(36).substring(2, 11)}`;
  return {
    id,
    role: 'collaborator',
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

export async function getLocalPeerId(page: Page): Promise<string> {
  const peerIdLocator = page.locator('span.font-mono.text-yellow-400, code.font-mono.text-yellow-400').first();
  await peerIdLocator.waitFor({ state: 'visible' });
  await expect(peerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });

  const peerId = await page.evaluate(() => (window as unknown as TestWindow)._dbSyncForTest?.localPeerId);
  expect(peerId).toBeTruthy();
  return peerId as string;
}

/**
 * Get product names from _dbSyncForTest.getState().products
 */
async function getDbStateProductNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    try {
      const dbSync = (window as unknown as TestWindow)._dbSyncForTest;
      if (!dbSync) return [];
      const state = dbSync.getState(dbSync.localPeerId);
      if (!state?.products) return [];
      return (state.products as Product[]).map((p) => p.name);
    } catch {
      return [];
    }
  });
}

async function requestCrdtSync(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      const p2pManager = (window as unknown as TestWindow)._p2pManagerForTest;
      p2pManager?.requestFullSync?.();
    } catch (_e) {
      // Silently retry next interval
    }
  });
}

/**
 * Poll the target page for a product name in _dbSyncForTest state.
 * If not found, request CRDT state-vector sync in both directions.
 */
export async function expectProductSync(targetPage: Page, sourcePage: Page, productName: string, timeout = 30000) {
  await expect(async () => {
    // 1. Check if target already has the product
    let products = await getDbStateProductNames(targetPage);
    if (products.includes(productName)) {
      return; // already synced!
    }

    // 2. Not synced yet: request state-vector diff sync from both sides.
    await requestCrdtSync(targetPage);
    await requestCrdtSync(sourcePage);

    // 3. Wait a brief moment for diff exchange to arrive
    await targetPage.waitForTimeout(500);

    // 4. Re-check
    products = await getDbStateProductNames(targetPage);
    expect(products).toContain(productName);
  }).toPass({ timeout, intervals: [1000, 1000, 2000, 3000, 5000] });
}

/**
 * Poll the target page for a product with specific price in _dbSyncForTest state.
 * If not found, request CRDT state-vector sync in both directions.
 */
export async function expectProductPriceSync(
  targetPage: Page,
  sourcePage: Page,
  productName: string,
  expectedPrice: number,
  timeout = 30000,
) {
  await expect(async () => {
    let price = await targetPage.evaluate((name) => {
      try {
        const dbSync = (window as unknown as TestWindow)._dbSyncForTest;
        if (!dbSync) return undefined;
        const state = dbSync.getState(dbSync.localPeerId);
        if (!state?.products) return undefined;
        const products = state.products as Product[];
        const p = products.find((x) => x.name === name);
        return p?.price;
      } catch {
        return undefined;
      }
    }, productName);

    if (price === expectedPrice) {
      return; // already synced!
    }

    // Request state-vector diff sync from both sides.
    await requestCrdtSync(targetPage);
    await requestCrdtSync(sourcePage);

    await targetPage.waitForTimeout(500);

    price = await targetPage.evaluate((name) => {
      try {
        const dbSync = (window as unknown as TestWindow)._dbSyncForTest;
        if (!dbSync) return undefined;
        const state = dbSync.getState(dbSync.localPeerId);
        if (!state?.products) return undefined;
        const products = state.products as Product[];
        const p = products.find((x) => x.name === name);
        return p?.price;
      } catch {
        return undefined;
      }
    }, productName);

    expect(price).toBe(expectedPrice);
  }).toPass({ timeout, intervals: [1000, 1000, 2000, 3000, 5000] });
}

export async function expectEdgeMeshReady(page: Page, timeout = 15000) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const testWindow = window as unknown as TestWindow;
          return Boolean(testWindow.__shelfEdgeMeshStatus?.enabled && testWindow.__shelfEdgeMeshForTest);
        }),
      { timeout },
    )
    .toBe(true);
}

export async function upsertEdgeMeshEntity(page: Page, collection: EdgeCollection, id: string, item: unknown) {
  await expectEdgeMeshReady(page);
  await page.evaluate(
    ({ collectionName, entityId, entity }) => {
      (window as unknown as TestWindow).__shelfEdgeMeshForTest?.upsert(collectionName, entityId, entity);
    },
    { collectionName: collection, entityId: id, entity: item },
  );
}

export async function exportEdgeMeshUpdate(page: Page, collection = 'products'): Promise<number[]> {
  await expectEdgeMeshReady(page);
  return page.evaluate(
    ({ col }) => {
      const update = (window as unknown as TestWindow).__shelfEdgeMeshForTest?.getUpdate(col as any);
      return update ? Array.from(update) : [];
    },
    { col: collection },
  );
}

export async function applyRemoteEdgeMeshUpdate(page: Page, peerId: string, update: number[], collection = 'products') {
  await expectEdgeMeshReady(page);
  await page.evaluate(
    ({ pId, data, col }) => {
      (window as unknown as TestWindow).__shelfEdgeMeshForTest?.applyRemoteUpdate(pId, data, col as any);
    },
    { pId: peerId, data: Array.from(update), col: collection },
  );
}

export async function getEdgeMeshEntities<T = unknown>(page: Page, collection: EdgeCollection): Promise<T[]> {
  await expectEdgeMeshReady(page);
  return page.evaluate((collectionName) => {
    const snapshot = (window as unknown as TestWindow).__shelfEdgeMeshForTest?.getState();
    return (snapshot?.[collectionName] as T[]) || [];
  }, collection);
}

export async function getAppStateEntities<T = unknown>(page: Page, collection: EdgeCollection): Promise<T[]> {
  return page.evaluate((collectionName) => {
    const appState = (window as unknown as TestWindow).__shelfAppStateForTest;
    if (appState?.[collectionName]) return appState[collectionName] as T[];

    const dbSync = (window as unknown as TestWindow)._dbSyncForTest;
    if (!dbSync) return [];
    const state = dbSync.getState(dbSync.localPeerId);
    return (state?.[collectionName] as T[]) || [];
  }, collection);
}

export async function expectEdgeMeshEntity<T = unknown>(
  page: Page,
  collection: EdgeCollection,
  predicate: (items: T[]) => boolean,
  timeout = 30000,
) {
  await expect
    .poll(async () => predicate(await getEdgeMeshEntities<T>(page, collection)), {
      timeout,
      intervals: [1000, 1000, 2000, 3000, 5000],
    })
    .toBe(true);
}

export async function expectAppStateEntity<T = unknown>(
  page: Page,
  collection: EdgeCollection,
  predicate: (items: T[]) => boolean,
  timeout = 30000,
) {
  await expect
    .poll(async () => predicate(await getAppStateEntities<T>(page, collection)), {
      timeout,
      intervals: [1000, 1000, 2000, 3000, 5000],
    })
    .toBe(true);
}
