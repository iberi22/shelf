import { expect, test } from '@playwright/test';
import { setupPage } from './helpers';

test.describe('Access and settings controls', () => {
  const openSettings = async (page: import('@playwright/test').Page) => {
    await page.getByTestId('nav-item-nav.settings').last().click();
  };

  test('language is only configured from settings and login is not shown', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Select language')).toHaveCount(0);
    await expect(page.getByTestId('login-button')).toHaveCount(0);

    await setupPage(page);
    await expect(page.getByLabel('Select language')).toHaveCount(0);
    await expect(page.getByTestId('login-button')).toHaveCount(0);
    await expect(page.getByTestId('logout-button')).toHaveCount(0);

    await openSettings(page);
    await expect(page.getByTestId('settings-language-selector').getByLabel('Select language')).toBeVisible();
    await expect(page.getByLabel('Select language')).toHaveCount(1);
  });

  test('local password lock protects inventory access', async ({ page }) => {
    await setupPage(page);

    await openSettings(page);
    await page.getByTestId('new-app-lock-input').fill('clave-local-1234');
    await page.getByTestId('enable-app-lock-button').click();

    await expect(page.getByTestId('app-lock-password-input')).toBeVisible();
    await page.getByTestId('app-lock-password-input').fill('clave-local-1234');
    await page.getByTestId('app-lock-password-input').press('Enter');

    await expect(page.getByTestId('nav-item-nav.inventory').last()).toBeVisible();
    await page.getByTestId('nav-item-nav.inventory').last().click();
    await expect(page.getByRole('heading', { name: /Inventory|Inventario/i })).toBeVisible();
  });
});
