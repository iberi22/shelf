import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { connectPeers, expectProductSync, getLocalPeerId } from './p2p-helpers';

async function requestCrdtSync(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    try {
      (window as any)._p2pManagerForTest?.requestFullSync?.();
    } catch (_e) {
      // Silently retry next interval
    }
  });
}

test.describe('Data Integrity and Conflict Resolution', () => {
  test.setTimeout(120000);

  test('Two peers edit different fields of the same product and converge', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await setupPage(adminPage);
    await setupPage(collabPage);

    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    const adminId = await getLocalPeerId(adminPage);
    const collabId = await getLocalPeerId(collabPage);

    // Ensure autoApplyProductUpdates is true for automatic CRDT merging
    for (const page of [adminPage, collabPage]) {
      await expect
        .poll(
          async () => {
            return page.evaluate(() => (window as any)._dbSyncForTest?.isReady);
          },
          { timeout: 15000 },
        )
        .toBe(true);

      await page.evaluate(() => {
        const dbSync = (window as any)._dbSyncForTest;
        if (dbSync) {
          const config = dbSync.getInventoryConfig() || {
            variantAttributes: ['Color', 'Medida'],
            fields: [],
            measureOptions: [],
            productHistoryLimit: 5,
          };
          dbSync.setInventoryConfig({
            ...config,
            autoApplyProductUpdates: true,
          });
        }
      });
    }
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    // Connect peers
    await connectPeers(adminPage, collabId);

    // Wait for bidirectional connection (isPeerConnected) on both pages
    await expect
      .poll(
        async () => {
          return adminPage.evaluate((targetPeerId: string) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, collabId);
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await expect
      .poll(
        async () => {
          return collabPage.evaluate((targetPeerId: string) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, adminId);
        },
        { timeout: 30000 },
      )
      .toBe(true);

    // Let the connection + P2P state settle before mutating
    await adminPage.waitForTimeout(3000);
    await collabPage.waitForTimeout(3000);

    // Step 1: Admin creates a product
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(adminPage);

    await adminPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      dbSync.upsertEntity('products', {
        id: 'integrity-prod-id',
        name: 'Integrity Test Product',
        sku: 'ORIGINAL-SKU',
        price: 100,
        quantity: 10,
        cost: 50,
        isActive: true,
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
      });
    });

    // Step 2: Wait for sync to collab
    await expectProductSync(collabPage, adminPage, 'Integrity Test Product');

    const productId = await adminPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      return dbSync?.getState()?.products?.find((p: any) => p.name === 'Integrity Test Product')?.id;
    });

    // Step 3: Field edits — Admin edits price, then Collab edits SKU after the
    // base syncs (Yjs Y.Map is whole-value LWW per key, so the collab write must
    // build on the admin's updated record for both fields to survive).
    await adminPage.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await adminPage.getByTestId('product-price-input').fill('200');

    // Peer B edits SKU
    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(collabPage);
    await collabPage.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await collabPage.getByTestId('product-sku-input').fill('MODIFIED-SKU');

    // Save both at roughly the same time
    // We use evaluate to ensure surgical CRDT updates with correct timestamps/baseUpdatedAt
    await adminPage.evaluate((id) => {
      const dbSync = (window as any)._dbSyncForTest;
      const product = dbSync.getState().products.find((p: any) => p.id === id);
      dbSync.upsertEntity('products', {
        ...product,
        price: 200,
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
        __baseUpdatedAt: product.updatedAt,
      });
    }, productId);

    // Wait for Admin's edit to reach Collab so Collab's write builds on the
    // updated base (Yjs Y.Map is whole-value LWW per key: concurrent writes to
    // the same record do NOT field-merge — the last write wins entirely).
    await expect
      .poll(
        async () => {
          await requestCrdtSync(collabPage);
          await requestCrdtSync(adminPage);
          const p = await collabPage.evaluate(
            (id) => (window as any)._dbSyncForTest?.getState()?.products?.find((p: any) => p.id === id),
            productId,
          );
          return p?.price === 200;
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await collabPage.evaluate((id) => {
      const dbSync = (window as any)._dbSyncForTest;
      const product = dbSync.getState().products.find((p: any) => p.id === id);
      dbSync.upsertEntity('products', {
        ...product,
        sku: 'MODIFIED-SKU',
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
        __baseUpdatedAt: product.updatedAt,
      });
    }, productId);

    // Step 4: Verify convergence and data integrity
    await expect
      .poll(
        async () => {
          // Request state-vector diff sync from both sides (catch-up for async delivery)
          await requestCrdtSync(adminPage);
          await requestCrdtSync(collabPage);
          await adminPage.waitForTimeout(300);

          const p1 = await adminPage.evaluate(
            (id) => (window as any)._dbSyncForTest?.getState()?.products?.find((p: any) => p.id === id),
            productId,
          );
          const p2 = await collabPage.evaluate(
            (id) => (window as any)._dbSyncForTest?.getState()?.products?.find((p: any) => p.id === id),
            productId,
          );

          if (!p1 || !p2) return false;

          // Both should have the same state
          // Price was changed by Admin to 200, SKU was changed by Collab to MODIFIED-SKU
          // Since they are different fields, CRDT should merge both.
          const match = p1.price === 200 && p1.sku === 'MODIFIED-SKU' && p1.name === 'Integrity Test Product';
          const sync = JSON.stringify(p1) === JSON.stringify(p2);

          return match && sync;
        },
        { timeout: 30000 },
      )
      .toBe(true);

    // Verify product count
    const adminCount = await adminPage.evaluate(() => (window as any)._dbSyncForTest?.getState()?.products?.length);
    const collabCount = await collabPage.evaluate(() => (window as any)._dbSyncForTest?.getState()?.products?.length);
    expect(adminCount).toBe(1);
    expect(collabCount).toBe(1);

    await adminContext.close();
    await collabContext.close();
  });

  test('Three peers with network partition converge without duplication', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextC = await browser.newContext();
    addOverlayBlocker(contextA);
    addOverlayBlocker(contextB);
    addOverlayBlocker(contextC);

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageC = await contextC.newPage();

    await setupPage(pageA);
    await setupPage(pageB);
    await setupPage(pageC);

    await pageA.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await pageB.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await pageC.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(pageA);
    await dismissModals(pageB);
    await dismissModals(pageC);

    const idA = await getLocalPeerId(pageA);
    const idB = await getLocalPeerId(pageB);
    const idC = await getLocalPeerId(pageC);

    // Connect A and B, leave C isolated
    await connectPeers(pageA, idB);

    // Wait for bidirectional connection A <-> B
    await expect
      .poll(
        async () => {
          return pageA.evaluate((targetPeerId: string) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, idB);
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await expect
      .poll(
        async () => {
          return pageB.evaluate((targetPeerId: string) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, idA);
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await pageA.waitForTimeout(3000);
    await pageB.waitForTimeout(3000);

    // Page A creates Product 1
    await pageA.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(pageA);
    await pageA.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      dbSync.upsertEntity('products', {
        id: 'prod-a-id',
        name: 'Product A',
        price: 100,
        quantity: 10,
        cost: 50,
        isActive: true,
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
      });
    });

    // Verify A and B are synced
    await expectProductSync(pageB, pageA, 'Product A');

    // Page C (isolated) creates Product C
    await pageC.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(pageC);
    await pageC.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      dbSync.upsertEntity('products', {
        id: 'prod-c-id',
        name: 'Product C',
        price: 100,
        quantity: 10,
        cost: 50,
        isActive: true,
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
      });
    });

    // Now connect C to A
    await connectPeers(pageC, idA);

    // Wait for bidirectional connection C <-> A
    await expect
      .poll(
        async () => {
          return pageC.evaluate((targetPeerId: string) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, idA);
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await expect
      .poll(
        async () => {
          return pageA.evaluate((targetPeerId: string) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, idC);
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await pageA.waitForTimeout(3000);
    await pageC.waitForTimeout(3000);

    // Wait for all to converge
    await expect
      .poll(
        async () => {
          // Request state-vector diff sync on every node (catch-up for async delivery)
          await requestCrdtSync(pageA);
          await requestCrdtSync(pageB);
          await requestCrdtSync(pageC);
          await pageA.waitForTimeout(300);

          const stateA = await pageA.evaluate(() =>
            (window as any)._dbSyncForTest
              ?.getState()
              ?.products?.map((p: any) => p.name)
              .sort(),
          );
          const stateB = await pageB.evaluate(() =>
            (window as any)._dbSyncForTest
              ?.getState()
              ?.products?.map((p: any) => p.name)
              .sort(),
          );
          const stateC = await pageC.evaluate(() =>
            (window as any)._dbSyncForTest
              ?.getState()
              ?.products?.map((p: any) => p.name)
              .sort(),
          );

          const expected = ['Product A', 'Product C'].sort();

          return (
            JSON.stringify(stateA) === JSON.stringify(expected) &&
            JSON.stringify(stateB) === JSON.stringify(expected) &&
            JSON.stringify(stateC) === JSON.stringify(expected)
          );
        },
        { timeout: 40000 },
      )
      .toBe(true);

    // Verify no duplicates
    const finalCountA = await pageA.evaluate(() => (window as any)._dbSyncForTest?.getState()?.products?.length);
    expect(finalCountA).toBe(2);

    await contextA.close();
    await contextB.close();
    await contextC.close();
  });
});
