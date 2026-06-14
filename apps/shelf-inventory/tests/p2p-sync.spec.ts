import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';
import { expectProductSync, getLocalPeerId } from './p2p-helpers';

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

test.describe('P2P Synchronization and Conflict Resolution', () => {
  test('Two browsers can connect, assign roles, and simultaneously add products without conflicts', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await setupPage(adminPage);
    await setupPage(collabPage);

    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    const collabId = await getLocalPeerId(collabPage);

    await adminPage.evaluate((targetPeerId) => {
      (window as any)._p2pManagerForTest?.connect(targetPeerId);
    }, collabId);

    await expect
      .poll(
        async () =>
          adminPage.evaluate((targetPeerId) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, collabId),
        { timeout: 20000 },
      )
      .toBe(true);

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

    await adminPage.waitForTimeout(4000);
    await collabPage.waitForTimeout(4000);

    await dismissModals(adminPage);
    await dismissModals(collabPage);
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();

    const adminAddBtn = adminPage.getByTestId('add-product-button');
    const collabAddBtn = collabPage.getByTestId('add-product-button');

    await expect(adminAddBtn).toBeVisible();
    await expect(collabAddBtn).toBeVisible();

    await adminAddBtn.click();
    await collabAddBtn.click();
    await expect(adminPage.getByTestId('product-name-input')).toBeVisible({ timeout: 10000 });
    await expect(collabPage.getByTestId('product-name-input')).toBeVisible({ timeout: 10000 });

    await adminPage.getByTestId('product-name-input').fill('Product Added By Admin');
    await adminPage.getByTestId('product-quantity-input').fill('10');
    await adminPage.getByTestId('product-price-input').fill('100');
    await adminPage.getByTestId('product-cost-input').fill('50');

    await collabPage.getByTestId('product-name-input').fill('Product Added By Collab');
    await collabPage.getByTestId('product-quantity-input').fill('5');
    await collabPage.getByTestId('product-price-input').fill('50');
    await collabPage.getByTestId('product-cost-input').fill('25');

    const adminSaveBtn = adminPage.getByTestId('save-product-button');
    const collabSaveBtn = collabPage.getByTestId('save-product-button');

    await Promise.all([adminSaveBtn.click(), collabSaveBtn.click()]);

    await expect(adminPage.locator('text=Product Added By Admin').first()).toBeVisible();
    await expect(collabPage.locator('text=Product Added By Collab').first()).toBeVisible();

    await expectProductSync(adminPage, collabPage, 'Product Added By Collab');
    await expectProductSync(collabPage, adminPage, 'Product Added By Admin');

    await expect(adminPage.locator('text=Product Added By Admin').first()).toBeVisible();
    await expect(adminPage.locator('text=Product Added By Collab').first()).toBeVisible();
    await expect(collabPage.locator('text=Product Added By Collab').first()).toBeVisible();
    await expect(collabPage.locator('text=Product Added By Admin').first()).toBeVisible();
  });
});
