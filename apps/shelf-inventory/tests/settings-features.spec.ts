import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Settings Features', () => {
  test('should add and edit a branch', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`Browser Error: ${msg.text()}`);
      }
    });
    await setupPage(page);
    await dismissModals(page);

    // Navigate to settings (use force in case of overlays or icons)
    await page.getByTestId('nav-item-nav.settings').last().click();

    // Click add branch button
    await page.getByTestId('add-branch-button').click();

    // Fill the branch form
    await page.getByTestId('branch-name-input').fill('Sucursal Norte');
    await page.getByTestId('branch-address-input').fill('Avenida Principal 123');
    await page.getByTestId('branch-type-select').selectOption('sucursal');

    // Save branch
    await page.getByTestId('save-branch-button').click();

    // Verify it appears in the list table
    try {
      await expect(page.locator('td').filter({ hasText: 'Sucursal Norte' }).first()).toBeVisible({ timeout: 5000 });
    } catch (e) {
      console.error(await page.innerHTML('body'));
      throw e;
    }
  });

  test('should modify general settings', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);

    await page.getByTestId('nav-item-nav.settings').last().click();

    const lowStockInput = page.getByTestId('low-stock-input');
    await lowStockInput.fill('15');

    const pageSizeInput = page.getByTestId('table-page-size-input');
    await pageSizeInput.fill('25');

    // Navigate away and back to check persistence
    await page.getByTestId('nav-item-nav.inventory').first().click();
    await page.getByTestId('nav-item-nav.settings').last().click();

    await expect(lowStockInput).toHaveValue('15');
    await expect(pageSizeInput).toHaveValue('25');
  });
});
