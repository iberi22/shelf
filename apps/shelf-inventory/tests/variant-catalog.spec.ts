import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Variant Catalog (SRC-FUN-001)', () => {
  test.setTimeout(90000);

  test('products with variants are listed and filterable by variant attribute values', async ({ page }) => {
    await setupPage(page);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    // Create a product with 2 colors x 2 measures using multi-variant creation
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();
    await page.getByTestId('product-name-input').fill('Catalog Variant Product');
    await page.getByTestId('product-sku-input').fill('CVP-001');
    await page.getByTestId('product-price-input').fill('120');
    await page.getByTestId('product-cost-input').fill('60');

    await page.getByTestId('mc-color-Rojo').click();
    await page.getByTestId('mc-color-Verde').click();
    await page.getByTestId('mc-measure-20CM').click();
    await page.getByTestId('mc-measure-28CM').click();

    const comboCards = page.locator('[data-testid^="combo-card-"]');
    await expect(comboCards).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await comboCards.nth(i).locator('input').first().fill('3');
    }

    await page.getByTestId('save-product-button').click();
    await expect(page.locator('text=Catalog Variant Product').first()).toBeVisible({ timeout: 10000 });

    // The product persists 4 variants with their attribute combinations
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const state = (window as any).__shelfAppStateForTest;
          const product = state?.products?.find((item: any) => item.name === 'Catalog Variant Product');
          if (!product) return null;
          return {
            variantCount: product.variants?.length ?? 0,
            quantity: Number(product.quantity),
            labels: product.variantAttributes ?? [],
          };
        }),
      )
      .toEqual({ variantCount: 4, quantity: 12, labels: ['Color', 'Medida'] });

    // Search matches variant attribute values (color)
    await page.getByTestId('inventory-search-input').fill('Verde');
    await expect(page.getByTestId('inventory-table').first()).toContainText('Catalog Variant Product', {
      timeout: 5000,
    });

    // Search matches variant attribute values (measure)
    await page.getByTestId('inventory-search-input').fill('28CM');
    await expect(page.getByTestId('inventory-table').first()).toContainText('Catalog Variant Product', {
      timeout: 5000,
    });

    // A non-matching query removes it from the list
    await page.getByTestId('inventory-search-input').fill('valor-que-no-existe');
    await expect(page.getByTestId('inventory-table').first()).not.toContainText('Catalog Variant Product', {
      timeout: 5000,
    });
  });
});
