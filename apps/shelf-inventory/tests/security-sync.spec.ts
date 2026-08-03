import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals } from './helpers';

test.describe('Security & Unauthorized Mutations', () => {
  test('Collaborator is blocked from mutating unauthorized tables locally', async ({ browser }) => {
    const context = await browser.newContext();
    addOverlayBlocker(context);

    const page = await context.newPage();
    await page.goto('/');
    await dismissModals(page);
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);

    const peerIdLocator = page.locator('span.font-mono.text-yellow-400').first();
    await peerIdLocator.waitFor({ state: 'visible' });
    await expect
      .poll(async () => page.evaluate(() => (window as any)._dbSyncForTest?.localPeerId || null), { timeout: 30000 })
      .toBeTruthy();

    const result = await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync) return { error: 'NO_DBSYNC' };

      const authorityPeerId = dbSync.getMasterPeerId?.();
      const originalLocalPeerId = dbSync.localPeerId;

      // Simulate a collaborator context by swapping the local peer identity to a
      // non-authority peer before exercising the mutation guards.
      dbSync.localPeerId = 'collaborator-node';

      dbSync.updatePeerConfig(
        'spoofed-peer-node',
        'admin',
        {
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
        },
        'spoofed-peer',
      );

      dbSync.upsertEntity('auditLogs', {
        id: 'hack-123',
        action: 'ELEVATE_PRIVILEGES',
        timestamp: new Date().toISOString(),
      });

      const state = dbSync.getState('collaborator-node');
      dbSync.localPeerId = originalLocalPeerId;

      return {
        authorityPeerId,
        peers: state?.peers || [],
        auditLogs: state?.auditLogs || [],
      };
    });

    expect(result.authorityPeerId).toBeTruthy();
    expect(result.peers.some((peer: any) => peer.id === 'spoofed-peer-node')).toBe(false);
    expect(result.auditLogs.some((log: any) => log.id === 'hack-123')).toBe(false);
  });
});
