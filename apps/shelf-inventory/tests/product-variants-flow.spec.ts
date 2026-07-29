import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

const PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const readProduct = (page: any, name: string) =>
  page.evaluate((productName: string) => {
    const state = (window as any).__shelfAppStateForTest;
    const product = state?.products?.find((item: any) => item.name === productName && item.isActive !== false);
    if (!product) return null;
    return {
      variantCount: product.variants?.length ?? 0,
      labels: product.variantAttributes ?? [],
      quantity: Number(product.quantity),
      hasImage: Boolean(product.imageUrl?.startsWith('data:image')),
      colors: [...new Set((product.variants ?? []).map((v: any) => v.attributes?.Color))].sort(),
      measures: [...new Set((product.variants ?? []).map((v: any) => v.attributes?.Medida))].sort(),
      versions: [...new Set((product.variants ?? []).map((v: any) => v.attributes?.Versión))].sort(),
    };
  }, name);

test.describe('Product variants flow (SRC-FUN-001)', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
  });

  test('creates a product with image + colors x measures x versions and persists after reload', async ({ page }) => {
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    await page.getByTestId('product-name-input').fill('Variant Flow Product');
    await page.getByTestId('product-sku-input').fill('VFP-001');
    await page.getByTestId('product-price-input').fill('200');
    await page.getByTestId('product-cost-input').fill('90');

    // Upload an image from the edit panel
    await page.getByTestId('product-image-input').setInputFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PIXEL_PNG_BASE64, 'base64'),
    });
    await expect(page.locator('[data-testid="product-form"] img[src^="data:image"]')).toBeVisible({ timeout: 10000 });

    // Pick 2 colors and 2 measures from the configured catalogs
    await page.getByTestId('mc-color-Rojo').click();
    await page.getByTestId('mc-color-Azul').click();
    await page.getByTestId('mc-measure-20CM').click();
    await page.getByTestId('mc-measure-28CM').click();

    // Add 2 versions/models packed with the product
    await page.getByTestId('version-custom-input').fill('V1');
    await page.getByTestId('version-add-button').click();
    await page.getByTestId('version-custom-input').fill('V2');
    await page.getByTestId('version-add-button').click();
    await expect(page.getByTestId('version-chip-V1')).toBeVisible();
    await expect(page.getByTestId('version-chip-V2')).toBeVisible();

    // The combination grid renders 2 x 2 x 2 = 8 variants; give each one stock
    const comboCards = page.locator('[data-testid^="combo-card-"]');
    await expect(comboCards).toHaveCount(8);
    await expect(page.getByTestId('combo-card-Rojo / 20CM / V1')).toBeVisible();
    await expect(page.getByTestId('combo-card-Azul / 28CM / V2')).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await comboCards.nth(i).locator('input').first().fill('2');
    }

    await page.getByTestId('save-product-button').click();
    await expect(page.locator('text=Variant Flow Product').first()).toBeVisible({ timeout: 10000 });

    const expected = {
      variantCount: 8,
      labels: ['Color', 'Medida', 'Versión'],
      quantity: 16,
      hasImage: true,
      colors: ['Azul', 'Rojo'],
      measures: ['20CM', '28CM'],
      versions: ['V1', 'V2'],
    };

    await expect.poll(() => readProduct(page, 'Variant Flow Product')).toEqual(expected);

    // Reload: variants, image and packaged attributes survive
    await page.reload();
    await page.waitForTimeout(1500);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
    await expect(page.locator('text=Variant Flow Product').first()).toBeVisible({ timeout: 15000 });
    await expect.poll(() => readProduct(page, 'Variant Flow Product'), { timeout: 20000 }).toEqual(expected);
  });

  test('saves a pasted image on the product and keeps it after reload', async ({ page }) => {
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    await page.getByTestId('product-name-input').fill('Paste Image Product');
    await page.getByTestId('product-quantity-input').fill('5');
    await page.getByTestId('product-price-input').fill('10');
    await page.getByTestId('product-cost-input').fill('4');

    await page.getByTestId('product-form').evaluate((form, base64) => {
      const byteString = atob(base64);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      const file = new File([bytes], 'paste.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      form.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }));
    }, PIXEL_PNG_BASE64);

    await expect(page.locator('[data-testid="product-form"] img[src^="data:image"]')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('save-product-button').click();
    await expect(page.locator('text=Paste Image Product').first()).toBeVisible({ timeout: 10000 });

    const readImageFlag = () =>
      page.evaluate(() => {
        const state = (window as any).__shelfAppStateForTest;
        const product = state?.products?.find((item: any) => item.name === 'Paste Image Product');
        return Boolean(product?.imageUrl?.startsWith('data:image'));
      });

    await expect.poll(readImageFlag).toBe(true);

    await page.reload();
    await page.waitForTimeout(1500);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
    await expect.poll(readImageFlag, { timeout: 20000 }).toBe(true);
  });
});
