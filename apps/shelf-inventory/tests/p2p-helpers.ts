import { expect, type Page } from '@playwright/test';

type EdgeCollection =
  | 'products'
  | 'sales'
  | 'clients'
  | 'suppliers'
  | 'purchaseOrders'
  | 'arqueoSessions'
  | 'ocrResults'
  | 'auditLogs'
  | 'teamMembers';

export async function getLocalPeerId(page: Page): Promise<string> {
  const peerIdLocator = page.locator('span.font-mono.text-yellow-400').first();
  await peerIdLocator.waitFor({ state: 'visible' });
  await expect(peerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });

  const peerId = await page.evaluate(() => (window as any)._dbSyncForTest?.localPeerId);
  expect(peerId).toBeTruthy();
  return peerId;
}

/**
 * Get product names from _dbSyncForTest.getState().products
 */
async function getDbStateProductNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    try {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync) return [];
      const state = dbSync.getState(dbSync.localPeerId);
      if (!state?.products) return [];
      return (state.products as any[]).map((p: any) => p.name);
    } catch {
      return [];
    }
  });
}

async function requestCrdtSync(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      const p2pManager = (window as any)._p2pManagerForTest;
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
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return undefined;
        const state = dbSync.getState(dbSync.localPeerId);
        if (!state?.products) return undefined;
        const products: any[] = state.products;
        const p = products.find((x: any) => x.name === name);
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
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return undefined;
        const state = dbSync.getState(dbSync.localPeerId);
        if (!state?.products) return undefined;
        const products: any[] = state.products;
        const p = products.find((x: any) => x.name === name);
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
          return Boolean((window as any).__shelfEdgeMeshStatus?.enabled && (window as any).__shelfEdgeMeshForTest);
        }),
      { timeout },
    )
    .toBe(true);
}

export async function upsertEdgeMeshEntity(page: Page, collection: EdgeCollection, id: string, item: unknown) {
  await expectEdgeMeshReady(page);
  await page.evaluate(
    ({ collectionName, entityId, entity }) => {
      (window as any).__shelfEdgeMeshForTest.upsert(collectionName, entityId, entity);
    },
    { collectionName: collection, entityId: id, entity: item },
  );
}

export async function exportEdgeMeshUpdate(page: Page): Promise<number[]> {
  await expectEdgeMeshReady(page);
  return page.evaluate(() => {
    return (window as any).__shelfEdgeMeshForTest.getUpdate();
  });
}

export async function applyRemoteEdgeMeshUpdate(page: Page, peerId: string, update: number[]) {
  await expectEdgeMeshReady(page);
  await page.evaluate(
    ({ remotePeerId, remoteUpdate }) => {
      (window as any).__shelfEdgeMeshForTest.applyRemoteUpdate(remotePeerId, remoteUpdate);
    },
    { remotePeerId: peerId, remoteUpdate: update },
  );
}

export async function getEdgeMeshEntities<T = any>(page: Page, collection: EdgeCollection): Promise<T[]> {
  await expectEdgeMeshReady(page);
  return page.evaluate((collectionName) => {
    const snapshot = (window as any).__shelfEdgeMeshForTest.getState();
    return snapshot?.[collectionName] || [];
  }, collection);
}

export async function getAppStateEntities<T = any>(page: Page, collection: EdgeCollection): Promise<T[]> {
  return page.evaluate((collectionName) => {
    const appState = (window as any).__shelfAppStateForTest;
    if (appState?.[collectionName]) return appState[collectionName];

    const dbSync = (window as any)._dbSyncForTest;
    if (!dbSync) return [];
    const state = dbSync.getState(dbSync.localPeerId);
    return state?.[collectionName] || [];
  }, collection);
}

export async function expectEdgeMeshEntity(
  page: Page,
  collection: EdgeCollection,
  predicate: (items: any[]) => boolean,
  timeout = 30000,
) {
  await expect
    .poll(async () => predicate(await getEdgeMeshEntities(page, collection)), {
      timeout,
      intervals: [1000, 1000, 2000, 3000, 5000],
    })
    .toBe(true);
}

export async function expectAppStateEntity(
  page: Page,
  collection: EdgeCollection,
  predicate: (items: any[]) => boolean,
  timeout = 30000,
) {
  await expect
    .poll(async () => predicate(await getAppStateEntities(page, collection)), {
      timeout,
      intervals: [1000, 1000, 2000, 3000, 5000],
    })
    .toBe(true);
}
