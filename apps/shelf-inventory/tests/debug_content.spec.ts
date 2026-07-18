import { test } from '@playwright/test';

test('debug page content', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(5000);
  const content = await page.content();
  console.log('Page content:', content);

  const loading = await page.locator('text=Loading...').isVisible();
  console.log('Is loading visible?', loading);

  const navInventory = await page.locator('[data-testid="nav-item-nav.inventory"]').isVisible();
  console.log('Is nav inventory visible?', navInventory);
});
