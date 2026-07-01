import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Persistence after reload', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should persist created product after page reload', async ({ page }) => {
    const productName = `Persistence Test Product ${Date.now()}`;

    // Navigate to Inventory
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
    await page.screenshot({ path: 'tests/screenshots/inventory-page.png' });

    // --- CREATE ---
    // The "add-product-button" should be available if we have products or not
    const addBtn = page.getByTestId('add-product-button').first();
    await expect(addBtn).toBeVisible({ timeout: 15000 });
    await addBtn.click();

    // Wait for the form to be visible (it's inside a Modal)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/screenshots/after-add-click.png' });
    await expect(page.getByTestId('product-form')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('product-name-input').fill(productName);
    await page.getByTestId('product-quantity-input').fill('10');
    await page.getByTestId('product-price-input').fill('100');
    await page.getByTestId('product-cost-input').fill('50');
    await page.getByTestId('save-product-button').click();

    // Verify it appeared before reload
    await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 15000 });

    // --- RELOAD ---
    await page.reload();
    // After reload, we might need to wait for the app to initialize
    await page.waitForTimeout(3000);
    await dismissModals(page);

    // Re-navigate to inventory as reload might land on the dashboard/root
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    // Verify it still appears
    await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 15000 });
  });
});
