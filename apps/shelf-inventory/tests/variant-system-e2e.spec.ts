import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

const readProduct = (page: any, name: string) =>
  page.evaluate((productName: string) => {
    const state = (window as any).__shelfAppStateForTest;
    const product = state?.products?.find((item: any) => item.name === productName && item.isActive !== false);
    if (!product) return null;
    return {
      variantCount: product.variants?.length ?? 0,
      labels: product.variantAttributes ?? [],
      quantity: Number(product.quantity),
      colors: [...new Set((product.variants ?? []).map((v: any) => v.attributes?.Color))].sort(),
      measures: [...new Set((product.variants ?? []).map((v: any) => v.attributes?.Medida))].sort(),
      materials: [...new Set((product.variants ?? []).map((v: any) => v.attributes?.Material))].sort(),
    };
  }, name);

const getVariantRowLocator = (page: any, index: number) => {
  return page.locator('[data-testid="product-form"] div.rounded-xl[class*="bg-[#121212]"]').nth(index - 1);
};

test.describe('Variant System — Full E2E Coverage', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    // Clear localStorage and setup the page in a clean state
    await page.goto('about:blank');
    await setupPage(page);
    await page.evaluate(() => localStorage.clear());
    await setupPage(page);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
  });

  test('Material selection: selecting preset materials adds them as green chips', async ({ page }) => {
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    // Select "Plástico" and "Cemento"
    await page.getByTestId('mc-material-Plástico').click();
    await page.getByTestId('mc-material-Cemento').click();

    // Verify chips are added in green color text theme
    const plasticoChip = page.locator('span[class*="text-[#22C55E]"]', { hasText: /^Plástico$/ });
    const cementoChip = page.locator('span[class*="text-[#22C55E]"]', { hasText: /^Cemento$/ });
    await expect(plasticoChip).toBeVisible();
    await expect(cementoChip).toBeVisible();
  });

  test('Combo grid: 2 colors x 2 measures x 2 materials generates exactly 8 combinations', async ({ page }) => {
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    // Select 2 colors
    await page.getByTestId('mc-color-Rojo').click();
    await page.getByTestId('mc-color-Azul').click();

    // Select 2 measures
    await page.getByTestId('mc-measure-20CM').click();
    await page.getByTestId('mc-measure-28CM').click();

    // Select 2 materials
    await page.getByTestId('mc-material-Plástico').click();
    await page.getByTestId('mc-material-Cemento').click();

    // Verify exactly 8 combination cards exist
    const comboCards = page.locator('[data-testid^="combo-card-"]');
    await expect(comboCards).toHaveCount(8);

    // Summary line shows correct combination count
    await expect(page.locator('span', { hasText: '2 color(es) x 2 medida(s) = 8 combinaciones' })).toBeVisible();
  });

  test('Combo labels show "Color / Medida / Material" format', async ({ page }) => {
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    // Select 2 colors, 1 measure, 1 material to ensure isMultiMode is true
    await page.getByTestId('mc-color-Rojo').click();
    await page.getByTestId('mc-color-Azul').click();
    await page.getByTestId('mc-measure-20CM').click();
    await page.getByTestId('mc-material-Plástico').click();

    // The combination label should be "Rojo / 20CM / Plástico"
    await expect(page.getByTestId('combo-card-Rojo / 20CM / Plástico')).toBeVisible();
  });

  test('Combo card inputs: qty, price, and cost values are entered and persisted in the form', async ({ page }) => {
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    // Select 2 colors, 1 measure, 1 material to ensure isMultiMode is true
    await page.getByTestId('mc-color-Rojo').click();
    await page.getByTestId('mc-color-Azul').click();
    await page.getByTestId('mc-measure-20CM').click();
    await page.getByTestId('mc-material-Plástico').click();

    const card = page.getByTestId('combo-card-Rojo / 20CM / Plástico');
    await expect(card).toBeVisible();

    // Fill quantities, prices, and costs
    await card.locator('input').nth(0).fill('15');
    await card.locator('input').nth(1).fill('299.99');
    await card.locator('input').nth(2).fill('120.50');

    // Assert values are held correctly in the form inputs
    await expect(card.locator('input').nth(0)).toHaveValue('15');
    await expect(card.locator('input').nth(1)).toHaveValue('299.99');
    await expect(card.locator('input').nth(2)).toHaveValue('120.50');
  });

  test('Save creates correct number of variants on the saved product', async ({ page }) => {
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    await page.getByTestId('product-name-input').fill('Save Variant Product E2E');
    await page.getByTestId('product-sku-input').fill('SVP-E2E-001');

    await page.getByTestId('mc-color-Rojo').click();
    await page.getByTestId('mc-color-Azul').click();
    await page.getByTestId('mc-measure-20CM').click();
    await page.getByTestId('mc-measure-28CM').click();
    await page.getByTestId('mc-material-Plástico').click();
    await page.getByTestId('mc-material-Cemento').click();

    const comboCards = page.locator('[data-testid^="combo-card-"]');
    await expect(comboCards).toHaveCount(8);

    // Set stock to 3 for all combos
    for (let i = 0; i < 8; i++) {
      await comboCards.nth(i).locator('input').nth(0).fill('3');
      await comboCards.nth(i).locator('input').nth(1).fill('100');
      await comboCards.nth(i).locator('input').nth(2).fill('50');
    }

    await page.getByTestId('save-product-button').click();
    await expect(page.locator('text=Save Variant Product E2E').first()).toBeVisible({ timeout: 15000 });

    const expected = {
      variantCount: 8,
      labels: ['Color', 'Medida', 'Material'],
      quantity: 24,
      colors: ['Azul', 'Rojo'],
      measures: ['20CM', '28CM'],
      materials: ['Cemento', 'Plástico'],
    };

    await expect.poll(() => readProduct(page, 'Save Variant Product E2E')).toEqual(expected);

    // Variant display shows 'Color | Medida | Material' format
    await expect(page.locator('text=Rojo | 20CM | Plástico').first()).toBeVisible();
  });

  test('Edit product preserves previously saved material selections', async ({ page }) => {
    // Navigate and add product
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    await page.getByTestId('product-name-input').fill('Preserved Product');
    await page.getByTestId('product-sku-input').fill('PPD-01');

    await page.getByTestId('mc-color-Rojo').click();
    await page.getByTestId('mc-material-Plástico').click();
    await page.getByTestId('mc-material-Cemento').click();

    const comboCards = page.locator('[data-testid^="combo-card-"]');
    await expect(comboCards).toHaveCount(2);

    for (let i = 0; i < 2; i++) {
      await comboCards.nth(i).locator('input').nth(0).fill('5');
      await comboCards.nth(i).locator('input').nth(1).fill('80');
      await comboCards.nth(i).locator('input').nth(2).fill('40');
    }

    await page.getByTestId('save-product-button').click();
    await expect(page.locator('text=Preserved Product').first()).toBeVisible({ timeout: 15000 });

    const productId = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.find((item: any) => item.name === 'Preserved Product' && item.isActive !== false)?.id;
    });
    expect(productId).toBeTruthy();

    // Click edit
    await page.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    // Verify material selections are preserved
    const selected = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      const product = state?.products?.find((item: any) => item.name === 'Preserved Product');
      return product?.materials;
    });
    expect(selected).toContain('Plástico');
    expect(selected).toContain('Cemento');

    const logInfo = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="product-form"] div');
      return Array.from(cards)
        .filter((c) => c.className?.includes('bg-[#121212]'))
        .map((card, idx) => `CARD ${idx}: class="${card.className}" text="${card.textContent?.slice(0, 100)}"`)
        .join('\n');
    });
    console.log('LOG INFO:\n', logInfo);

    // Check highlights inside variant rows
    const row1 = getVariantRowLocator(page, 1);
    const plasticoBtn = row1.locator('button', { hasText: 'Plástico' });
    await expect(plasticoBtn).toHaveClass(/22C55E/);
  });

  test('Custom material input: adding a custom material like "Fibra de vidrio" creates a chip', async ({ page }) => {
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    const input = page.getByPlaceholder('Material personalizado (ej. Fibra de vidrio)');
    await input.fill('Fibra de vidrio');
    await input.press('Enter');

    // Verify chip containing "Fibra de vidrio" is visible
    const chip = page.locator('span[class*="text-[#22C55E]"]', { hasText: /^Fibra de vidrio$/ });
    await expect(chip).toBeVisible();
  });

  test('Remove material: deselecting a material reduces the combination count', async ({ page }) => {
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    await page.getByTestId('mc-color-Rojo').click();
    await page.getByTestId('mc-color-Azul').click();
    await page.getByTestId('mc-material-Plástico').click();
    await page.getByTestId('mc-material-Cemento').click();

    // Count is 4 (2 colors x 2 materials)
    await expect(page.locator('[data-testid^="combo-card-"]')).toHaveCount(4);

    // Deselect Plástico
    await page.getByTestId('mc-material-Plástico').click();

    // Count should decrease to 2 (2 colors x 1 material)
    await expect(page.locator('[data-testid^="combo-card-"]')).toHaveCount(2);
  });

  test('Variant row material chip selector: isMaterialAttribute is active on manual rows', async ({ page }) => {
    // Create a product without variants
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    await page.getByTestId('product-name-input').fill('Manual Row Product');
    await page.getByTestId('product-sku-input').fill('MRP-001');
    await page.getByTestId('product-quantity-input').fill('10');
    await page.getByTestId('product-price-input').fill('50');
    await page.getByTestId('product-cost-input').fill('25');
    await page.getByTestId('save-product-button').click();

    await expect(page.locator('text=Manual Row Product').first()).toBeVisible({ timeout: 15000 });

    const productId = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.find((item: any) => item.name === 'Manual Row Product' && item.isActive !== false)?.id;
    });
    expect(productId).toBeTruthy();

    // Edit and convert to variants
    await page.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    await page.getByText('Con variantes').click();

    // Locating the variant row "Material" block
    const variantRow = getVariantRowLocator(page, 1);
    const input = variantRow.getByPlaceholder('Valor de material');
    const materialBlock = variantRow.locator('div').filter({ has: input }).first();
    const metalBtn = materialBlock.locator('button', { hasText: 'Metal' });

    await metalBtn.click();
    await expect(input).toHaveValue('Metal');
  });

  test('Delete variant with material updates counts and summary correctly', async ({ page }) => {
    // Add product
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    await page.getByTestId('product-name-input').fill('Delete Variant Test Product');
    await page.getByTestId('product-sku-input').fill('DVTP-01');

    await page.getByTestId('mc-color-Rojo').click();
    await page.getByTestId('mc-material-Plástico').click();
    await page.getByTestId('mc-material-Cemento').click();

    const comboCards = page.locator('[data-testid^="combo-card-"]');
    await expect(comboCards).toHaveCount(2);

    for (let i = 0; i < 2; i++) {
      await comboCards.nth(i).locator('input').nth(0).fill('6');
      await comboCards.nth(i).locator('input').nth(1).fill('90');
      await comboCards.nth(i).locator('input').nth(2).fill('45');
    }

    await page.getByTestId('save-product-button').click();
    await expect(page.locator('text=Delete Variant Test Product').first()).toBeVisible({ timeout: 15000 });

    const productId = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.find(
        (item: any) => item.name === 'Delete Variant Test Product' && item.isActive !== false,
      )?.id;
    });
    expect(productId).toBeTruthy();

    // Edit and remove Variant 1
    await page.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    const row1 = getVariantRowLocator(page, 1);
    await row1.locator('button', { hasText: 'Quitar' }).click();

    await page.getByTestId('save-product-button').click();
    await page.waitForTimeout(1000);

    // Verify correct count and attributes on saved state
    const expected = {
      variantCount: 1,
      labels: ['Color', 'Material'],
      quantity: 6,
      colors: ['Rojo'],
      measures: [],
      materials: ['Cemento'],
    };

    await expect.poll(() => readProduct(page, 'Delete Variant Test Product')).toEqual(expected);
  });
});
