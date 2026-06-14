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
  canViewSuppliers: false,
  canEditSuppliers: false,
  canViewPurchaseOrders: false,
  canEditPurchaseOrders: false,
  canViewReports: false,
  canViewArqueo: false,
  canViewDashboard: false,
};

test.describe('P2P Synchronization and Conflict Resolution', () => {
  test.setTimeout(120000);

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

    const upsertProduct = ({ name, price, quantity }: { name: string; price: number; quantity: number }) => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync?.localPeerId) throw new Error('dbSync is not ready');
      const now = new Date().toISOString();
      dbSync.upsertEntity('products', {
        id: `e2e-${name.toLowerCase().replaceAll(' ', '-')}`,
        name,
        quantity,
        price,
        cost: Math.round(price / 2),
        isActive: true,
        updatedAt: now,
        updatedBy: dbSync.localPeerId,
      });
    };

    await Promise.all([
      adminPage.evaluate(upsertProduct, { name: 'Product Added By Admin', price: 100, quantity: 10 }),
      collabPage.evaluate(upsertProduct, { name: 'Product Added By Collab', price: 50, quantity: 5 }),
    ]);

    await expectProductSync(adminPage, collabPage, 'Product Added By Collab');
    await expectProductSync(collabPage, adminPage, 'Product Added By Admin');

    const adminProductId = await collabPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const products = dbSync?.getState(dbSync.localPeerId)?.products || [];
      return products.find((product: any) => product.name === 'Product Added By Admin')?.id;
    });
    expect(adminProductId).toBeTruthy();

    await collabPage.evaluate((productId) => {
      const dbSync = (window as any)._dbSyncForTest;
      const currentState = dbSync?.getState(dbSync.localPeerId);
      const product = currentState?.products?.find((item: any) => item.id === productId);
      if (!dbSync || !product) throw new Error('Product not found for CRDT update');

      dbSync.upsertEntity('products', {
        ...product,
        price: 125,
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
        __baseUpdatedAt: product.updatedAt,
      });
    }, adminProductId);

    await expectProductPriceSync(adminPage, collabPage, 'Product Added By Admin', 125);

    const pendingEditsCount = await adminPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      return dbSync?.getState(dbSync.localPeerId)?.pendingEdits?.length || 0;
    });
    expect(pendingEditsCount).toBe(0);

    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    const forceSyncButton = adminPage.getByTestId('p2p-force-sync-button');
    await expect(forceSyncButton).toBeEnabled({ timeout: 10000 });
    await forceSyncButton.click();
  });
});
