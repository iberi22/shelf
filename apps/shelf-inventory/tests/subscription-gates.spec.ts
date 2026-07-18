import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Subscription gates (SRC-FUN-009)', () => {
  test('free tier shows ads; pro tier hides ads', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupPage(page);
    await dismissModals(page);

    await page.getByTestId('nav-item-nav.settings').last().click();
    await expect(page.getByTestId('settings-plan-card')).toBeVisible({ timeout: 15000 });

    // Expand plan card if needed
    const freeBtn = page.getByTestId('set-tier-free');
    try {
      await freeBtn.click({ timeout: 3000 });
    } catch {
      await page.getByTestId('settings-plan-card').click();
      await freeBtn.click();
    }

    await expect(page.getByTestId('subscription-tier-value')).toHaveText('free', { timeout: 5000 });

    // Force layout recompute after tier change
    await page.evaluate(() => {
      localStorage.removeItem('shelf_demo_full_access');
    });
    await page.reload();
    await dismissModals(page);

    await expect(page.getByTestId('desktop-ad-column')).toBeVisible({ timeout: 15000 });

    // Pro hides ads
    await page.getByTestId('nav-item-nav.settings').last().click();
    try {
      await page.getByTestId('set-tier-pro').click({ timeout: 3000 });
    } catch {
      await page.getByTestId('settings-plan-card').click();
      await page.getByTestId('set-tier-pro').click();
    }
    await expect(page.getByTestId('subscription-tier-value')).toHaveText('pro');
    await page.reload();
    await dismissModals(page);

    await expect(page.getByTestId('desktop-ad-column')).toHaveCount(0);
  });
});
