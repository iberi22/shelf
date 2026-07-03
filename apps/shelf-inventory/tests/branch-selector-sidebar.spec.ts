import { expect, test } from '@playwright/test';

test.describe('Branch Selector in Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('text=[ Shelf. ]');
  });

  test('should show branch selector in sidebar when branches are active', async ({ page }) => {
    // 1. Add a branch in Settings
    await page.click('[data-testid="nav-item-nav.settings"]');
    await page.click('[data-testid="add-branch-button"]');
    await page.fill('[data-testid="branch-name-input"]', 'Sucursal Test');
    await page.click('[data-testid="save-branch-button"]');

    // 2. Verify it appears in the desktop sidebar
    const desktopSelector = page.locator('[data-testid="host-branch-selector"]');
    await expect(desktopSelector).toBeVisible();

    // 3. Check if it's under the logo (approximately)
    const logo = page
      .locator('h1:has-text("[ Shelf. ]")')
      .filter({ hasNot: page.locator('.md\\:hidden') })
      .first();
    const logoBox = await logo.boundingBox();
    const selectorBox = await desktopSelector.boundingBox();

    if (logoBox && selectorBox) {
      expect(selectorBox.y).toBeGreaterThan(logoBox.y);
    }

    // 4. Switching branch updates state
    await desktopSelector.selectOption({ label: '📍 Sucursal Test' });

    const activeBranchId = await page.evaluate(() => {
      return (window as any).__shelfAppStateForTest.activeBranchId;
    });
    expect(activeBranchId).not.toBeNull();
    expect(activeBranchId).not.toBe('global');
  });

  test('should show branch selector in mobile drawer', async ({ page }) => {
    // Set viewport to mobile
    await page.setViewportSize({ width: 375, height: 667 });

    // 1. Add a branch (need to open settings first)
    // On mobile we might need to open the drawer first
    const menuButton = page.locator('button[aria-label="Abrir menú"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.click();

    const settingsNavItem = page.locator('[data-testid="nav-item-nav.settings"]');
    await expect(settingsNavItem).toBeVisible({ timeout: 10000 });
    await settingsNavItem.click();

    // In Settings, add branch
    await page.click('[data-testid="add-branch-button"]');
    await page.fill('[data-testid="branch-name-input"]', 'Sucursal Movil');
    await page.click('[data-testid="save-branch-button"]');

    // 2. Open drawer and verify selector
    await page.click('button[aria-label="Abrir menú"]');
    const mobileSelector = page.locator('[data-testid="mobile-branch-selector"]');
    await expect(mobileSelector).toBeVisible();

    // 3. Check if it's under the logo in mobile drawer
    const mobileLogo = page.locator('.md\\:hidden h1:has-text("[ Shelf. ]")');
    const logoBox = await mobileLogo.boundingBox();
    const selectorBox = await mobileSelector.boundingBox();

    if (logoBox && selectorBox) {
      expect(selectorBox.y).toBeGreaterThan(logoBox.y);
    }
  });
});
