import { expect } from '@playwright/test';
import {
  connectAllPeers,
  createProductViaDb,
  deleteProductViaDb,
  disconnectPeer,
  editProductPriceViaDb,
  fullProductPermissions,
  getPeerId,
  getProductCount,
  readOnlyProductPermissions,
  reconnectPeer,
  setupAsRole,
  test,
  waitForPeerConnected,
} from './fixtures/shelf-peers';
import { dismissModals } from './helpers';
import { expectProductPriceSync, expectProductSync } from './p2p-helpers';

// ---------------------------------------------------------------------------
// Helpers local to this file
// ---------------------------------------------------------------------------

const PRODUCT_TEST_ID = 'add-product-button';

async function createProductViaUI(
  page: import('@playwright/test').Page,
  product: { name: string; price: string; cost: string; quantity: string },
) {
  await page.locator(`[data-testid="nav-item-nav.inventory"]`).last().click();
  await dismissModals(page);
  await page.waitForTimeout(1000);
  await page.locator(`[data-testid="${PRODUCT_TEST_ID}"]`).click();
  await expect(page.getByTestId('product-form')).toBeVisible();
  await page.getByTestId('product-name-input').fill(product.name);
  await page.getByTestId('product-price-input').fill(product.price);
  await page.getByTestId('product-cost-input').fill(product.cost);
  await page.getByTestId('product-quantity-input').fill(product.quantity);
  await page.getByTestId('save-product-button').click();
  await expect(page.getByTestId('product-form')).toBeHidden({ timeout: 10_000 });
}

async function waitForProductInState(page: import('@playwright/test').Page, productName: string, timeout = 30_000) {
  await expect
    .poll(
      async () =>
        page.evaluate((name) => {
          try {
            const dbSync = (window as any)._dbSyncForTest;
            if (!dbSync) return false;
            const state = dbSync.getState(dbSync.localPeerId);
            return (state?.products as any[])?.some((p: any) => p.name === name) ?? false;
          } catch {
            return false;
          }
        }, productName),
      { timeout, intervals: [1000, 1000, 2000, 3000, 5000] },
    )
    .toBe(true);
}

