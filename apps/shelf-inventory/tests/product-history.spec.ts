import { expect, test } from '@playwright/test';
import { setupPage } from './helpers';

test.describe('Product history', () => {
  test('keeps the previous product version and restores it', async ({ page }) => {
    const productName = `History Restore Product ${Date.now()}`;

    await setupPage(page);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();

    await page.getByTestId('add-product-button').click();
    await page.getByTestId('product-name-input').fill(productName);
    await page.getByTestId('product-quantity-input').fill('20');
    await page.getByTestId('product-price-input').fill('150');
    await page.getByTestId('product-cost-input').fill('75');
    await page.getByTestId('save-product-button').click();

    await expect(page.getByText(productName).first()).toBeVisible({ timeout: 5000 });
    await expect
      .poll(async () => {
        return page.evaluate((name) => {
          const state = (window as any).__shelfAppStateForTest;
          return state?.products?.find((item: any) => item.name === name)?.id;
        }, productName);
      })
      .toBeTruthy();
    const productId = await page.evaluate((name) => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.find((item: any) => item.name === name)?.id;
    }, productName);

    await page.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    if (
      !(await page
        .getByTestId('product-quantity-input')
        .isVisible()
        .catch(() => false))
    ) {
      await page.getByRole('button', { name: 'Articulo simple' }).click();
    }
    await page.getByTestId('product-quantity-input').fill('25');
    await page.getByTestId('save-product-button').click();

    await expect
      .poll(async () => {
        return page.evaluate((name) => {
          const state = (window as any).__shelfAppStateForTest;
          const product = state?.products?.find((item: any) => item.name === name);
          return product?.quantity;
        }, productName);
      })
      .toBe(25);

    await page.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(page.getByText(/Historial de cambios/i)).toBeVisible();
    await page
      .getByRole('button', { name: /Restaurar/i })
      .first()
      .click();

    await expect
      .poll(async () => {
        return page.evaluate((name) => {
          const state = (window as any).__shelfAppStateForTest;
          const product = state?.products?.find((item: any) => item.name === name);
          return product?.quantity;
        }, productName);
      })
      .toBe(20);
  });
});
