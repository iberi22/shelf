import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from '../helpers';

test.describe('E2E: Multiple products persist after page reload', () => {
  const products = [
    { name: 'Product A', quantity: '10', price: '100', cost: '50' },
    { name: 'Product B', quantity: '20', price: '200', cost: '100' },
    { name: 'Product C', quantity: '30', price: '300', cost: '150' },
  ];

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should create 3 products and they should persist after reload', async ({ page }) => {
    // Navigate to Inventory
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    // Create 3 products
    for (const product of products) {
      await page.getByTestId('add-product-button').click();
      await expect(page.getByTestId('product-form')).toBeVisible();

      await page.getByTestId('product-name-input').fill(product.name);
      await page.getByTestId('product-quantity-input').fill(product.quantity);
      await page.getByTestId('product-price-input').fill(product.price);
      await page.getByTestId('product-cost-input').fill(product.cost);

      await page.getByTestId('save-product-button').click();

      // Wait for the product to appear in the list
      await expect(page.locator(`text=${product.name}`).first()).toBeVisible({ timeout: 10000 });
      await dismissModals(page);
    }

    // Verify initial count
    const initialCount = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.filter((p: any) => p.isActive !== false).length;
    });
    expect(initialCount).toBe(3);

    // Reload the page
    await page.reload();
    await setupPage(page);

    // Navigate back to Inventory
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    // Verify all 3 products are still displayed and have correct data
    for (const product of products) {
      // UI check
      await expect(page.locator(`text=${product.name}`).first()).toBeVisible({ timeout: 10000 });

      // State check for precise values
      await expect
        .poll(async () => {
          return page.evaluate((name) => {
            const state = (window as any).__shelfAppStateForTest;
            const p = state?.products?.find((item: any) => item.name === name && item.isActive !== false);
            if (!p) return null;
            return {
              name: p.name,
              quantity: String(p.quantity),
              price: String(p.price),
            };
          }, product.name);
        })
        .toEqual({
          name: product.name,
          quantity: product.quantity,
          price: product.price,
        });
    }

    // Assert final total product count is 3
    const finalCount = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.filter((p: any) => p.isActive !== false).length;
    });
    expect(finalCount).toBe(3);
  });
});
