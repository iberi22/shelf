import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { expectProductPriceSync, expectProductSync, getLocalPeerId } from './p2p-helpers';

const collaboratorPermissions = {
  canViewProducts: true,
  canEditProducts: true,
  canViewSales: true,
  canEditSales: true,
  canViewClients: true,
  canEditClients: true,
  canViewSuppliers: false,
  canEditSuppliers: false,
  canViewPurchaseOrders: false,
  canEditPurchaseOrders: false,
  canViewReports: false,
  canViewArqueo: false,
  canViewDashboard: false,
};

test.describe('Multi-Peer E2E Synchronization', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test('Peer A creates a product, Peer B syncs, Peer B edits, Peer A syncs', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await setupPage(adminPage);
    await setupPage(collabPage);

    // Navigate to settings to ensure P2PSyncManager is mounted
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    // Wait for P2P to be ready on both pages
    await expect
      .poll(async () => adminPage.evaluate(() => Boolean((window as any)._p2pManagerForTest)), { timeout: 30000 })
      .toBe(true);
    await expect
      .poll(async () => collabPage.evaluate(() => Boolean((window as any)._p2pManagerForTest)), { timeout: 30000 })
      .toBe(true);

    // Get Peer IDs
    const collabId = await getLocalPeerId(collabPage);

    // Connect Peer A to Peer B
    await adminPage.evaluate((targetPeerId: string) => {
      (window as any)._p2pManagerForTest?.connect(targetPeerId);
    }, collabId);

    // Wait for connection
    await expect
      .poll(
        async () => {
          return adminPage.evaluate(() => {
            const dbSync = (window as any)._dbSyncForTest;
            return dbSync ? dbSync.getLinkedNodes()?.length : 0;
          });
        },
        { timeout: 15000 },
      )
      .toBeGreaterThanOrEqual(1);

    // Wait for the transport to be fully connected (both directions)
    await expect
      .poll(
        async () => {
          return adminPage.evaluate((targetPeerId: string) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, collabId);
        },
        { timeout: 20000 },
      )
      .toBe(true);

    // Assign collab role + permissions explicitly so the authz state is deterministic
    await adminPage.evaluate(
      ({ targetPeerId, nextPermissions }) => {
        const p2p = (window as any)._p2pManagerForTest;
        const dbSync = (window as any)._dbSyncForTest;
        dbSync?.updatePeerConfig(targetPeerId, 'collaborator', nextPermissions);
        p2p?.sendTo(targetPeerId, {
          type: 'CHANGE_ROLE',
          payload: { targetPeerId, role: 'collaborator', permissions: nextPermissions },
        });
        p2p?.sendTo(targetPeerId, {
          type: 'UPDATE_PEER_PERMISSIONS',
          payload: { targetPeerId, role: 'collaborator', permissions: nextPermissions },
        });
      },
      { targetPeerId: collabId, nextPermissions: collaboratorPermissions },
    );

    // Let role assignment settle on both peers
    await adminPage.waitForTimeout(2000);
    await collabPage.waitForTimeout(2000);

    // Step 2: Peer A creates a product
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(adminPage);
    await adminPage.waitForTimeout(1000);

    await adminPage.locator('[data-testid="add-product-button"]').click();
    await expect(adminPage.getByTestId('product-form')).toBeVisible();
    await adminPage.waitForTimeout(500);
    await adminPage.getByTestId('product-name-input').fill('Multi-Peer Sync Product');
    await adminPage.getByTestId('product-price-input').fill('100');
    await adminPage.getByTestId('product-cost-input').fill('50');
    await adminPage.getByTestId('product-quantity-input').fill('10');
    await adminPage.getByTestId('save-product-button').click();
    await expect(adminPage.getByTestId('product-form')).toBeHidden({ timeout: 10000 });

    // Step 3: Peer B (collab) verifies the product was received via sync
    // expectProductSync(target, source, name) — target is the peer that should RECEIVE
    await expectProductSync(collabPage, adminPage, 'Multi-Peer Sync Product');

    // Step 4: Peer B edits the product (enable auto-apply so collab write hits products map, not pendingEdits)
    for (const page of [collabPage, adminPage]) {
      await page.evaluate(() => {
        const db = (window as any)._dbSyncForTest;
        const cfg = db?.getInventoryConfig?.() || {};
        db?.setInventoryConfig?.({ ...cfg, autoApplyProductUpdates: true });
      });
    }

    const productId = await collabPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return state?.products?.find((p: any) => p.name === 'Multi-Peer Sync Product')?.id;
    });
    expect(productId).toBeTruthy();

    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await collabPage.waitForTimeout(500);
    await collabPage.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(collabPage.getByTestId('product-form')).toBeVisible();
    await collabPage.getByTestId('product-price-input').fill('250');
    await collabPage.getByTestId('save-product-button').click();
    await expect(collabPage.getByTestId('product-form')).toBeHidden({ timeout: 10000 });

    // Step 5: Peer A (admin) verifies the collab price update
    await expectProductPriceSync(adminPage, collabPage, 'Multi-Peer Sync Product', 250);

    // Cleanup
    await adminContext.close();
    await collabContext.close();
  });
});
