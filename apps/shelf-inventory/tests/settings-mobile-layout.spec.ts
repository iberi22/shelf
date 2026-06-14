import { expect, test } from '@playwright/test';
import { setupPage } from './helpers';

test.describe('Settings mobile layout', () => {
  test('Settings cards stay within the mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupPage(page);

    await page.locator('[data-testid="mobile-nav-item-nav.settings"]').click();
    await page.waitForTimeout(800);

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText(/Aplicar actualizaciones automáticamente/i)).toBeVisible();

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

    const p2pHeading = page.getByRole('heading', { name: /Secure P2P Sync/i }).first();
    const p2pCard = p2pHeading.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    const box = await p2pCard.boundingBox();

    expect(box).not.toBeNull();
    expect(box?.x ?? 0).toBeGreaterThanOrEqual(0);
    expect(box?.width ?? 0).toBeLessThanOrEqual(390);
  });
});
