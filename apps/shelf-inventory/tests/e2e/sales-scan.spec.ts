import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from '../helpers';

test.describe('Sales scan-to-cart (SRC-FUN-002)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const now = new Date().toISOString();
      localStorage.setItem(
        'guest_user',
        JSON.stringify({ uid: 'guest_scan_e2e', email: null, subscriptionTier: 'pyme', isGuest: true }),
      );
      localStorage.setItem(
        'shelfState',
        JSON.stringify({
          products: [
            {
              id: 'prod-scan-e2e-1',
              name: 'Scan E2E Widget',
              sku: 'BARCODE-E2E-100',
              quantity: 50,
              price: 25.0,
              cost: 10.0,
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
          localPeerId: 'peer_scan_e2e',
          role: 'admin',
          arqueoSessions: [],
        }),
      );
    });
  });

  test('scanning a SKU adds item to cart', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);
    await page.getByTestId('nav-item-nav.sales').last().click();
    await dismissModals(page);

    await page.getByTestId('add-sale-button').click();
    await expect(page.getByTestId('sale-form')).toBeVisible();

    const capture = page.getByTestId('sale-barcode-capture');
    await capture.fill('BARCODE-E2E-100');
    await capture.press('Enter');

    await expect(page.getByTestId('sale-item-product-0')).toHaveValue('prod-scan-e2e-1', { timeout: 10000 });
    await expect(page.getByTestId('sale-item-quantity-0')).toHaveValue('1');
    await expect(page.getByTestId('sale-scan-feedback')).toContainText(/Scan E2E Widget|Agregado/i);
  });

  test('scanning the same SKU again auto-increments item quantity', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);
    await page.getByTestId('nav-item-nav.sales').last().click();
    await dismissModals(page);

    await page.getByTestId('add-sale-button').click();
    await expect(page.getByTestId('sale-form')).toBeVisible();

    const capture = page.getByTestId('sale-barcode-capture');

    // First scan
    await capture.fill('BARCODE-E2E-100');
    await capture.press('Enter');
    await expect(page.getByTestId('sale-item-product-0')).toHaveValue('prod-scan-e2e-1', { timeout: 10000 });
    await expect(page.getByTestId('sale-item-quantity-0')).toHaveValue('1');

    // Second scan of same product
    await capture.fill('BARCODE-E2E-100');
    await capture.press('Enter');
    await expect(page.getByTestId('sale-item-quantity-0')).toHaveValue('2', { timeout: 10000 });
    await expect(page.getByTestId('sale-scan-feedback')).toContainText(/x2/i);
  });
});
