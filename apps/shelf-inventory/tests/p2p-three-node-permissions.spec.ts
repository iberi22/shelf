import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page, PeerPermissions } from 'p2p-mesh-core';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { expectProductSync } from './p2p-helpers';

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

async function setupNode(page: Page) {
  await setupPage(page);
  await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
  await dismissModals(page);
}

async function getPeerId(page: Page) {
  const locator = page.locator('span.font-mono.text-yellow-400, code.font-mono.text-yellow-400').first();
  await locator.waitFor({ state: 'visible' });
  await expect
    .poll(async () => page.evaluate(() => (window as any)._dbSyncForTest?.localPeerId || null), { timeout: 30000 })
    .toBeTruthy();
  return (await locator.innerText()).split('\n')[0].trim();
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

async function connectPeerFromHost(
  hostPage: Page,
  peerId: string,
  options: {
    role: 'collaborator' | 'custom';
    permissions?: PeerPermissions;
  },
) {
  const desiredPermissions = options.permissions || readOnlyProductPermissions;
  await hostPage.evaluate(
    ({ targetPeerId }) => {
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
  await expect
    .poll(
      async () =>
        hostPage.evaluate((targetPeerId) => {
          try {
            const dbSync = (window as any)._dbSyncForTest;
            const state = dbSync?.getState(dbSync?.localPeerId);
            const peer = state?.peers?.find((item: any) => item.id === targetPeerId);
            return peer?.status;
          } catch {
            return null;
          }
        }, peerId),
      { timeout: 30000 },
    )
    .toBe('verified');

  await hostPage.evaluate(
    ({ targetPeerId, role, permissions }) => {
      const p2p = (window as any)._p2pManagerForTest;
      const dbSync = (window as any)._dbSyncForTest;
      if (!p2p || !dbSync) {
        throw new Error('P2P test hooks are unavailable');
      }

      const localPeerId = dbSync.localPeerId;
      if (!localPeerId) {
        throw new Error('Local peer id is not ready');
      }

      const finalRole = role === 'custom' ? 'custom' : 'collaborator';
      dbSync.setMasterPeerId(localPeerId);
      dbSync.updateLinkedNode(localPeerId, { role: 'admin', isMaster: true }, localPeerId);
      dbSync.updatePeerConfig(targetPeerId, finalRole, permissions, localPeerId);
      dbSync.updateLinkedNode(targetPeerId, { role: finalRole, permissions }, localPeerId);
      p2p.sendTo(targetPeerId, {
        type: 'CHANGE_ROLE',
        payload: { targetPeerId, role: finalRole, permissions },
      });
      p2p.sendTo(targetPeerId, {
        type: 'UPDATE_PEER_PERMISSIONS',
        payload: { targetPeerId, role: finalRole, permissions },
      });
    },
    { targetPeerId: peerId, role: options.role, permissions: desiredPermissions },
  );
}

test.describe('P2P Three Node Permissions', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test('three nodes sync products and permission changes across the network', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const nodeAContext = await browser.newContext();
    const nodeBContext = await browser.newContext();

    addOverlayBlocker(nodeAContext);
    addOverlayBlocker(nodeBContext);

    const hostPage = await hostContext.newPage();
    const nodeAPage = await nodeAContext.newPage();
    const nodeBPage = await nodeBContext.newPage();

    await setupNode(hostPage);
    await setupNode(nodeAPage);
    await setupNode(nodeBPage);

    const initialHostId = await getPeerId(hostPage);
    const nodeAId = await getPeerId(nodeAPage);
    const nodeBId = await getPeerId(nodeBPage);
    expect(initialHostId).toBeTruthy();
    expect(nodeAId).toBeTruthy();
    expect(nodeBId).toBeTruthy();

    await hostPage.evaluate((authorityPeerId) => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync?.setMasterPeerId || !dbSync?.updateLinkedNode) return;
      dbSync.setMasterPeerId(authorityPeerId);
      dbSync.updateLinkedNode(authorityPeerId, { role: 'admin', isMaster: true }, authorityPeerId);
    }, initialHostId);

    await hostPage.reload();
    await hostPage.waitForTimeout(500);
    await hostPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(hostPage);
    const hostId = await getPeerId(hostPage);
    // After a clean reload with the peer ID preserved, the host should keep its identity
    expect(hostId).toBe(initialHostId);

    await connectPeerFromHost(hostPage, nodeAId, {
      role: 'collaborator',
      permissions: fullProductPermissions,
    });
    await connectPeerFromHost(hostPage, nodeBId, {
      role: 'collaborator',
      permissions: fullProductPermissions,
    });

    await waitForPeerConnected(hostPage, nodeAId);
    await waitForPeerConnected(hostPage, nodeBId);
    await waitForPeerConnected(nodeAPage, hostId);
    await waitForPeerConnected(nodeBPage, hostId);

    await nodeBPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await expect(nodeBPage.getByTestId('add-product-button')).toBeVisible({ timeout: 10000 });

    await hostPage.evaluate(
      ({ targetPeerId, permissions }) => {
        const p2p = (window as any)._p2pManagerForTest;
        const dbSync = (window as any)._dbSyncForTest;
        const localPeerId = dbSync?.localPeerId;
        if (!p2p || !dbSync || !localPeerId) return;

        dbSync.setMasterPeerId(localPeerId);
        dbSync.updateLinkedNode(localPeerId, { role: 'admin', isMaster: true }, localPeerId);
        dbSync.updatePeerConfig(targetPeerId, 'custom', permissions, localPeerId);
        dbSync.updateLinkedNode(targetPeerId, { role: 'custom', permissions }, localPeerId);
        p2p.sendTo(targetPeerId, {
          type: 'CHANGE_ROLE',
          payload: { targetPeerId, role: 'custom', permissions },
        });
        p2p.sendTo(targetPeerId, {
          type: 'UPDATE_PEER_PERMISSIONS',
          payload: { targetPeerId, role: 'custom', permissions },
        });
      },
      { targetPeerId: nodeBId, permissions: readOnlyProductPermissions },
    );

    await hostPage.evaluate(
      ({ targetPeerId, permissions }) => {
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
      { targetPeerId: nodeBId, permissions: fullProductPermissions },
    );

    await nodeBPage.waitForTimeout(1500);
    await nodeBPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await expect(nodeBPage.getByTestId('add-product-button')).toBeVisible({ timeout: 10000 });

    const productId = randomUUID();
    await nodeBPage.evaluate(
      ({ id, name }) => {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync?.upsertEntity || !dbSync?.localPeerId) {
          throw new Error('P2P test hooks are unavailable');
        }

        dbSync.upsertEntity('products', {
          id,
          isActive: true,
          name,
          quantity: 8,
          price: 88,
          cost: 44,
          updatedBy: dbSync.localPeerId,
          updatedAt: new Date().toISOString(),
        });
      },
      { id: productId, name: 'Three Node Sync Product' },
    );

    await expectProductSync(hostPage, nodeBPage, 'Three Node Sync Product', 40000);
    await expectProductSync(nodeAPage, nodeBPage, 'Three Node Sync Product', 40000);

    await nodeAPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await expect(nodeAPage.getByTestId('add-product-button')).toBeVisible({ timeout: 10000 });

    const hostState = await hostPage.evaluate(() => {
      try {
        const dbSync = (window as any)._dbSyncForTest;
        return dbSync?.getState(dbSync?.localPeerId) || {};
      } catch {
        return {};
      }
    });
    expect((hostState.peers || []).length).toBeGreaterThanOrEqual(3);
    expect((hostState.products || []).some((product: any) => product.name === 'Three Node Sync Product')).toBe(true);

    const nodeAState = await nodeAPage.evaluate(() => {
      try {
        const dbSync = (window as any)._dbSyncForTest;
        return dbSync?.getState(dbSync?.localPeerId) || {};
      } catch {
        return {};
      }
    });
    expect((nodeAState.products || []).some((product: any) => product.name === 'Three Node Sync Product')).toBe(true);
  });
});
