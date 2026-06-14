import { expect, test } from '@playwright/test';
import { addOverlayBlocker } from './helpers';

test.describe('Persistence migration', () => {
  test('Preserves existing browser data when upgrading persisted state format', async ({ browser }) => {
    const context = await browser.newContext();
    addOverlayBlocker(context);

    const legacyState = {
      products: [
        {
          id: 'legacy-product-1',
          name: 'Legacy Product',
          quantity: 12,
          price: 99,
          cost: 55,
          imageUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X6n0AAAAASUVORK5CYII=',
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: 'legacy-peer',
        },
      ],
      sales: [],
      clients: [],
      suppliers: [],
      purchaseOrders: [],
      auditLogs: [],
      peers: [],
      teamMembers: [],
      localPeerId: 'legacy-peer',
      role: 'admin',
      permissions: {
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
      arqueoSessions: [],
      ocrResults: [],
      isExpelled: false,
    };

    await context.addInitScript((state) => {
      localStorage.setItem('hasVisited', 'true');
      localStorage.setItem('shelfWelcomeSeen', 'true');
      localStorage.setItem(
        'guest_user',
        JSON.stringify({
          uid: 'guest_legacy',
          email: null,
          subscriptionTier: 'pyme',
          isGuest: true,
        }),
      );
      localStorage.setItem('shelfState', JSON.stringify(state));
    }, legacyState);

    const page = await context.newPage();
    await page.goto('/');

    await expect(async () => {
      const productNames = await page.evaluate(() => {
        const shelfState = (window as any)._shelfStateForTest;
        return (shelfState?.products || []).map((p: any) => p.name);
      });
      expect(productNames).toContain('Legacy Product');
    }).toPass({ timeout: 20000, intervals: [500, 1000, 2000] });

    await page.reload();
    await expect(async () => {
      const productNames = await page.evaluate(() => {
        const shelfState = (window as any)._shelfStateForTest;
        return (shelfState?.products || []).map((p: any) => p.name);
      });
      expect(productNames).toContain('Legacy Product');
    }).toPass({ timeout: 20000, intervals: [500, 1000, 2000] });

    await context.close();
  });
});
