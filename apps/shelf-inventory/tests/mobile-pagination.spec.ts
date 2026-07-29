import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

const SEED_COUNT = 60;

// Playwright serializes init scripts without closures: the count arrives as an argument
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

  // The persisted state only hydrates when a session exists
  localStorage.setItem(
    'guest_user',
    JSON.stringify({ uid: 'guest_mobile_pagination', email: null, subscriptionTier: 'pyme', isGuest: true }),
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
      localPeerId: 'peer_mobile_pagination_host',
      role: 'admin',
      arqueoSessions: [],
      ocrResults: [],
      pendingEdits: [],
      productChangeHistory: [],
      auditLogs: [],
    }),
  );
};

test.describe('Mobile inventory list pagination (SRC-FUN-001)', () => {
  test.setTimeout(120000);

  test('renders the first 50 products and loads the rest via the sentinel', async ({ page }) => {
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

    // The seeded state must hydrate before asserting on the list
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const state = (window as any).__shelfAppStateForTest;
            return state?.products?.filter((p: any) => p.isActive !== false).length ?? 0;
          }),
        { timeout: 20000 },
      )
      .toBe(SEED_COUNT);

    // First page: only 50 of 60 cards are rendered
    const cards = page.locator('[data-testid^="product-card-"]');
    await expect(cards).toHaveCount(50, { timeout: 15000 });

    const counter = page.getByTestId('mobile-list-count');
    await expect(counter).toContainText('50');
    await expect(counter).toContainText(String(SEED_COUNT));

    // Reaching the sentinel loads the remaining products
    await page.getByTestId('mobile-list-sentinel').scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(SEED_COUNT, { timeout: 15000 });
    await expect(page.getByTestId('mobile-list-sentinel')).toHaveCount(0);
  });
});
