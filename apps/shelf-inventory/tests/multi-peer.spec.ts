import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';
import { expectProductPriceSync, expectProductSync, getLocalPeerId } from './p2p-helpers';

const collaboratorPermissions = {
  canViewProducts: true,
  canEditProducts: true,
  canViewSales: true,
  canEditSales: true,
  canViewClients: true,
  canEditClients: true,
  canViewSuppliers: true,
  canEditSuppliers: true,
  canViewPurchaseOrders: true,
  canEditPurchaseOrders: true,
  canViewReports: true,
  canViewArqueo: true,
  canViewDashboard: true,
};

test.describe('Multi-Peer E2E Synchronization', () => {
  test.setTimeout(120000);

  test('Peer A creates a product, Peer B syncs, Peer B edits, Peer A syncs', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await setupPage(adminPage);
    await setupPage(collabPage);

    // Navigate to settings to ensure P2PSyncManager is mounted (where Peer ID is displayed)
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    // Get Peer IDs
    const collabId = await getLocalPeerId(collabPage);

    // Connect Peer A to Peer B
    await adminPage.evaluate((targetPeerId) => {
      (window as any)._p2pManagerForTest?.connect(targetPeerId);
    }, collabId);

    // Wait for connection
    await expect
      .poll(
        async () =>
          adminPage.evaluate((targetPeerId) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, collabId),
        { timeout: 20000 },
      )
      .toBe(true);

    // Assign Role
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

    await adminPage.waitForTimeout(2000);

    // Step 1: Peer A creates a product via UI
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(adminPage);

    await adminPage.getByTestId('add-product-button').click();
    await expect(adminPage.getByTestId('product-form')).toBeVisible();
    await adminPage.getByTestId('product-name-input').fill('Multi-Peer Sync Product');
    await adminPage.getByTestId('product-quantity-input').fill('10');
    await adminPage.getByTestId('product-price-input').fill('100');
    await adminPage.getByTestId('product-cost-input').fill('50');
    await adminPage.getByTestId('save-product-button').click();

    // Verify it appeared on Admin
    await expect(adminPage.locator('text=Multi-Peer Sync Product').first()).toBeVisible({ timeout: 10000 });

    // Step 2: Peer B verifies it syncs
    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(collabPage);
    await expectProductSync(collabPage, adminPage, 'Multi-Peer Sync Product');

    // Step 3: Peer B edits the product via UI
    const productId = await collabPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return state?.products?.find((p: any) => p.name === 'Multi-Peer Sync Product')?.id;
    });
    expect(productId).toBeTruthy();

    await collabPage.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(collabPage.getByTestId('product-form')).toBeVisible();
    await collabPage.getByTestId('product-price-input').fill('250');
    await collabPage.getByTestId('save-product-button').click();

    // Step 4: Peer A verifies the update
    await expectProductPriceSync(adminPage, collabPage, 'Multi-Peer Sync Product', 250);
  });
});
