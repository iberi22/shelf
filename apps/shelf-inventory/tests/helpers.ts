import type { BrowserContext, Page } from '@playwright/test';

/**
 * The init script that sets localStorage flags and periodically removes overlays.
 * Used by addOverlayBlocker (via addInitScript) and can be evaluated directly.
 */
export const overlayBlockerCode = `
  localStorage.setItem('hasVisited', 'true');
  localStorage.setItem('shelfWelcomeSeen', 'true');
  setInterval(() => {
    document.querySelectorAll('.fixed.inset-0').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.display = 'none';
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }, 100);
`;

/**
 * Add init script to a context that sets localStorage flags and periodically
 * removes any fixed full-screen overlays (modals, loading screens).
 * NOTE: addInitScript only works for PAGES CREATED AFTER calling it.
 * If using the `page` fixture directly, call setupPage() instead.
 */
export function addOverlayBlocker(context: BrowserContext): void {
  context.addInitScript(overlayBlockerCode);
}

/**
 * Set localStorage flags and dismiss overlays on an already-open page.
 * Use this in beforeEach when using the `page` fixture.
 */
export async function setupPage(page: Page): Promise<void> {
  // Ensure the flags exist before the first app navigation.
  await page.addInitScript(() => {
    localStorage.setItem('hasVisited', 'true');
    localStorage.setItem('shelfWelcomeSeen', 'true');
  });
  await page.goto('/');
  await page.waitForTimeout(2000);
  // Dismiss any overlays that may still appear
  await dismissModals(page);
}

/**
 * Dismiss all overlay modals on the page immediately.
 */
export async function dismissModals(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      document.querySelectorAll('.fixed.inset-0').forEach((el) => {
        el.remove();
      });
    })
    .catch(() => {});
  await page.waitForTimeout(200);
}
