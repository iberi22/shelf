import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

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

test.describe('P2P host authority', () => {
  test.describe.configure({ mode: 'serial' });
  test('Only the original host can grant peer config updates', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);

    const peerIdLocator = page.locator('span.font-mono.text-yellow-400').first();
    await peerIdLocator.waitFor({ state: 'visible' });
    await expect
      .poll(async () => page.evaluate(() => (window as any)._dbSyncForTest?.localPeerId || null), { timeout: 30000 })
      .toBeTruthy();

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
});
