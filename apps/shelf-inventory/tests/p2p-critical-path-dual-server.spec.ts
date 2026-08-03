import { expect, test } from '@playwright/test';
import type { PeerPermissions } from 'p2p-mesh-core';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { expectProductSync, getLocalPeerId } from './p2p-helpers';

const fullProductPermissions: PeerPermissions = {
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

const readOnlyProductPermissions: PeerPermissions = {
  canViewProducts: true,
  canEditProducts: false,
  canViewSales: false,
  canEditSales: false,
  canViewClients: false,
  canEditClients: false,
  canViewSuppliers: false,
  canEditSuppliers: false,
  canViewPurchaseOrders: false,
  canEditPurchaseOrders: false,
  canViewReports: false,
  canViewArqueo: false,
  canViewDashboard: false,
};

async function initNode(page: any, url: string) {
  await setupPage(page, url);
  await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
  await dismissModals(page);
}

async function waitForPeerConnected(page: any, peerId: string) {
  await expect
    .poll(
      async () =>
        page.evaluate((targetPeerId: string) => {
          return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
        }, peerId),
      { timeout: 30000 },
    )
    .toBe(true);
}

async function connectPeerFromHost(
  hostPage: any,
  peerId: string,
  options: {
    role: 'collaborator' | 'custom';
    permissions: PeerPermissions;
  },
) {
  await hostPage.evaluate(
    ({ targetPeerId }: { targetPeerId: string }) => {
      const p2p = (window as any)._p2pManagerForTest;
      const dbSync = (window as any)._dbSyncForTest;
      if (!p2p || !dbSync) {
        throw new Error('P2P test hooks are unavailable');
      }

      p2p.connect(targetPeerId);
    },
    { targetPeerId: peerId },
  );
  await waitForPeerConnected(hostPage, peerId);

  await hostPage.evaluate(
    ({ targetPeerId, role, permissions }: { targetPeerId: string; role: string; permissions: PeerPermissions }) => {
      const p2p = (window as any)._p2pManagerForTest;
      const dbSync = (window as any)._dbSyncForTest;
      if (!p2p || !dbSync) {
        throw new Error('P2P test hooks are unavailable');
      }

      const localPeerId = dbSync.localPeerId;
      if (!localPeerId) {
        throw new Error('Local peer id is not ready');
      }

      dbSync.setMasterPeerId(localPeerId);
      dbSync.updateLinkedNode(localPeerId, { role: 'admin', isMaster: true }, localPeerId);
      dbSync.updatePeerConfig(targetPeerId, role, permissions, localPeerId);
      dbSync.updateLinkedNode(targetPeerId, { role, permissions }, localPeerId);
      p2p.sendTo(targetPeerId, {
        type: 'CHANGE_ROLE',
        payload: { targetPeerId, role, permissions },
      });
      p2p.sendTo(targetPeerId, {
        type: 'UPDATE_PEER_PERMISSIONS',
        payload: { targetPeerId, role, permissions },
      });
    },
    { targetPeerId: peerId, role: options.role, permissions: options.permissions },
  );
}

test.describe('P2P Critical Path DB Synchronization across Dual Servers with and without Permissions', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test('two headless browsers on separate dev servers sync DB data with permissions and block unauthorized edits without permissions', async ({
    browser,
  }) => {
    // 1. Create two contexts from a single browser instance
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    addOverlayBlocker(contextA);
    addOverlayBlocker(contextB);

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // 2. Connect Browser A to Server 1 (port 5174) and Browser B to Server 2 (port 5175)
    // Landing page is skipped automatically via query param / VITE_SKIP_LANDING env
    await initNode(pageA, 'http://127.0.0.1:5174/?testMode=true&skipLanding=true');
    await initNode(pageB, 'http://127.0.0.1:5175/?testMode=true&skipLanding=true');

    const hostId = await getLocalPeerId(pageA);
    const collabId = await getLocalPeerId(pageB);
    expect(hostId).toBeTruthy();
    expect(collabId).toBeTruthy();
    expect(hostId).not.toBe(collabId);

    // Set Host as master authority
    await pageA.evaluate((authorityPeerId: string) => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync?.setMasterPeerId || !dbSync?.updateLinkedNode) return;
      dbSync.setMasterPeerId(authorityPeerId);
      dbSync.updateLinkedNode(authorityPeerId, { role: 'admin', isMaster: true }, authorityPeerId);
    }, hostId);

    // 3. Connect Host (pageA) with Collaborator (pageB) WITH permissions
    await connectPeerFromHost(pageA, collabId, {
      role: 'collaborator',
      permissions: fullProductPermissions,
    });

    await waitForPeerConnected(pageA, collabId);
    await waitForPeerConnected(pageB, hostId);

    await pageB.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await expect(pageB.getByTestId('add-product-button')).toBeVisible({ timeout: 15000 });

    // 4. Test WITH permissions: both nodes can sync data across DBs
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
      pageA.evaluate(upsertProduct, { name: 'Dual Server Admin Product', price: 150, quantity: 20 }),
      pageB.evaluate(upsertProduct, { name: 'Dual Server Collab Product', price: 75, quantity: 10 }),
    ]);

    await expectProductSync(pageA, pageB, 'Dual Server Collab Product');
    await expectProductSync(pageB, pageA, 'Dual Server Admin Product');

    // 5. Test WITHOUT permissions: change Collab role to read-only and verify mutations are rejected
    await pageA.evaluate(
      ({ targetPeerId, permissions }: { targetPeerId: string; permissions: PeerPermissions }) => {
        const p2p = (window as any)._p2pManagerForTest;
        const dbSync = (window as any)._dbSyncForTest;
        const localPeerId = dbSync?.localPeerId;
        if (!p2p || !dbSync || !localPeerId) return;

        dbSync.setMasterPeerId(localPeerId);
        dbSync.updateLinkedNode(localPeerId, { role: 'admin', isMaster: true }, localPeerId);
        dbSync.updatePeerConfig(targetPeerId, 'collaborator', permissions, localPeerId);
        dbSync.updateLinkedNode(targetPeerId, { role: 'collaborator', permissions }, localPeerId);
        p2p.sendTo(targetPeerId, {
          type: 'CHANGE_ROLE',
          payload: { targetPeerId, role: 'collaborator', permissions },
        });
        p2p.sendTo(targetPeerId, {
          type: 'UPDATE_PEER_PERMISSIONS',
          payload: { targetPeerId, role: 'collaborator', permissions },
        });
      },
      { targetPeerId: collabId, permissions: readOnlyProductPermissions },
    );

    await pageB.waitForTimeout(2000);

    // Now Collab (pageB) attempts unauthorized product mutation without canEditProducts permission
    await pageB.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync?.localPeerId) return;
      const now = new Date().toISOString();
      dbSync.upsertEntity('products', {
        id: 'unauthorized-prod-dual-server',
        name: 'Unauthorized Dual Server Product',
        quantity: 99,
        price: 999,
        cost: 100,
        isActive: true,
        updatedAt: now,
        updatedBy: dbSync.localPeerId,
      });
    });

    await pageA.waitForTimeout(3000);

    // Verify on Admin (pageA) that the unauthorized product mutation did NOT land in DB state
    const adminProducts = await pageA.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return state?.products || [];
    });
    const hasUnauthorizedProduct = adminProducts.some((p: any) => p.name === 'Unauthorized Dual Server Product');
    expect(hasUnauthorizedProduct).toBe(false);
  });
});
