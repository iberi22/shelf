import { test, expect } from '@playwright/test';

test.describe('Modals Visual Regression', () => {
  test('modals appear centered regardless of scroll', async ({ page }) => {
    await page.goto('/');

    // Ensure the page has enough content to scroll
    await page.evaluate(() => {
      const div = document.createElement('div');
      div.style.height = '3000px';
      document.body.appendChild(div);
      window.scrollTo(0, 1500);
    });

    // We look for a button that opens a modal
    // For example, if there's an 'Añadir Producto' button
    const openBtn = page.getByRole('button', { name: /añadir|nuevo|agregar/i }).first();

    if (await openBtn.isVisible()) {
      await openBtn.click();

      // Wait for modal animation to complete
      await page.waitForTimeout(500);

      // Capture full page screenshot to ensure it covers the viewport correctly
      await expect(page).toHaveScreenshot('modal-centered-with-scroll.png', {
        fullPage: false, // We only care about what's in the viewport!
        maxDiffPixelRatio: 0.05,
      });
    }
  });
});
