import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Inventory config catalogs (SRC-FUN-001)', () => {
  test.setTimeout(90000);

  test('colors and measures created in Settings become selectable in the product form', async ({ page }) => {
    await setupPage(page);
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);

    // CollapsibleCard auto-opens in test environments
    await expect(page.getByTestId('settings-articles-config-card')).toBeVisible({ timeout: 15000 });

    // Create a new suggested color from configuration
    const colorCount = await page.locator('[data-testid^="color-option-name-"]').count();
    await page.getByTestId('add-color-option').click();
    await page.getByTestId(`color-option-name-${colorCount}`).fill('CoralE2E');

    // Create a new suggested measure from configuration
    const measureCount = await page.locator('[data-testid^="measure-option-input-"]').count();
    await page.getByTestId('add-measure-option').click();
    await page.getByTestId(`measure-option-input-${measureCount}`).fill('33CM');

    await page.getByTestId('save-inventory-config').click();

    // The catalogs persist in the app state
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const state = (window as any).__shelfAppStateForTest;
          const colorNames = (state?.inventoryConfig?.colorOptions ?? []).map((option: any) => option.name);
          const measures = state?.inventoryConfig?.measureOptions ?? [];
          return { hasColor: colorNames.includes('CoralE2E'), hasMeasure: measures.includes('33CM') };
        }),
      )
      .toEqual({ hasColor: true, hasMeasure: true });

    // ... and are offered when packing variants into a product
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();
    await expect(page.getByTestId('mc-color-CoralE2E')).toBeVisible();
    await expect(page.getByTestId('mc-measure-33CM')).toBeVisible();
  });

  test('duplicate suggested colors are rejected on save', async ({ page }) => {
    await setupPage(page);
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);
    await expect(page.getByTestId('settings-articles-config-card')).toBeVisible({ timeout: 15000 });

    const colorCount = await page.locator('[data-testid^="color-option-name-"]').count();
    await page.getByTestId('add-color-option').click();
    await page.getByTestId(`color-option-name-${colorCount}`).fill('rojo');

    await page.getByTestId('save-inventory-config').click();
    await expect(page.locator('text=Hay colores sugeridos repetidos.')).toBeVisible({ timeout: 5000 });

    // The invalid catalog never reaches the app state
    const colorNames = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return (state?.inventoryConfig?.colorOptions ?? []).map((option: any) => option.name.toLowerCase());
    });
    expect(colorNames.filter((name: string) => name === 'rojo')).toHaveLength(1);
  });
});
