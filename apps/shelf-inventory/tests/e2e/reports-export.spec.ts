import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from '../helpers';

test.describe('E2E: Reports PDF Export', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('should trigger PDF download for Inventory Valuation and Low Stock reports', async ({ page }) => {
    // 1. Create a product so we have data to export
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    await page.getByTestId('add-product-button').click();
    const productName = `Test Product ${Date.now()}`;
    await page.getByTestId('product-name-input').fill(productName);
    await page.getByTestId('product-quantity-input').fill('5');
    await page.getByTestId('product-price-input').fill('100');
    await page.getByTestId('product-cost-input').fill('50');
    await page.getByTestId('save-product-button').click();
    await expect(page.locator(`text=${productName}`).first()).toBeVisible();

    // 2. Navigate to Reports
    await page.locator('[data-testid="nav-item-nav.reports"]').last().click();
    await dismissModals(page);

    // 3. Verify PDF Export buttons are present (User is pro by default in SubscriptionContext)
    const valuationBtn = page.getByTestId('export-inventory-valuation-pdf');
    const lowStockBtn = page.getByTestId('export-low-stock-pdf');

    await expect(valuationBtn).toBeVisible();
    await expect(lowStockBtn).toBeVisible();

    // 4. Test Inventory Valuation Export
    const valuationDownloadPromise = page.waitForEvent('download');
    await valuationBtn.click();
    const valuationDownload = await valuationDownloadPromise;
    expect(valuationDownload.suggestedFilename()).toContain('inventory_valuation');
    expect(valuationDownload.suggestedFilename().endsWith('.pdf')).toBe(true);

    // 5. Test Low Stock Export
    const lowStockDownloadPromise = page.waitForEvent('download');
    await lowStockBtn.click();
    const lowStockDownload = await lowStockDownloadPromise;
    expect(lowStockDownload.suggestedFilename()).toContain('low_stock_report');
    expect(lowStockDownload.suggestedFilename().endsWith('.pdf')).toBe(true);
  });
});
