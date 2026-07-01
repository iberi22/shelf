import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Persistence — Multiple Products', () => {
  const products = [
    { name: 'Alpha Product', sku: 'SKU-ALPHA', price: '100', quantity: '10', cost: '50' },
    { name: 'Beta Product', sku: 'SKU-BETA', price: '200', quantity: '20', cost: '100' },
    { name: 'Gamma Product', sku: 'SKU-GAMMA', price: '300', quantity: '30', cost: '150' },
    { name: 'Delta Product', sku: 'SKU-DELTA', price: '400', quantity: '40', cost: '200' },
    { name: 'Epsilon Product', sku: 'SKU-EPSILON', price: '500', quantity: '50', cost: '250' },
  ];

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should persist 5 products after page reload', async ({ page }) => {
    // Navigate to Inventory
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    // Create 5 products
    for (const product of products) {
      await page.getByTestId('add-product-button').click();
      await expect(page.getByTestId('product-form')).toBeVisible();

      await page.getByTestId('product-name-input').fill(product.name);
      await page.getByTestId('product-sku-input').fill(product.sku);
      await page.getByTestId('product-price-input').fill(product.price);
      await page.getByTestId('product-quantity-input').fill(product.quantity);
      await page.getByTestId('product-cost-input').fill(product.cost);

      await page.getByTestId('save-product-button').click();

      // Wait for the product to appear in the list before adding the next one
      await expect(page.locator(`text=${product.name}`).first()).toBeVisible({ timeout: 10000 });
      await dismissModals(page);
    }

    // Reload the page
    await page.reload();
    await setupPage(page);

    // Navigate to Inventory again
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    // Verify all 5 products appear with correct data
    for (const product of products) {
      // Verify via UI visibility
      await expect(page.locator(`text=${product.name}`).first()).toBeVisible({ timeout: 10000 });

      // Verify via internal state to be more precise about price and quantity
      await expect
        .poll(
          async () => {
            return page.evaluate((expectedName) => {
              const state = (window as any).__shelfAppStateForTest;
              const p = state?.products?.find((item: any) => item.name === expectedName && item.isActive !== false);
              if (!p) return null;
              return {
                name: p.name,
                price: String(p.price),
                quantity: String(p.quantity),
                sku: p.sku,
              };
            }, product.name);
          },
          {
            message: `Verifying product ${product.name} after reload`,
            timeout: 10000,
          },
        )
        .toEqual({
          name: product.name,
          price: product.price,
          quantity: product.quantity,
          sku: product.sku,
        });
    }
  });
});