async function waitForProductAbsent(page: import('@playwright/test').Page, productName: string, timeout = 30_000) {
  // Give time for sync propagation before asserting absence
  await page.waitForTimeout(2000);
  await expect
    .poll(
      async () =>
        page.evaluate((name) => {
          try {
            const dbSync = (window as any)._dbSyncForTest;
            if (!dbSync) return true;
            const state = dbSync.getState(dbSync.localPeerId);
            return (state?.products as any[])?.some((p: any) => p.name === name) ?? false;
          } catch {
            return false;
          }
        }, productName),
      { timeout, intervals: [1000, 2000, 3000] },
    )
    .toBe(false);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('P2P Three Nodes — Critical Routes', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  // Small delay between tests to let WebRTC ICE connections fully close
  test.afterEach(async () => {
    await new Promise((r) => setTimeout(r, 1000));
  });

  // ── 1 ────────────────────────────────────────────────────────────────────
  test('1. Admin creates product -> Collaborator sees it synced', async ({ adminPage, collabPage }) => {
    const adminId = await getPeerId(adminPage);
    const collabId = await getPeerId(collabPage);

    // Connect admin <-> collab
    await adminPage.evaluate((id) => {
      (window as any)._p2pManagerForTest?.connect(id);
    }, collabId);
    await waitForPeerConnected(adminPage, collabId);
    await waitForPeerConnected(collabPage, adminId);

    // Assign collaborator role
    await setupAsRole(adminPage, collabId, 'collaborator', fullProductPermissions, collabPage);

    // Create product via UI
    await createProductViaUI(adminPage, {
      name: 'Synced Product Alpha',
      price: '250',
      cost: '120',
      quantity: '25',
    });

    // Wait for sync to collabPage
    await expectProductSync(collabPage, adminPage, 'Synced Product Alpha');

    // Verify collabPage state
    const collabHasProduct = await collabPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return (state?.products as any[])?.some((p: any) => p.name === 'Synced Product Alpha');
    });
    expect(collabHasProduct).toBe(true);
  });

  // ── 2 ────────────────────────────────────────────────────────────────────
  test('2. Admin creates product -> Viewer sees it (read-only)', async ({ adminPage, viewerPage }) => {
    const adminId = await getPeerId(adminPage);
    const viewerId = await getPeerId(viewerPage);

    // Connect admin <-> viewer
    await adminPage.evaluate((id) => {
      (window as any)._p2pManagerForTest?.connect(id);
    }, viewerId);
    await waitForPeerConnected(adminPage, viewerId);
    await waitForPeerConnected(viewerPage, adminId);

    // Assign viewer role
    await setupAsRole(adminPage, viewerId, 'viewer', readOnlyProductPermissions, viewerPage);

    // Create product via UI
    await createProductViaUI(adminPage, {
      name: 'Viewer Sees This',
      price: '99',
      cost: '45',
      quantity: '15',
    });

    // Wait for sync to viewerPage
    await expectProductSync(viewerPage, adminPage, 'Viewer Sees This');

    // Verify viewerPage cannot add products
    await viewerPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(viewerPage);
    const addButtonVisible = await viewerPage
      .getByTestId(PRODUCT_TEST_ID)
      .isVisible()
      .catch(() => false);
    expect(addButtonVisible).toBe(false);
  });

  // ── 3 ────────────────────────────────────────────────────────────────────
  test('3. Collaborator edits product -> Admin sees the change', async ({ adminPage, collabPage }) => {
    const adminId = await getPeerId(adminPage);
    const collabId = await getPeerId(collabPage);

    // Connect
    await adminPage.evaluate((id) => {
      (window as any)._p2pManagerForTest?.connect(id);
    }, collabId);
    await waitForPeerConnected(adminPage, collabId);
    await waitForPeerConnected(collabPage, adminId);

    // Setup collaborator
    await setupAsRole(adminPage, collabId, 'collaborator', fullProductPermissions, collabPage);

    // Admin creates product
    await createProductViaDb(adminPage, {
      name: 'Editable Product',
      price: 100,
      cost: 50,
      quantity: 10,
    });

    // Wait for sync to collab
    await expectProductSync(collabPage, adminPage, 'Editable Product');

    // Collaborator edits the price
    await editProductPriceViaDb(collabPage, 'Editable Product', 175);

    // Admin should see the updated price
    await expectProductPriceSync(adminPage, collabPage, 'Editable Product', 175);
  });

  // ── 4 ────────────────────────────────────────────────────────────────────
  test('4. Viewer cannot edit - permission block', async ({ adminPage, collabPage, viewerPage }) => {
    const viewerId = await getPeerId(viewerPage);

    // Connect all three
    await connectAllPeers(adminPage, collabPage, viewerPage);

    // Setup viewer as read-only
    await setupAsRole(adminPage, viewerId, 'viewer', readOnlyProductPermissions, viewerPage);

    // Admin creates a product
    await createProductViaDb(adminPage, {
      name: 'Should Not Be Edited',
      price: 200,
      cost: 100,
      quantity: 5,
    });
    await expectProductSync(viewerPage, adminPage, 'Should Not Be Edited');

    // Try to upsert from viewer (this should fail or be ignored)
    await viewerPage
      .evaluate(() => {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync?.upsertEntity || !dbSync?.localPeerId) return;
        const state = dbSync.getState(dbSync.localPeerId);
        const product = (state?.products as any[])?.find((p: any) => p.name === 'Should Not Be Edited');
        if (!product) return;
        // Viewer tries to edit — should be blocked by security guard
        dbSync.upsertEntity('products', {
          ...product,
          price: 999,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      })
      .catch(() => {});

    // Give time for any (blocked) sync propagation
    await adminPage.waitForTimeout(3000);

    // Verify admin still sees the original price (100), not 999
    const adminState = await adminPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return state?.products as any[];
    });
    const adminProduct = adminState?.find((p: any) => p.name === 'Should Not Be Edited');
    expect(adminProduct?.price).toBe(200);
  });

  // ── 5 ────────────────────────────────────────────────────────────────────
  test('5. Admin changes Collaborator to read-only -> Collaborator blocked', async ({ adminPage, collabPage }) => {
    const adminId = await getPeerId(adminPage);
    const collabId = await getPeerId(collabPage);

    // Connect
    await adminPage.evaluate((id) => {
      (window as any)._p2pManagerForTest?.connect(id);
    }, collabId);
    await waitForPeerConnected(adminPage, collabId);
    await waitForPeerConnected(collabPage, adminId);

    // Give collab full permissions
    await setupAsRole(adminPage, collabId, 'collaborator', fullProductPermissions, collabPage);
    await collabPage.waitForTimeout(1500);

    // Collab creates a product successfully
    await createProductViaDb(collabPage, {
      name: 'Collab Product Before Demotion',
      price: 80,
      cost: 40,
      quantity: 12,
    });
    await expectProductSync(adminPage, collabPage, 'Collab Product Before Demotion');

    // Admin changes collab to read-only
    await setupAsRole(adminPage, collabId, 'collaborator', readOnlyProductPermissions, collabPage);
    await collabPage.waitForTimeout(2000);

    // Collab tries to create another product
    await collabPage
      .evaluate(() => {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync?.upsertEntity || !dbSync?.localPeerId) return;
        dbSync.upsertEntity('products', {
          id: 'e2e-after-demotion',
          name: 'Collab Product After Demotion',
          quantity: 1,
          price: 10,
          cost: 5,
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      })
      .catch(() => {});

    // Give time for any (blocked) sync
    await adminPage.waitForTimeout(3000);

    // Verify admin does NOT see the second product
    const hasSecond = await adminPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return (state?.products as any[])?.some((p: any) => p.name === 'Collab Product After Demotion');
    });
    expect(hasSecond).toBe(false);
  });

  // ── 6 ────────────────────────────────────────────────────────────────────
  test('6. Concurrent edits - CRDT merge resolves conflict', async ({ adminPage, collabPage, viewerPage }) => {
    const collabId = await getPeerId(collabPage);
    const viewerId = await getPeerId(viewerPage);

    // Connect all three
    await connectAllPeers(adminPage, collabPage, viewerPage);

    // Setup collaborator
    await setupAsRole(adminPage, collabId, 'collaborator', fullProductPermissions, collabPage);
    await setupAsRole(adminPage, viewerId, 'viewer', readOnlyProductPermissions, viewerPage);

    // Admin creates shared product
    await createProductViaDb(adminPage, {
      name: 'Conflict Product',
      price: 100,
      cost: 50,
      quantity: 10,
    });

    // Wait for sync to both
    await expectProductSync(collabPage, adminPage, 'Conflict Product');
    await expectProductSync(viewerPage, adminPage, 'Conflict Product');

    // Both edit the same product simultaneously via CRDT
    await Promise.all([
      editProductPriceViaDb(adminPage, 'Conflict Product', 200),
      editProductPriceViaDb(collabPage, 'Conflict Product', 150),
    ]);

    // Wait for both to settle
    await adminPage.waitForTimeout(4000);

    // Verify final state converges (last-write-wins or CRDT merge)
    const finalAdminPrice = await adminPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return (state?.products as any[])?.find((p: any) => p.name === 'Conflict Product')?.price;
    });
    const finalCollabPrice = await collabPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return (state?.products as any[])?.find((p: any) => p.name === 'Conflict Product')?.price;
    });

    // Both should converge to the same value
    expect(finalAdminPrice).toBe(finalCollabPrice);
    // The merged value should be one of the two conflicting values
    expect([150, 200]).toContain(finalAdminPrice);

    // Viewer should also see the resolved value
    const viewerPrice = await viewerPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return (state?.products as any[])?.find((p: any) => p.name === 'Conflict Product')?.price;
    });
    expect(viewerPrice).toBe(finalAdminPrice);
  });

  // ── 7 ────────────────────────────────────────────────────────────────────
  test('7. Disconnect and reconnect - delta sync works', async ({ adminPage, collabPage }) => {
    const adminId = await getPeerId(adminPage);
    const collabId = await getPeerId(collabPage);

    // Connect
    await adminPage.evaluate((id) => {
      (window as any)._p2pManagerForTest?.connect(id);
    }, collabId);
    await waitForPeerConnected(adminPage, collabId);
    await waitForPeerConnected(collabPage, adminId);

    // Create product A — should sync to collab
    await createProductViaDb(adminPage, {
      name: 'Delta Sync Product A',
      price: 100,
      cost: 50,
      quantity: 10,
    });
    await expectProductSync(collabPage, adminPage, 'Delta Sync Product A');

    // Disconnect collab
    await disconnectPeer(collabPage);
    await adminPage.waitForTimeout(1000);

    // Admin creates product B — collab misses this
    await createProductViaDb(adminPage, {
      name: 'Delta Sync Product B',
      price: 200,
      cost: 100,
      quantity: 5,
    });

    // Verify collab does NOT have product B while disconnected
    const hasBBeforeReconnect = await collabPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return (state?.products as any[])?.some((p: any) => p.name === 'Delta Sync Product B');
    });
    expect(hasBBeforeReconnect).toBe(false);

    // Reconnect collab
    await reconnectPeer(collabPage, adminId);
    await waitForPeerConnected(collabPage, adminId);
    await waitForPeerConnected(adminPage, collabId);

    // Wait for delta sync — collab should eventually receive product B
    await expectProductSync(collabPage, adminPage, 'Delta Sync Product B', 45_000);
  });

  // ── 8 ────────────────────────────────────────────────────────────────────
  test('8. Three products sync across all 3 nodes', async ({ adminPage, collabPage, viewerPage }) => {
    const collabId = await getPeerId(collabPage);
    const viewerId = await getPeerId(viewerPage);

    // Connect all three
    await connectAllPeers(adminPage, collabPage, viewerPage);

    // Setup roles
    await setupAsRole(adminPage, collabId, 'collaborator', fullProductPermissions, collabPage);
    await setupAsRole(adminPage, viewerId, 'viewer', readOnlyProductPermissions, viewerPage);

    const productNames = ['Multi Sync Product 1', 'Multi Sync Product 2', 'Multi Sync Product 3'];

    // Create 3 products sequentially
    for (const [i, name] of productNames.entries()) {
      await createProductViaDb(adminPage, {
        name,
        price: (i + 1) * 50,
        cost: (i + 1) * 25,
        quantity: (i + 1) * 5,
      });
    }

    // Wait for all to sync
    for (const name of productNames) {
      await expectProductSync(collabPage, adminPage, name, 45_000);
      await expectProductSync(viewerPage, adminPage, name, 45_000);
    }

    // Verify product count on all nodes
    const adminCount = await getProductCount(adminPage);
    const collabCount = await getProductCount(collabPage);
    const viewerCount = await getProductCount(viewerPage);

    expect(adminCount).toBeGreaterThanOrEqual(3);
    expect(collabCount).toBe(adminCount);
    expect(viewerCount).toBe(adminCount);
  });

  // ── 9 ────────────────────────────────────────────────────────────────────
  test('9. Admin deletes product -> disappears on other nodes', async ({ adminPage, collabPage, viewerPage }) => {
    const collabId = await getPeerId(collabPage);
    const viewerId = await getPeerId(viewerPage);

    // Connect all three
    await connectAllPeers(adminPage, collabPage, viewerPage);

    // Setup roles
    await setupAsRole(adminPage, collabId, 'collaborator', fullProductPermissions, collabPage);
    await setupAsRole(adminPage, viewerId, 'viewer', readOnlyProductPermissions, viewerPage);

    // Create product
    await createProductViaDb(adminPage, {
      name: 'Product To Delete',
      price: 300,
      cost: 150,
      quantity: 8,
    });

    // Sync to all
    await expectProductSync(collabPage, adminPage, 'Product To Delete');
    await expectProductSync(viewerPage, adminPage, 'Product To Delete');

    // Verify product exists on all
    for (const page of [adminPage, collabPage, viewerPage]) {
      await waitForProductInState(page, 'Product To Delete');
    }

    // Admin deletes the product
    await deleteProductViaDb(adminPage, 'Product To Delete');

    // Wait for deletion to propagate
    await waitForProductAbsent(collabPage, 'Product To Delete', 45_000);
    await waitForProductAbsent(viewerPage, 'Product To Delete', 45_000);

    // Verify admin also lost it
    const adminStillHas = await adminPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return (state?.products as any[])?.some((p: any) => p.name === 'Product To Delete');
    });
    expect(adminStillHas).toBe(false);
  });

  // ── 10 ───────────────────────────────────────────────────────────────────
  test('10. Seed mock data syncs between all 3 nodes', async ({ adminPage, collabPage, viewerPage }) => {
    const collabId = await getPeerId(collabPage);
    const viewerId = await getPeerId(viewerPage);

    // Connect all three
    await connectAllPeers(adminPage, collabPage, viewerPage);

    // Setup roles
    await setupAsRole(adminPage, collabId, 'collaborator', fullProductPermissions, collabPage);
    await setupAsRole(adminPage, viewerId, 'viewer', readOnlyProductPermissions, viewerPage);

    // Create seed data: 5 products programmatically
    const seedProducts = [
      { name: 'Seed Widget A', price: 10, cost: 5, quantity: 100 },
      { name: 'Seed Widget B', price: 20, cost: 10, quantity: 50 },
      { name: 'Seed Widget C', price: 30, cost: 15, quantity: 30 },
      { name: 'Seed Widget D', price: 40, cost: 20, quantity: 20 },
      { name: 'Seed Widget E', price: 50, cost: 25, quantity: 10 },
    ];

    for (const product of seedProducts) {
      await createProductViaDb(adminPage, product);
    }

    // Wait for all seed data to sync across the network
    for (const product of seedProducts) {
      await expectProductSync(collabPage, adminPage, product.name, 45_000);
      await expectProductSync(viewerPage, adminPage, product.name, 45_000);
    }

    // Verify all products present on every node
    for (const product of seedProducts) {
      await waitForProductInState(adminPage, product.name);
      await waitForProductInState(collabPage, product.name);
      await waitForProductInState(viewerPage, product.name);
    }

    // Verify total count on all nodes
    const adminCount = await getProductCount(adminPage);
    const collabCount = await getProductCount(collabPage);
    const viewerCount = await getProductCount(viewerPage);

    expect(adminCount).toBeGreaterThanOrEqual(5);
    expect(collabCount).toBe(adminCount);
    expect(viewerCount).toBe(adminCount);
  });
});
