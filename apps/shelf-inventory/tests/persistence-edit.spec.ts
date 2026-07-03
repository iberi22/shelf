import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Persistence: Product Edit', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('edited product data persists after page reload', async ({ page }) => {
    // Navigate to Inventory
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    // Ensure we are on Inventory page and button is visible
    await expect(page.getByTestId('add-product-button')).toBeVisible({ timeout: 10000 });

    // 1. Create a product via the UI
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    const initialName = 'Persistence Test Product';
    const initialQty = '10';
    const initialPrice = '100';

    await page.getByTestId('product-name-input').fill(initialName);
    await page.getByTestId('product-quantity-input').fill(initialQty);
    await page.getByTestId('product-price-input').fill(initialPrice);
    await page.getByTestId('product-cost-input').fill('50');
    await page.getByTestId('save-product-button').click();

    // Verify creation
    await expect(page.locator(`text=${initialName}`).first()).toBeVisible({ timeout: 15000 });

    const productId = await page.evaluate((name) => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.find((item: any) => item.name === name)?.id;
    }, initialName);
    expect(productId).toBeTruthy();

    // 2. Edit the product (change price, name, and quantity)
    const updatedName = 'Updated Persistence Product';
    const updatedQty = '50';
    const updatedPrice = '250';

    await page.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    await page.getByTestId('product-name-input').fill(updatedName);
    await page.getByTestId('product-quantity-input').fill(updatedQty);
    await page.getByTestId('product-price-input').fill(updatedPrice);
    await page.getByTestId('save-product-button').click();

    // Wait for save to complete and modal to disappear
    await expect(page.getByTestId('product-form')).not.toBeVisible();
    await expect(page.locator(`text=${updatedName}`).first()).toBeVisible();

    // 3. Reload the page
    await page.reload();
    await dismissModals(page);

    // Check if we need to navigate back to inventory
    if (!(await page.getByTestId('add-product-button').isVisible())) {
      await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
      await dismissModals(page);
    }
    await expect(page.getByTestId('add-product-button')).toBeVisible({ timeout: 10000 });

    // 4. Verify the edited values persist
    await expect(page.locator(`text=${updatedName}`).first()).toBeVisible({ timeout: 15000 });

    await expect
      .poll(
        async () =>
          page.evaluate((id) => {
            const state = (window as any).__shelfAppStateForTest;
            const product = state?.products?.find((item: any) => item.id === id);
            return product
              ? { name: product.name, quantity: String(product.quantity), price: String(product.price) }
              : null;
          }, productId),
        { timeout: 15000 },
      )
      .toEqual({
        name: updatedName,
        quantity: updatedQty,
        price: updatedPrice,
      });
  });
});
