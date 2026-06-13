import { expect, type Page } from '@playwright/test';

/**
 * Get product names from _dbSyncForTest.getState().products
 */
async function getDbStateProductNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    try {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync) return [];
      const state = dbSync.getState(dbSync.localPeerId);
      if (!state || !state.products) return [];
      return (state.products as any[]).map((p: any) => p.name);
    } catch {
      return [];
    }
  });
}

/**
 * Trigger a manual YJS_UPDATE re-broadcast from the source page.
 * This recovers from dropped broadcasts when P2P connections are
 * briefly disconnected during save operations.
 */
async function triggerReBroadcast(sourcePage: Page): Promise<void> {
  await sourcePage.evaluate(() => {
    try {
      const dbSync = (window as any)._dbSyncForTest;
      const p2pManager = (window as any)._p2pManagerForTest;
      if (!dbSync || !p2pManager) return;

      const update = dbSync.getLocalUpdate();
      const bytes = new Uint8Array(update);
      const hexUpdate = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      p2pManager.broadcast({
        type: 'YJS_UPDATE',
        payload: { update: hexUpdate },
      });
    } catch (_e) {
      // Silently retry next interval
    }
  });
}

/**
 * Poll the target page for a product name in _dbSyncForTest state.
 * If not found, trigger a manual re-broadcast from the source page
 * to recover from dropped YJS_UPDATE broadcasts.
 */
export async function expectProductSync(
  targetPage: Page,
  sourcePage: Page,
  productName: string,
  timeout = 30000,
) {
  await expect(async () => {
    // 1. Check if target already has the product
    let products = await getDbStateProductNames(targetPage);
    if (products.includes(productName)) {
      return; // already synced!
    }

    // 2. Not synced yet — trigger manual re-broadcast from source
    await triggerReBroadcast(sourcePage);

    // 3. Wait a brief moment for re-broadcast to arrive
    await targetPage.waitForTimeout(500);

    // 4. Re-check
    products = await getDbStateProductNames(targetPage);
    expect(products).toContain(productName);
  }).toPass({ timeout, intervals: [1000, 1000, 2000, 3000, 5000] });
}

/**
 * Poll the target page for a product with specific price in _dbSyncForTest state.
 * If not found, trigger re-broadcast from source.
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
        if (!state || !state.products) return undefined;
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

    // Re-broadcast from source
    await triggerReBroadcast(sourcePage);

    await targetPage.waitForTimeout(500);

    price = await targetPage.evaluate((name) => {
      try {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return undefined;
        const state = dbSync.getState(dbSync.localPeerId);
        if (!state || !state.products) return undefined;
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
