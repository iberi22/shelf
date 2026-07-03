import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from '../helpers';

test.describe('E2E: Product edit persists after page reload', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('product edit persists after page reload and no duplicates created', async ({ page }) => {
    // Navigate to Inventory
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    // Get initial product count
    const initialProductCount = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.filter((p: any) => p.isActive !== false).length || 0;
    });

    // --- CREATE ---
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    const name = `Product ${Date.now()}`;
    const qty = '10';
    const price = '100';

    await page.getByTestId('product-name-input').fill(name);
    await page.getByTestId('product-quantity-input').fill(qty);
    await page.getByTestId('product-price-input').fill(price);
    await page.getByTestId('product-cost-input').fill('50'); // Add cost to satisfy form
    await page.getByTestId('save-product-button').click();

    // Verify creation
    await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 15000 });

    const productId = await page.evaluate((n) => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.find((p: any) => p.name === n && p.isActive !== false)?.id;
    }, name);
    expect(productId).toBeTruthy();

    // --- EDIT ---
    const updatedName = `${name} (Edited)`;
    const updatedPrice = '150';

    await page.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    await page.getByTestId('product-name-input').fill(updatedName);
    await page.getByTestId('product-price-input').fill(updatedPrice);
    await page.getByTestId('save-product-button').click();

    // Wait for modal to close and name to update
    await expect(page.getByTestId('product-form')).not.toBeVisible();
    await expect(page.locator(`text=${updatedName}`).first()).toBeVisible();

    // --- RELOAD ---
    await page.reload();
    await dismissModals(page);

    // Re-navigate to inventory
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    // --- ASSERT PERSISTENCE ---
    await expect(page.locator(`text=${updatedName}`).first()).toBeVisible({ timeout: 10000 });

    await expect.poll(async () =>
      page.evaluate((id) => {
        const state = (window as any).__shelfAppStateForTest;
        const product = state?.products?.find((p: any) => p.id === id);
        return product ? { name: product.name, price: String(product.price) } : null;
      }, productId)
    ).toEqual({
      name: updatedName,
      price: updatedPrice
    });

    // --- ASSERT NO DUPLICATES ---
    const finalProductCount = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.filter((p: any) => p.isActive !== false).length;
    });

    expect(finalProductCount).toBe(initialProductCount + 1);
  });
});
