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

test.describe('P2P Conflict Resolution', () => {
  test.setTimeout(120000);

  test('Collaborator-Admin conflict is routed to pendingEdits and resolved via UI', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await setupPage(adminPage);
    await setupPage(collabPage);

    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    const collabId = await getLocalPeerId(collabPage);
    const adminId = await getLocalPeerId(adminPage);

    // Connect peers
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

    // Assign collaborator role on Admin side
    await adminPage.evaluate(({ targetPeerId, nextPermissions }) => {
        const dbSync = (window as any)._dbSyncForTest;
        dbSync.updatePeerConfig(targetPeerId, 'collaborator', nextPermissions);
    }, { targetPeerId: collabId, nextPermissions: collaboratorPermissions });

    // Create a product from Admin
    const initialProduct = {
      id: 'conflict-product-1',
      name: 'Conflict Product',
      price: 100,
      quantity: 10,
      isActive: true,
    };

    await adminPage.evaluate((product) => {
      const dbSync = (window as any)._dbSyncForTest;
      dbSync.upsertEntity('products', {
        ...product,
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
      });
    }, initialProduct);

    // Ensure product is synced to collaborator
    await expectProductSync(collabPage, adminPage, 'Conflict Product');

    // Get the product state from Collab to have the correct updatedAt for simulation
    const productOnCollab = await collabPage.evaluate((id) => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync.getState();
      return state.products.find((p: any) => p.id === id);
    }, initialProduct.id);

    expect(productOnCollab).toBeTruthy();
    const baseUpdatedAt = productOnCollab.updatedAt;

    // Simulate concurrent edits
    // 1. Admin updates price to 150
    await adminPage.evaluate((id) => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync.getState();
      const product = state.products.find((p: any) => p.id === id);
      dbSync.upsertEntity('products', {
        ...product,
        price: 150,
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
      });
    }, initialProduct.id);

    // 2. Collab updates price to 200, but using the baseUpdatedAt (concurrent edit)
    // We force it to NOT be admin and NOT be master in dbSync for this call
    await collabPage.evaluate(({ id, baseTime }) => {
      const dbSync = (window as any)._dbSyncForTest;

      // Override isLocalAuthority to make this node a non-admin
      dbSync.isLocalAuthority = () => false;
      // Override getEffectivePeerConfig to ensure role is collaborator
      const originalGetEffectivePeerConfig = dbSync.getEffectivePeerConfig.bind(dbSync);
      dbSync.getEffectivePeerConfig = (peerId: string) => {
        if (peerId === dbSync.localPeerId) {
          return { role: 'collaborator', permissions: { canEditProducts: true }, isMaster: false };
        }
        return originalGetEffectivePeerConfig(peerId);
      };

      const state = dbSync.getState();
      const product = state.products.find((p: any) => p.id === id);
      dbSync.upsertEntity('products', {
        ...product,
        price: 200,
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
        __baseUpdatedAt: baseTime,
      });
    }, { id: initialProduct.id, baseTime: baseUpdatedAt });

    // On Admin, verify that pendingEdits now contains the proposal
    await expect.poll(async () => {
      return adminPage.evaluate(() => {
        const dbSync = (window as any)._dbSyncForTest;
        return dbSync.getState().pendingEdits?.length || 0;
      });
    }, { timeout: 30000 }).toBe(1);

    // Verify product on Admin is still 150 (Admin's edit won locally, and Collab's was routed to pending)
    const adminProductPrice = await adminPage.evaluate((id) => {
      const dbSync = (window as any)._dbSyncForTest;
      return dbSync.getState().products.find((p: any) => p.id === id)?.price;
    }, initialProduct.id);
    expect(adminProductPrice).toBe(150);

    // Attempt to click the sync status button which is always in the header
    const syncStatusButton = adminPage.locator('button[title*="Estado"], button[title*="Status"]');
    await syncStatusButton.click({ force: true });

    const reviewButton = adminPage.getByRole('button', { name: /Revisar Ediciones/i });
    await reviewButton.click({ force: true });

    // Now the Modal should be open.
    // MergeResolutionModal.tsx shows fields that differ.
    // It should show 'price'.
    await expect(adminPage.getByText('price', { exact: false })).toBeVisible();

    // Select the "New Version (Vendedor)" which is price 200
    await adminPage.getByText('200').first().click();

    // Click "Fusionar y Guardar"
    await adminPage.getByRole('button', { name: /Fusionar y Guardar/i }).click();

    // Verify pendingEdits is cleared
    await expect.poll(async () => {
      return adminPage.evaluate(() => {
        const dbSync = (window as any)._dbSyncForTest;
        return dbSync.getState().pendingEdits?.length || 0;
      });
    }).toBe(0);

    // Verify product price is now 200 on Admin
    await expect.poll(async () => {
      return adminPage.evaluate((id) => {
        const dbSync = (window as any)._dbSyncForTest;
        return dbSync.getState().products.find((p: any) => p.id === id)?.price;
      }, initialProduct.id);
    }).toBe(200);

    // Verify it syncs back to Collab
    await expectProductPriceSync(collabPage, adminPage, 'Conflict Product', 200);
  });

  test('Admin-Admin conflict follows Last-Write-Wins (LWW)', async ({ browser }) => {
    const admin1Context = await browser.newContext();
    const admin2Context = await browser.newContext();

    const page1 = await admin1Context.newPage();
    const page2 = await admin2Context.newPage();

    await setupPage(page1);
    await setupPage(page2);

    await page1.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await page2.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page1);
    await dismissModals(page2);

    const peer2Id = await getLocalPeerId(page2);

    // Connect peers
    await page1.evaluate((targetPeerId) => {
      (window as any)._p2pManagerForTest?.connect(targetPeerId);
    }, peer2Id);

    await expect
      .poll(
        async () =>
          page1.evaluate((targetPeerId) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, peer2Id),
        { timeout: 20000 },
      )
      .toBe(true);

    // Create a product
    const initialProduct = {
      id: 'lww-product-1',
      name: 'LWW Product',
      price: 100,
      quantity: 10,
      isActive: true,
    };

    await page1.evaluate((product) => {
      const dbSync = (window as any)._dbSyncForTest;
      dbSync.upsertEntity('products', {
        ...product,
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
      });
    }, initialProduct);

    await expectProductSync(page2, page1, 'LWW Product');

    // Both update simultaneously
    await Promise.all([
      page1.evaluate((id) => {
        const dbSync = (window as any)._dbSyncForTest;
        const product = dbSync.getState().products.find((p: any) => p.id === id);
        dbSync.upsertEntity('products', {
          ...product,
          price: 111,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      }, initialProduct.id),
      page2.evaluate((id) => {
        const dbSync = (window as any)._dbSyncForTest;
        const product = dbSync.getState().products.find((p: any) => p.id === id);
        dbSync.upsertEntity('products', {
          ...product,
          price: 222,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      }, initialProduct.id)
    ]);

    // Wait for convergence
    await expect.poll(async () => {
      const price1 = await page1.evaluate((id) => {
        const dbSync = (window as any)._dbSyncForTest;
        return dbSync.getState().products.find((p: any) => p.id === id)?.price;
      }, initialProduct.id);
      const price2 = await page2.evaluate((id) => {
        const dbSync = (window as any)._dbSyncForTest;
        return dbSync.getState().products.find((p: any) => p.id === id)?.price;
      }, initialProduct.id);
      return price1 === price2 && (price1 === 111 || price1 === 222);
    }, { timeout: 20000 }).toBe(true);
  });
});
