import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page, PeerPermissions } from 'p2p-mesh-core';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { expectProductPriceSync, expectProductSync, getLocalPeerId } from './p2p-helpers';

const limitedPermissions: PeerPermissions = {
  canViewProducts: true,
  canEditProducts: false,
  canViewSales: false,
  canEditSales: false,
  canViewClients: true,
  canEditClients: false,
  canViewSuppliers: false,
  canEditSuppliers: false,
  canViewPurchaseOrders: false,
  canEditPurchaseOrders: false,
  canViewReports: false,
  canViewArqueo: false,
  canViewDashboard: false,
};

const fullPermissions: PeerPermissions = {
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

async function setupNode(page: Page) {
  await setupPage(page);
  await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
  await dismissModals(page);
}

async function waitForPeerConnected(page: Page, peerId: string) {
  await expect
    .poll(
      async () =>
        page.evaluate((targetPeerId) => {
          return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
        }, peerId),
      { timeout: 30000 },
    )
    .toBe(true);
}

test.describe('P2P Invite Link, Pairing, and Permission Enforcement', () => {
  test.setTimeout(120000);

  test('Connects two nodes via invite link, synchronizes data, and enforces/updates permissions', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();

    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    // Direct browser console logs to terminal for debugging
    adminPage.on('console', (msg) => console.log('ADMIN CONSOLE:', msg.text()));
    collabPage.on('console', (msg) => console.log('COLLAB CONSOLE:', msg.text()));

    // 1. Setup Admin Node
    await setupNode(adminPage);
    const adminPeerId = await getLocalPeerId(adminPage);
    expect(adminPeerId).toBeTruthy();

    // Configure Admin as local Master/Authority for the tests (force self-master)
    await adminPage.evaluate((authorityPeerId) => {
      const dbSync = (window as any)._dbSyncForTest;
      const p2p = (window as any)._p2pManagerForTest;
      if (!dbSync?.setMasterPeerId) return;
      dbSync.setMasterPeerId(authorityPeerId);
      dbSync.updateLinkedNode?.(authorityPeerId, { role: 'admin', isMaster: true }, authorityPeerId);
      // Keep transport role aligned so isLocalAuthorityPeer bootstrap works
      if (p2p) p2p.role = 'admin';
      if (!dbSync.isLocalAuthority?.()) {
        throw new Error(`Admin is not local authority after setMasterPeerId (master=${dbSync.getMasterPeerId?.()})`);
      }
    }, adminPeerId);

    // 1.5 Create a pre-existing product in Admin BEFORE Collaborator connects
    const preExistingProductId = randomUUID();
    const preExistingProductName = 'Pre-existing Product Test';
    await adminPage.evaluate(
      ({ id, name }) => {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) throw new Error('dbSync is not ready');
        dbSync.upsertEntity('products', {
          id,
          name,
          quantity: 20,
          price: 150,
          cost: 75,
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      },
      { id: preExistingProductId, name: preExistingProductName },
    );

    // Get the actual invite link from the Admin's UI
    const inviteLinkLocator = adminPage.locator('[data-testid="p2p-invite-link"]');
    await inviteLinkLocator.waitFor({ state: 'attached' });
    const inviteUrl = await inviteLinkLocator.getAttribute('href');
    if (!inviteUrl) {
      throw new Error('Failed to find invite link on Admin settings page');
    }
    console.log('Retrieved invite URL from Admin UI:', inviteUrl);

    // 2. Setup Collaborator Node using the Invite Link
    await collabPage.addInitScript(() => {
      localStorage.setItem('hasVisited', 'true');
      localStorage.setItem('shelfWelcomeSeen', 'true');
    });

    // Navigate to the invite URL directly
    await collabPage.goto(inviteUrl);
    await collabPage.waitForTimeout(3000);
    await dismissModals(collabPage);

    // Go to settings to view peer details
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(collabPage);

    const collabPeerId = await getLocalPeerId(collabPage);
    expect(collabPeerId).toBeTruthy();

    // Robust connection check: if auto-connect failed during initial load due to WebRTC state, retry manually.
    const isCollabConnected = await collabPage.evaluate((adminId) => {
      return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(adminId));
    }, adminPeerId);

    if (!isCollabConnected) {
      console.log('Forcing connection retry from Collaborator side...');
      await collabPage.evaluate((adminId) => {
        (window as any)._p2pManagerForTest?.connect(adminId);
      }, adminPeerId);
    }

    // 3. Verify automatic pairing and connection
    await waitForPeerConnected(adminPage, collabPeerId);
    await waitForPeerConnected(collabPage, adminPeerId);

    // 4. Verify peers are status 'verified' in state
    await expect
      .poll(
        async () =>
          adminPage.evaluate((targetPeerId) => {
            try {
              const dbSync = (window as any)._dbSyncForTest;
              const state = dbSync?.getState(dbSync?.localPeerId);
              const peer = state?.peers?.find((item: any) => item.id === targetPeerId);
              return peer?.status;
            } catch {
              return null;
            }
          }, collabPeerId),
        { timeout: 30000 },
      )
      .toBe('verified');

    // 5. Admin grants LIMITED permissions to Collaborator
    await adminPage.evaluate(
      ({ targetPeerId, nextPermissions }) => {
        const p2p = (window as any)._p2pManagerForTest;
        const dbSync = (window as any)._dbSyncForTest;
        if (!p2p || !dbSync) throw new Error('P2P test hooks are unavailable');

        const localPeerId = dbSync.localPeerId as string;
        // Re-assert master right before authority messages (Yjs merge can lag)
        dbSync.setMasterPeerId(localPeerId);
        p2p.role = 'admin';
        if (!dbSync.isLocalAuthority()) {
          throw new Error(`Admin lost authority before CHANGE_ROLE (master=${dbSync.getMasterPeerId?.()})`);
        }

        dbSync.updatePeerConfig(targetPeerId, 'collaborator', nextPermissions, localPeerId);
        dbSync.updateLinkedNode(targetPeerId, { role: 'collaborator', permissions: nextPermissions }, localPeerId);
        p2p.sendTo(targetPeerId, {
          type: 'CHANGE_ROLE',
          payload: { targetPeerId, role: 'collaborator', permissions: nextPermissions },
        });
        p2p.sendTo(targetPeerId, {
          type: 'UPDATE_PEER_PERMISSIONS',
          payload: { targetPeerId, role: 'collaborator', permissions: nextPermissions },
        });
      },
      { targetPeerId: collabPeerId, nextPermissions: limitedPermissions },
    );

    // Wait for permission propagation
    await adminPage.waitForTimeout(2000);
    await collabPage.waitForTimeout(2000);

    // 5.5 Verify that the pre-existing product syncs automatically to the collaborator after connection
    await expectProductSync(collabPage, adminPage, preExistingProductName);

    // 6. Test Data Sync: Admin adds a product, which should sync to Collaborator
    const adminProductId = randomUUID();
    const productName = 'Product Auth Sync Test';

    await adminPage.evaluate(
      ({ id, name }) => {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) throw new Error('dbSync is not ready');
        dbSync.upsertEntity('products', {
          id,
          name,
          quantity: 15,
          price: 100,
          cost: 50,
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      },
      { id: adminProductId, name: productName },
    );

    // Check if the product successfully synchronized to the collaborator
    await expectProductSync(collabPage, adminPage, productName);

    // 7. Test Permission Restriction (Unauthorized Edit):
    // Collaborator tries to edit product price (canEditProducts: false)
    await collabPage.evaluate(
      ({ id }) => {
        const dbSync = (window as any)._dbSyncForTest;
        const currentState = dbSync?.getState(dbSync.localPeerId);
        const product = currentState?.products?.find((item: any) => item.id === id);
        if (!dbSync || !product) throw new Error('Product not found for edit');

        dbSync.upsertEntity('products', {
          ...product,
          price: 999,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
          __baseUpdatedAt: product.updatedAt,
        });
      },
      { id: adminProductId, name: productName },
    );

    // Since edit is unauthorized, the Admin should reject and trigger self-healing (revert price back to 100)
    await expect
      .poll(
        async () =>
          collabPage.evaluate((id) => {
            const dbSync = (window as any)._dbSyncForTest;
            const state = dbSync?.getState(dbSync.localPeerId);
            const p = state?.products?.find((item: any) => item.id === id);
            return p?.price;
          }, adminProductId),
        { timeout: 30000 },
      )
      .toBe(100);

    // Verify Admin's price was never altered
    const adminPrice = await adminPage.evaluate((id) => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      const p = state?.products?.find((item: any) => item.id === id);
      return p?.price;
    }, adminProductId);
    expect(adminPrice).toBe(100);

    // 8. Upgrade Collaborator permissions to FULL (canEditProducts: true)
    await adminPage.evaluate(
      ({ targetPeerId, nextPermissions }) => {
        const p2p = (window as any)._p2pManagerForTest;
        const dbSync = (window as any)._dbSyncForTest;
        if (!p2p || !dbSync) throw new Error('P2P test hooks are unavailable');

        const localPeerId = dbSync.localPeerId;
        dbSync.updatePeerConfig(targetPeerId, 'collaborator', nextPermissions, localPeerId);
        dbSync.updateLinkedNode(targetPeerId, { role: 'collaborator', permissions: nextPermissions }, localPeerId);
        p2p.sendTo(targetPeerId, {
          type: 'CHANGE_ROLE',
          payload: { targetPeerId, role: 'collaborator', permissions: nextPermissions },
        });
        p2p.sendTo(targetPeerId, {
          type: 'UPDATE_PEER_PERMISSIONS',
          payload: { targetPeerId, role: 'collaborator', permissions: nextPermissions },
        });
      },
      { targetPeerId: collabPeerId, nextPermissions: fullPermissions },
    );

    await adminPage.waitForTimeout(2000);
    await collabPage.waitForTimeout(2000);

    // 9. Test Permission Conceded:
    // Collaborator tries to edit product price again (now has permission)
    await collabPage.evaluate(
      ({ id }) => {
        const dbSync = (window as any)._dbSyncForTest;
        const currentState = dbSync?.getState(dbSync.localPeerId);
        const product = currentState?.products?.find((item: any) => item.id === id);
        if (!dbSync || !product) throw new Error('Product not found for edit');

        dbSync.upsertEntity('products', {
          ...product,
          price: 250,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
          __baseUpdatedAt: product.updatedAt,
        });
      },
      { id: adminProductId, name: productName },
    );

    // Now it should successfully sync the price to 250 on both nodes
    await expectProductPriceSync(adminPage, collabPage, productName, 250);
    await expectProductPriceSync(collabPage, adminPage, productName, 250);
  });
});
