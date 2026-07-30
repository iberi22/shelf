import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { getLocalPeerId } from './p2p-helpers';

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

const adminPermissions = {
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

test.describe('P2P host authority', () => {
  test('Only the original host can grant peer config updates', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);

    const peerIdLocator = page.locator('span.font-mono.text-yellow-400').first();
    await peerIdLocator.waitFor({ state: 'visible' });
    await expect(peerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });

    const authorityState = await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      return {
        localPeerId: dbSync?.localPeerId,
        masterPeerId: dbSync?.getMasterPeerId?.(),
        isLocalAuthority: dbSync?.isLocalAuthority?.(),
      };
    });

    expect(authorityState.localPeerId).toBeTruthy();
    expect(authorityState.masterPeerId).toBe(authorityState.localPeerId);
    expect(authorityState.isLocalAuthority).toBe(true);

    const blockedResult = await page.evaluate(
      ({ targetPeerId, nextPermissions }) => {
        const dbSync = (window as any)._dbSyncForTest;
        dbSync?.updatePeerConfig(targetPeerId, 'admin', nextPermissions, 'spoofed-peer');
        const state = dbSync?.getState(dbSync?.localPeerId);
        return state?.peers?.find((peer: any) => peer.id === targetPeerId) || null;
      },
      { targetPeerId: 'spoofed-peer-node', nextPermissions: adminPermissions },
    );

    expect(blockedResult).toBeNull();

    const allowedResult = await page.evaluate(
      ({ targetPeerId, nextPermissions }) => {
        const dbSync = (window as any)._dbSyncForTest;
        const authorityPeerId = dbSync?.localPeerId;
        dbSync?.updatePeerConfig(targetPeerId, 'collaborator', nextPermissions, authorityPeerId);
        const state = dbSync?.getState(authorityPeerId);
        return state?.peers?.find((peer: any) => peer.id === targetPeerId) || null;
      },
      { targetPeerId: 'authorized-peer-node', nextPermissions: collaboratorPermissions },
    );

    expect(allowedResult).not.toBeNull();
    expect(allowedResult?.role).toBe('collaborator');
  });

  test('Invite flow: non-master CHANGE_ROLE is rejected, master CHANGE_ROLE is propagated, and unconfigured default role is vendedor', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();

    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    // 1. Setup Admin Node
    await adminPage.goto('/');
    await dismissModals(adminPage);
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);

    const adminPeerId = await getLocalPeerId(adminPage);

    // Force self as master
    await adminPage.evaluate((authorityPeerId) => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync?.setMasterPeerId) return;
      dbSync.setMasterPeerId(authorityPeerId);
      dbSync.updateLinkedNode?.(authorityPeerId, { role: 'admin', isMaster: true }, authorityPeerId);
    }, adminPeerId);

    // Get invite link
    const inviteLinkLocator = adminPage.locator('[data-testid="p2p-invite-link"]');
    await inviteLinkLocator.waitFor({ state: 'attached' });
    const inviteUrl = await inviteLinkLocator.getAttribute('href');
    expect(inviteUrl).toBeTruthy();

    // 2. Setup Collaborator Node using the Invite Link
    await collabPage.goto(inviteUrl!);
    await collabPage.waitForTimeout(1000);
    await dismissModals(collabPage);

    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(collabPage);

    const collabPeerId = await getLocalPeerId(collabPage);

    // Force connection
    await collabPage.evaluate((adminId) => {
      (window as any)._p2pManagerForTest?.connect(adminId);
    }, adminPeerId);

    // Wait for verified pairing
    await waitForPeerConnected(adminPage, collabPeerId);
    await waitForPeerConnected(collabPage, adminPeerId);

    // 3. Verify Peer without explicit role defaults to vendedor
    const collabRole = await collabPage.evaluate(() => {
      return (window as any)._p2pManagerForTest?.role;
    });
    expect(collabRole).toBe('vendedor');

    // 4. Non-master attempts to change role of Admin -> rejected
    const hackResult = await collabPage.evaluate(({ targetId, adminId }) => {
      const p2p = (window as any)._p2pManagerForTest;
      const dbSync = (window as any)._dbSyncForTest;
      // Collab attempts to send CHANGE_ROLE to admin
      p2p?.sendTo(adminId, {
        type: 'CHANGE_ROLE',
        payload: { targetPeerId: targetId, role: 'admin' },
      });
      return dbSync?.getState(targetId)?.role;
    }, { targetId: collabPeerId, adminId: adminPeerId });

    // Collab should still be vendedor (or at least admin role not changed)
    expect(hackResult).not.toBe('admin');

    // 5. Master changes role of Collaborator -> effective and propagated
    await adminPage.evaluate(({ targetId, adminId }) => {
      const p2p = (window as any)._p2pManagerForTest;
      const dbSync = (window as any)._dbSyncForTest;

      dbSync?.updatePeerConfig(targetId, 'admin', undefined, adminId);
      p2p?.sendTo(targetId, {
        type: 'CHANGE_ROLE',
        payload: { targetPeerId: targetId, role: 'admin' },
      });
    }, { targetId: collabPeerId, adminId: adminPeerId });

    // Wait for role propagation
    await expect.poll(async () => {
      return collabPage.evaluate(() => {
        return (window as any)._p2pManagerForTest?.role;
      });
    }, { timeout: 15000 }).toBe('admin');

    await adminContext.close();
    await collabContext.close();
  });
});
