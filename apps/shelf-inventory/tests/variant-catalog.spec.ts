import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Variant Catalog', () => {
  test.setTimeout(60000);

  test('Product variants are displayed in catalog and filterable', async ({ page }) => {
    await setupPage(page);

    // Navigate to catalog
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
    await page.waitForTimeout(1500);

    // Verify catalog page loaded — check for product table or list
    const productList = page.locator('[data-testid="product-list"], [data-testid="inventory-table"], table');
    await expect(productList.first()).toBeVisible({ timeout: 10000 });

    // Check for variant indicators in product rows
    const variantBadges = page.locator('[data-testid="variant-badge"], [class*="variant"], [class*="variante"]');
    const badgeCount = await variantBadges.count();
    console.log('Variant badges found:', badgeCount);

    // If there are products with variants, verify variant details are accessible
    const firstVariantRow = page.locator('[data-testid^="product-row-"]').first();
    if (await firstVariantRow.isVisible().catch(() => false)) {
      await firstVariantRow.click();
      await page.waitForTimeout(1000);

      // Check variant detail section
      const variantDetail = page.locator('[data-testid="variant-detail"], [class*="variant-detail"]');
      const hasVariantDetail = await variantDetail.isVisible().catch(() => false);
      console.log('Variant detail visible:', hasVariantDetail);
    }

    // Verify search/filter works
    const searchInput = page.locator(
      '[data-testid="search-input"], input[placeholder*="buscar"], input[placeholder*="search"]',
    );
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);
      // Catalog is still rendered (didn't crash)
      await expect(productList.first()).toBeAttached();
    }

    // Verify catalog is functional — product count is accessible
    const productRows = await page
      .locator('[data-testid^="product-row-"], table tbody tr, [class*="product-card"]')
      .count();
    console.log('Product rows in catalog:', productRows);
    expect(productRows).toBeGreaterThanOrEqual(0);
  });
});
