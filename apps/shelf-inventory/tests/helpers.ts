import type { BrowserContext, Page } from '@playwright/test';

/**
 * The init script that sets localStorage flags and periodically removes overlays.
 * Used by addOverlayBlocker (via addInitScript) and can be evaluated directly.
 */
export const overlayBlockerCode = `
  window.__E2E_TEST__ = true;
  localStorage.setItem('hasVisited', 'true');
  localStorage.setItem('shelfWelcomeSeen', 'true');
  // E2E: unlock pro/pyme gates without hardcoding SubscriptionContext
  localStorage.setItem('shelf_demo_full_access', 'true');
`;

/**
 * Add init script to a context that sets localStorage flags.
 */
export function addOverlayBlocker(context: BrowserContext): void {
  context.addInitScript(overlayBlockerCode);
}

/**
 * Set localStorage flags and dismiss overlays on an already-open page.
 */
export async function setupPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__E2E_TEST__ = true;
    localStorage.setItem('hasVisited', 'true');
    localStorage.setItem('shelfWelcomeSeen', 'true');
    localStorage.setItem('shelf_demo_full_access', 'true');
  });
  await page.goto('/');
  await page.waitForTimeout(1000);
}

/**
 * Safely dismiss any hanging loading spinners.
 */
export async function dismissModals(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      // Only remove the loading spinner if stuck, NOT our app modals!
      document.querySelectorAll('.z-\\[200\\]').forEach((el) => {
        el.remove();
      });
    })
    .catch(() => {});
  await page.waitForTimeout(100);
}
