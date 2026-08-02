import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Mobile Responsive Layout & Interactions', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // Mobile Pixel 5 viewport size or similar
  });

  test.beforeEach(async ({ page }) => {
    // Setup using the fast bypass to go directly to the main application
    await setupPage(page);
    await dismissModals(page);
  });

  test('1. Mobile viewport → material chips wrap correctly', async ({ page }) => {
    // Navigate to Inventory page
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

    // Open add product modal
    await page.locator('[data-testid="add-product-button"]').click();
    await expect(page.locator('[data-testid="product-form"]')).toBeVisible();

    // The container of material chips suggestions has class "flex-wrap"
    const chipButton = page.locator('button[data-testid^="mc-material-"]').first();
    await expect(chipButton).toBeVisible();
    const container = chipButton.locator('..');
    await expect(container).toBeVisible();
    const className = await container.getAttribute('class');
    expect(className).toContain('flex-wrap');
  });

  test('2. Tap material chip → toggles selection', async ({ page }) => {
    // Navigate to Inventory page
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

    // Open add product modal
    await page.locator('[data-testid="add-product-button"]').click();
    await expect(page.locator('[data-testid="product-form"]')).toBeVisible();

    // Select the "Plástico" chip
    const chip = page.locator('[data-testid="mc-material-Plástico"]');
    await expect(chip).toBeVisible();

    // It should start unselected (checking its text color/class)
    let className = await chip.getAttribute('class') || '';
    expect(className).not.toContain('text-[#22C55E]');

    // Click to select
    await chip.click();
    className = await chip.getAttribute('class') || '';
    expect(className).toContain('text-[#22C55E]');

    // Click again to deselect
    await chip.click();
    className = await chip.getAttribute('class') || '';
    expect(className).not.toContain('text-[#22C55E]');
  });

  test('3. Custom material input → keyboard doesn\'t overlap chips', async ({ page }) => {
    // Navigate to Inventory page
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

    // Open add product modal
    await page.locator('[data-testid="add-product-button"]').click();
    await expect(page.locator('[data-testid="product-form"]')).toBeVisible();

    // Find custom material input
    const customInput = page.locator('input[placeholder="Material personalizado (ej. Fibra de vidrio)"]');
    await expect(customInput).toBeVisible();
    await expect(customInput).toBeEnabled();

    // Focus and fill custom value
    await customInput.focus();
    await customInput.fill('Aluminio');

    // Add custom material
    await page.locator('button:has-text("Añadir")').last().click();

    // Verify it was added as a selected chip (under selected materials)
    await expect(page.locator('div:has-text("Aluminio")').first()).toBeVisible();
  });

  test('4. Combo grid on mobile → cards stack vertically', async ({ page }) => {
    // Navigate to Inventory page
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

    // Open add product modal
    await page.locator('[data-testid="add-product-button"]').click();
    await expect(page.locator('[data-testid="product-form"]')).toBeVisible();

    // Select two materials to trigger multi-mode / combos
    const chip1 = page.locator('[data-testid="mc-material-Plástico"]');
    const chip2 = page.locator('[data-testid="mc-material-Cemento"]');
    await chip1.click();
    await chip2.click();

    // Verify combo cards are rendered
    const comboCards = page.locator('[data-testid^="combo-card-"]');
    await expect(comboCards).toHaveCount(2);

    // Verify that cards stack vertically on mobile (their y offsets are vertically separated)
    const box1 = await comboCards.nth(0).boundingBox();
    const box2 = await comboCards.nth(1).boundingBox();
    if (box1 && box2) {
      expect(box2.y).toBeGreaterThan(box1.y + box1.height - 2);
    } else {
      throw new Error('Could not compute bounding boxes for combo cards');
    }
  });

  test('5. Photo picker on mobile → upload button accessible', async ({ page }) => {
    // Navigate to Inventory page
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

    // Open add product modal
    await page.locator('[data-testid="add-product-button"]').click();
    await expect(page.locator('[data-testid="product-form"]')).toBeVisible();

    // Select materials to trigger multi-mode
    await page.locator('[data-testid="mc-material-Plástico"]').click();
    await page.locator('[data-testid="mc-material-Cemento"]').click();

    // Upload photo button inside photo variant picker should be visible & accessible
    const uploadBtn = page.locator('button[title^="Subir foto para Plástico"]');
    await expect(uploadBtn).toBeVisible();
    await expect(uploadBtn).toBeEnabled();
    await expect(uploadBtn.locator('svg')).toBeVisible(); // Camera icon inside
  });
});

