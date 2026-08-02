import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('P2P offline fallback (#366)', () => {
  test('shows offline P2P badge and keeps local inventory ops working', async ({ page, context }) => {
    await page.addInitScript(() => {
      const now = new Date().toISOString();
      localStorage.setItem(
        'guest_user',
        JSON.stringify({ uid: 'guest_offline_p2p', email: null, subscriptionTier: 'pyme', isGuest: true }),
      );
      localStorage.setItem(
        'shelfState',
        JSON.stringify({
          products: [
            {
              id: 'prod-offline-1',
              name: 'Offline Local Product',
              sku: 'OFF-P2P-001',
              quantity: 5,
              price: 9,
              cost: 3,
              isActive: true,
              updatedBy: 'local',
              updatedAt: now,
            },
          ],
          sales: [],
          clients: [],
          suppliers: [],
          purchaseOrders: [],
          peers: [],
          teamMembers: [],
          localPeerId: 'peer_offline_p2p',
          role: 'admin',
          arqueoSessions: [],
        }),
      );
    });

    await setupPage(page);
    await dismissModals(page);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await expect(page.getByTestId('p2p-offline-badge')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('offline-indicator')).toBeVisible();
    await expect(page.getByText(/Sin conexión|Modo offline P2P|offline/i).first()).toBeVisible();

    await page.getByTestId('nav-item-nav.inventory').last().click();
    await dismissModals(page);
    await expect(page.getByText('Offline Local Product').first()).toBeVisible({ timeout: 15000 });

    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();
    await page.getByTestId('product-name-input').fill('Created While Offline P2P');
    await page.getByTestId('product-sku-input').fill('OFF-NEW-001');
    await page.getByTestId('product-price-input').fill('11');
    await page.getByTestId('product-cost-input').fill('4');
    await page.getByTestId('product-quantity-input').fill('3');
    await page.getByTestId('save-product-button').click();
    await expect(page.getByText('Created While Offline P2P').first()).toBeVisible({ timeout: 15000 });
  });
});
