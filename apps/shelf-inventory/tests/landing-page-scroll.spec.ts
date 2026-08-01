import { expect, test } from '@playwright/test';

test.describe('Landing Page PC Scroll Verification', () => {
  test.skip(true, 'Landing page is bypassed in test mode (VITE_SKIP_LANDING=true) — heading "Tu Inventario." never renders');
  test.use({
    viewport: { width: 1280, height: 720 },
  });

  test('landing page should have vertical scroll and be scrollable on PC viewport', async ({ page }) => {
    // Clear localStorage to ensure we see the Landing Page
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.removeItem('hasVisited');
    });

    await page.goto('/');

    // Wait for Landing Page heading to be visible
    const heading = page.locator('h2:has-text("Tu Inventario.")');
    await expect(heading).toBeVisible();

    // Inspect scroll metrics and styles
    const metrics = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const root = document.getElementById('root');

      return {
        htmlScrollHeight: html.scrollHeight,
        htmlClientHeight: html.clientHeight,
        htmlOverflowX: window.getComputedStyle(html).overflowX,
        htmlOverflowY: window.getComputedStyle(html).overflowY,
        bodyScrollHeight: body.scrollHeight,
        bodyClientHeight: body.clientHeight,
        bodyOverflowX: window.getComputedStyle(body).overflowX,
        bodyOverflowY: window.getComputedStyle(body).overflowY,
        rootScrollHeight: root ? root.scrollHeight : 0,
        rootClientHeight: root ? root.clientHeight : 0,
        rootOverflowY: root ? window.getComputedStyle(root).overflowY : 'N/A',
        initialScrollY: window.scrollY,
      };
    });

    console.log('--- PC Landing Page Scroll Metrics ---', JSON.stringify(metrics, null, 2));

    // Try scrolling down
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(300);

    const scrolledY = await page.evaluate(() => window.scrollY);
    console.log('--- Scrolled Y ---', scrolledY);

    // Also check if mouse wheel scrolls
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(300);
    const wheelY = await page.evaluate(() => window.scrollY);
    console.log('--- Wheel Scrolled Y ---', wheelY);

    // Verify that the page is taller than viewport and scrolling worked
    expect(metrics.htmlScrollHeight).toBeGreaterThan(metrics.htmlClientHeight);
    expect(wheelY).toBeGreaterThan(0);
  });
});
