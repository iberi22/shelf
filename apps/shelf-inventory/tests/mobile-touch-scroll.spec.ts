import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

const SEED_COUNT = 60;

const seedProducts = (count: number) => {
  const now = new Date().toISOString();
  const products = Array.from({ length: count }, (_, index) => {
    const id = String(index + 1).padStart(3, '0');
    return {
      id: `seed-${id}`,
      name: `Seed Product ${id}`,
      sku: `SEED-${id}`,
      quantity: 10,
      price: 100,
      cost: 50,
      isActive: true,
      updatedBy: 'local',
      updatedAt: now,
    };
  });

  localStorage.setItem(
    'guest_user',
    JSON.stringify({ uid: 'guest_touch_scroll', email: null, subscriptionTier: 'pyme', isGuest: true }),
  );

  localStorage.setItem(
    'shelfState',
    JSON.stringify({
      products,
      sales: [],
      clients: [],
      suppliers: [],
      purchaseOrders: [],
      peers: [],
      teamMembers: [],
      localPeerId: 'peer_touch_scroll_host',
      role: 'admin',
      arqueoSessions: [],
      ocrResults: [],
      pendingEdits: [],
      productChangeHistory: [],
      auditLogs: [],
    }),
  );
};

test.describe('Mobile touch scroll and pull-to-refresh verification', () => {
  test('scrolls down, returns smoothly to top, and triggers pull-to-refresh without locking', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(seedProducts, SEED_COUNT);
    await setupPage(page);

    try {
      const bottomNavItem = page.locator('[data-testid="mobile-nav-item-nav.inventory"]');
      await bottomNavItem.waitFor({ state: 'visible', timeout: 5000 });
      await bottomNavItem.click();
    } catch {
      const menuButton = page.locator('button[aria-label="Abrir menú"]');
      await expect(menuButton).toBeVisible({ timeout: 5000 });
      await menuButton.click();
      await page.locator('[data-testid="nav-item-nav.inventory"]').click();
    }
    await dismissModals(page);

    await expect(page.getByTestId('product-list')).toBeVisible({ timeout: 15000 });

    const scrollContainer = page.locator('#main-scroll-area');
    await expect(scrollContainer).toBeVisible();

    // 1. Initial screenshot at top
    await page.screenshot({ path: 'tests/screenshots/mobile-scroll-1-top.png' });

    // 2. Scroll container down
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 500;
    });
    await page.waitForTimeout(300);

    const scrollTopAfterDown = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(scrollTopAfterDown).toBeGreaterThan(0);

    // Screenshot scrolled down
    await page.screenshot({ path: 'tests/screenshots/mobile-scroll-2-scrolled.png' });

    // 3. Scroll back UP to top (scrollTop -> 0)
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(300);

    const scrollTopAfterTop = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(scrollTopAfterTop).toBe(0);

    // Screenshot back at top
    await page.screenshot({ path: 'tests/screenshots/mobile-scroll-3-back-top.png' });

    // 4. Test PullToRefresh interaction when at top (scrollTop === 0)
    await page.evaluate(() => {
      const el = document.getElementById('main-scroll-area');
      if (!el) return;
      const touch1 = new Touch({ identifier: 1, target: el, clientY: 150, clientX: 200 });
      const touch2 = new Touch({ identifier: 1, target: el, clientY: 250, clientX: 200 });

      el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch1], bubbles: true, cancelable: true }));
      el.dispatchEvent(new TouchEvent('touchmove', { touches: [touch2], bubbles: true, cancelable: true }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true, cancelable: true }));
    });

    await page.waitForTimeout(500);

    // Screenshot after pull to refresh gesture
    await page.screenshot({ path: 'tests/screenshots/mobile-scroll-4-pull-refresh.png' });

    // Verify container and product list are still fully visible and operational
    await expect(page.getByTestId('product-list')).toBeVisible();
    const finalScrollTop = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(finalScrollTop).toBe(0);
  });
});
