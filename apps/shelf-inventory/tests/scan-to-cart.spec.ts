import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Sales scan-to-cart (#354)', () => {
  test('scanning a product SKU adds the item to the sale cart', async ({ page }) => {
    await page.addInitScript(() => {
      const now = new Date().toISOString();
      localStorage.setItem(
        'guest_user',
        JSON.stringify({ uid: 'guest_scan_cart', email: null, subscriptionTier: 'pyme', isGuest: true }),
      );
      localStorage.setItem(
        'shelfState',
        JSON.stringify({
          products: [
            {
              id: 'prod-scan-1',
              name: 'Scan Cart Product',
              sku: 'SCAN-CART-001',
              quantity: 25,
              price: 12.5,
              cost: 5,
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
          localPeerId: 'peer_scan_cart',
          role: 'admin',
          arqueoSessions: [],
        }),
      );
    });

    await setupPage(page);
    await dismissModals(page);
    await page.getByTestId('nav-item-nav.sales').last().click();
    await dismissModals(page);
    await page.getByTestId('add-sale-button').click();
    await expect(page.getByTestId('sale-form')).toBeVisible();
    const capture = page.getByTestId('sale-barcode-capture');
    await capture.fill('SCAN-CART-001');
    await capture.press('Enter');
    await expect(page.getByTestId('sale-item-product-0')).toHaveValue('prod-scan-1', { timeout: 10000 });
    await expect(page.getByTestId('sale-scan-feedback')).toContainText(/Scan Cart Product|Agregado/i);
  });
});