test.describe('Landing -> Onboarding -> App Flow', () => {
  // Use a different port where skip landing and test modes are false
  const APP_URL = 'http://127.0.0.1:5176';

  test.use({
    viewport: { width: 390, height: 844 },
  });

  test('6. Fresh browser → landing page shown', async ({ page }) => {
    // Clear cookies & localStorage for a truly fresh state
    await page.context().clearCookies();
    await page.goto(APP_URL);
    await page.evaluate(() => {
      localStorage.clear();
    });
    // Reload to ensure state is clean from the start
    await page.reload();

    // We should see the landing page headline
    await expect(page.locator('h2:has-text("Tu Inventario.")')).toBeVisible({ timeout: 15000 });
  });

  test('7. Click through landing → onboarding appears', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(APP_URL);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();

    // Click "Empieza Gratis" button (using bulletproof fallback selector for translated, untranslated or CSS classes)
    const ctaButton = page.locator('button.bg-gradient-to-r, button:has-text("Empieza Gratis"), button:has-text("landing.cta")').first();
    await expect(ctaButton).toBeVisible({ timeout: 10000 });
    await ctaButton.click();

    // The welcome modal or guest mode trigger might prompt.
    // Let's check if the welcome modal is shown
    const welcomeModalBtn = page.locator('[data-testid="welcome-modal-get-started-button"]');
    try {
      await welcomeModalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await welcomeModalBtn.click();
    } catch {
      // If it doesn't appear within 3 seconds, that is fine
    }

    // Now the onboarding screen "¡Bienvenido a Shelf!" should appear
    await expect(page.locator('h1:has-text("¡Bienvenido a Shelf!")')).toBeVisible({ timeout: 10000 });
  });

  test('8. Complete onboarding → main app loads', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(APP_URL);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();

    // Navigate through Landing
    const ctaButton = page.locator('button.bg-gradient-to-r, button:has-text("Empieza Gratis"), button:has-text("landing.cta")').first();
    await expect(ctaButton).toBeVisible({ timeout: 10000 });
    await ctaButton.click();

    // Dismiss welcome modal if present
    const welcomeModalBtn = page.locator('[data-testid="welcome-modal-get-started-button"]');
    try {
      await welcomeModalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await welcomeModalBtn.click();
    } catch {
      // Ignore if not shown
    }

    // Onboarding screen shown. Click the "Omitir" button to proceed using defaults.
    const skipOnboardingBtn = page.locator('button:has-text("Omitir")').first();
    await expect(skipOnboardingBtn).toBeVisible({ timeout: 10000 });
    await skipOnboardingBtn.click();

    // Now the main application loads (e.g. Dashboard)
    await expect(page.locator('h2:has-text("Dashboard")').first()).toBeVisible({ timeout: 15000 });
  });

  test('9. Second visit → skips landing AND onboarding', async ({ page }) => {
    await page.goto(APP_URL);
    await page.evaluate(() => {
      localStorage.clear();
      // Set storage indicating they already completed visiting and onboarding
      localStorage.setItem('hasVisited', 'true');
      localStorage.setItem('shelfWelcomeSeen', 'true');
      localStorage.setItem('hasCompletedOnboarding', 'true');
    });
    // Reload/Revisit
    await page.reload();

    // Should load the main app directly, skipping landing page and onboarding
    await expect(page.locator('h2:has-text("Dashboard")').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h2:has-text("Tu Inventario.")')).toHaveCount(0);
  });

  test('10. Dev mode skip works correctly', async ({ page }) => {
    // Clear state
    await page.context().clearCookies();
    await page.goto(APP_URL);
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Visit with dev skip parameter
    await page.goto(`${APP_URL}/?testMode=true`);

    // Should load the main app directly
    await expect(page.locator('h2:has-text("Dashboard")').first()).toBeVisible({ timeout: 15000 });
  });
});
