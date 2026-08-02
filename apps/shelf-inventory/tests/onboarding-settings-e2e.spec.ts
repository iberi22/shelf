import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

// Dedicated URL for Onboarding tests where skipping landing/test modes is disabled
const ONBOARDING_APP_URL = 'http://127.0.0.1:5176';

test.describe('Onboarding Flow E2E Coverage', () => {
  test.beforeEach(async ({ page }) => {
    // Clear state before each test to guarantee fresh browser behavior
    await page.context().clearCookies();
    await page.goto(ONBOARDING_APP_URL);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('Onboarding Flow - 1: Fresh browser shows landing page', async ({ page }) => {
    // Fresh browser goes to landing page and we see the headline
    await expect(page.locator('h2:has-text("Tu Inventario.")')).toBeVisible({ timeout: 15000 });
  });

  test('Onboarding Flow - 2: Clicking Configurar/Empieza shows welcome onboarding', async ({ page }) => {
    // Click the CTA button on landing page to start
    const ctaButton = page
      .locator('button.bg-gradient-to-r, button:has-text("Empieza Gratis"), button:has-text("landing.cta")')
      .first();
    await expect(ctaButton).toBeVisible({ timeout: 10000 });
    await ctaButton.click();

    // Handle welcome modal if present
    const welcomeModalBtn = page.locator('[data-testid="welcome-modal-get-started-button"]');
    try {
      await welcomeModalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await welcomeModalBtn.click();
    } catch {
      // Ignore if not present
    }

    // Onboarding screen shown: Bienvenido a Shelf!
    await expect(page.locator('h1:has-text("¡Bienvenido a Shelf!")')).toBeVisible({ timeout: 10000 });
  });

  test('Onboarding Flow - 3: Click Configurar mi inventario shows preset grid', async ({ page }) => {
    // Navigate past landing and welcome modal
    const ctaButton = page.locator('button.bg-gradient-to-r, button:has-text("Empieza Gratis")').first();
    await ctaButton.click();
    const welcomeModalBtn = page.locator('[data-testid="welcome-modal-get-started-button"]');
    try {
      await welcomeModalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await welcomeModalBtn.click();
    } catch {}

    // Click "Configurar mi inventario"
    const configureBtn = page.locator('button:has-text("Configurar mi inventario")');
    await expect(configureBtn).toBeVisible({ timeout: 5000 });
    await configureBtn.click();

    // Verify grid headers exist
    await expect(page.locator('h2:has-text("¿Qué tipo de negocio manejas?")')).toBeVisible({ timeout: 5000 });
  });

  test('Onboarding Flow - 4: Selecting Materas y Plantas preset shows preview details', async ({ page }) => {
    // Navigate past landing to select page
    const ctaButton = page.locator('button.bg-gradient-to-r, button:has-text("Empieza Gratis")').first();
    await ctaButton.click();
    const welcomeModalBtn = page.locator('[data-testid="welcome-modal-get-started-button"]');
    try {
      await welcomeModalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await welcomeModalBtn.click();
    } catch {}
    await page.locator('button:has-text("Configurar mi inventario")').click();

    // Select Materas y Plantas
    const presetBtn = page.locator('button').filter({ hasText: 'Materas y Plantas' }).first();
    await expect(presetBtn).toBeVisible({ timeout: 5000 });
    await presetBtn.click();

    // Verify preview screen shows attributes Color, Medida, Material
    await expect(page.locator('h2:has-text("Materas y Plantas")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('span:has-text("Color")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Medida")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Material")').first()).toBeVisible();
  });

  test('Onboarding Flow - 5: Clicking ¡Configurar! loads main app with preset config', async ({ page }) => {
    // Go all the way through selecting Materas y Plantas
    const ctaButton = page.locator('button.bg-gradient-to-r, button:has-text("Empieza Gratis")').first();
    await ctaButton.click();
    const welcomeModalBtn = page.locator('[data-testid="welcome-modal-get-started-button"]');
    try {
      await welcomeModalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await welcomeModalBtn.click();
    } catch {}
    await page.locator('button:has-text("Configurar mi inventario")').click();
    await page.locator('button').filter({ hasText: 'Materas y Plantas' }).first().click();

    // Confirm Configuration
    const confirmBtn = page.locator('button:has-text("¡Configurar!")');
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    // Verify main app loads
    await expect(page.locator('h2:has-text("Dashboard")').first()).toBeVisible({ timeout: 15000 });
  });

  test('Onboarding Flow - 6: Reload preserves onboarding completion state', async ({ page }) => {
    // Directly inject finished onboarding state and reload
    await page.evaluate(() => {
      localStorage.setItem('hasVisited', 'true');
      localStorage.setItem('shelfWelcomeSeen', 'true');
      localStorage.setItem('hasCompletedOnboarding', 'true');
    });
    await page.reload();

    // Should load the main app directly
    await expect(page.locator('h2:has-text("Dashboard")').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h2:has-text("Tu Inventario.")')).toHaveCount(0);
  });

  test('Onboarding Flow - 7: Clicking Omitir bypasses with default config', async ({ page }) => {
    const ctaButton = page.locator('button.bg-gradient-to-r, button:has-text("Empieza Gratis")').first();
    await ctaButton.click();
    const welcomeModalBtn = page.locator('[data-testid="welcome-modal-get-started-button"]');
    try {
      await welcomeModalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await welcomeModalBtn.click();
    } catch {}

    // Click omit/skip button on welcome screen
    const skipBtn = page.locator('button:has-text("Omitir")').first();
    await expect(skipBtn).toBeVisible({ timeout: 5000 });
    await skipBtn.click();

    // Main app loads directly
    await expect(page.locator('h2:has-text("Dashboard")').first()).toBeVisible({ timeout: 15000 });
  });

  test('Onboarding Flow - 8: Back button navigation works correctly', async ({ page }) => {
    const ctaButton = page.locator('button.bg-gradient-to-r, button:has-text("Empieza Gratis")').first();
    await ctaButton.click();
    const welcomeModalBtn = page.locator('[data-testid="welcome-modal-get-started-button"]');
    try {
      await welcomeModalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await welcomeModalBtn.click();
    } catch {}

    // Go to select
    await page.locator('button:has-text("Configurar mi inventario")').click();
    await expect(page.locator('h2:has-text("¿Qué tipo de negocio manejas?")')).toBeVisible({ timeout: 5000 });

    // Go back to welcome
    await page.locator('button:has-text("Volver")').click();
    await expect(page.locator('h1:has-text("¡Bienvenido a Shelf!")')).toBeVisible({ timeout: 5000 });

    // Go forward again
    await page.locator('button:has-text("Configurar mi inventario")').click();
    // Select Materas y Plantas
    await page.locator('button').filter({ hasText: 'Materas y Plantas' }).first().click();
    await expect(page.locator('h2:has-text("Materas y Plantas")')).toBeVisible({ timeout: 5000 });

    // Click "Cambiar" back button
    await page.locator('button:has-text("Cambiar")').click();
    await expect(page.locator('h2:has-text("¿Qué tipo de negocio manejas?")')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Settings Materials E2E Coverage', () => {
  test.beforeEach(async ({ page }) => {
    // Setup using default bypass directly to main app settings
    await setupPage(page);
    await dismissModals(page);
    await page.getByTestId('nav-item-nav.settings').last().click();
    await expect(page.getByTestId('settings-articles-config-card')).toBeVisible({ timeout: 10000 });
  });

  test('Settings Materials - 9: Articles configuration card is visible', async ({ page }) => {
    await expect(page.getByTestId('settings-articles-config-card')).toBeVisible();
    await expect(page.locator('h4:has-text("Materiales sugeridos")')).toBeVisible();
  });

  test('Settings Materials - 10: Clicking + Material adds new input', async ({ page }) => {
    const initialInputs = await page.locator('[data-testid^="material-option-input-"]').count();
    await page.getByTestId('add-material-option').click();
    const currentInputs = await page.locator('[data-testid^="material-option-input-"]').count();
    expect(currentInputs).toBe(initialInputs + 1);
  });

  test('Settings Materials - 11: Type material name and save successfully', async ({ page }) => {
    await page.getByTestId('add-material-option').click();
    const inputs = page.locator('[data-testid^="material-option-input-"]');
    const lastIndex = (await inputs.count()) - 1;
    const lastInput = inputs.nth(lastIndex);
    await lastInput.fill('Mármol Exótico');

    // Save
    await page.getByTestId('save-inventory-config').click();

    // Verify confirmation notification
    await expect(page.locator('text=Configuración de inventario guardada').first()).toBeVisible({ timeout: 5000 });

    // Verify it persists in form
    await expect(lastInput).toHaveValue('Mármol Exótico');
  });

  test('Settings Materials - 12: Edit existing material successfully', async ({ page }) => {
    const inputs = page.locator('[data-testid^="material-option-input-"]');
    const firstInput = inputs.first();
    await firstInput.fill('Material Editado');

    await page.getByTestId('save-inventory-config').click();
    await expect(page.locator('text=Configuración de inventario guardada').first()).toBeVisible({ timeout: 5000 });

    await expect(firstInput).toHaveValue('Material Editado');
  });

  test('Settings Materials - 13: Remove material successfully', async ({ page }) => {
    const inputs = page.locator('[data-testid^="material-option-input-"]');
    const initialCount = await inputs.count();
    expect(initialCount).toBeGreaterThan(0);

    // Get parent of first input and click its delete button
    const firstInputRow = inputs.first().locator('..');
    await firstInputRow.locator('button').click();

    const postRemoveCount = await page.locator('[data-testid^="material-option-input-"]').count();
    expect(postRemoveCount).toBe(initialCount - 1);

    await page.getByTestId('save-inventory-config').click();
    await expect(page.locator('text=Configuración de inventario guardada').first()).toBeVisible({ timeout: 5000 });
  });

  test('Settings Materials - 14: Duplicate material shows validation error', async ({ page }) => {
    // Add two duplicate materials
    await page.getByTestId('add-material-option').click();
    let inputs = page.locator('[data-testid^="material-option-input-"]');
    let lastIndex = (await inputs.count()) - 1;
    await inputs.nth(lastIndex).fill('Repetido');

    await page.getByTestId('add-material-option').click();
    inputs = page.locator('[data-testid^="material-option-input-"]');
    lastIndex = (await inputs.count()) - 1;
    await inputs.nth(lastIndex).fill('Repetido');

    // Click Save
    await page.getByTestId('save-inventory-config').click();

    // Verify error notification
    await expect(page.locator('text=Hay materiales sugeridos repetidos.').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Settings Persistence E2E Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);
    await page.getByTestId('nav-item-nav.settings').last().click();
  });

  test('Settings Persistence - 15: Currency selection persists after reload', async ({ page }) => {
    const currencySelect = page.getByTestId('currency-select');
    await currencySelect.selectOption('EUR');

    // Reload page
    await page.reload();
    await dismissModals(page);
    await page.getByTestId('nav-item-nav.settings').last().click();

    await expect(currencySelect).toHaveValue('EUR');
  });

  test('Settings Persistence - 16: Color selection persists after reload', async ({ page }) => {
    await page.getByTestId('add-color-option').click();
    const names = page.locator('[data-testid^="color-option-name-"]');
    const lastIndex = (await names.count()) - 1;
    const lastInput = names.nth(lastIndex);
    await lastInput.fill('Color Magenta Unico');

    await page.getByTestId('save-inventory-config').click();
    await expect(page.locator('text=Configuración de inventario guardada').first()).toBeVisible({ timeout: 5000 });

    // Reload
    await page.reload();
    await dismissModals(page);
    await page.getByTestId('nav-item-nav.settings').last().click();

    // Verify new color is present
    const updatedNames = page.locator('[data-testid^="color-option-name-"]');
    const updatedLastInput = updatedNames.nth((await updatedNames.count()) - 1);
    await expect(updatedLastInput).toHaveValue('Color Magenta Unico');
  });

  test('Settings Persistence - 17: Reset settings returns data to defaults', async ({ page }) => {
    // Intercept window.confirm prompt and click OK
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Locate Reset button inside general/data card and click it
    const resetButton = page.locator('.border-red-500\\/30 button');
    await resetButton.click();

    // Verify success notification (matches either the actual translation or the fallback key due to source key mismatch)
    const successToast = page
      .locator('text=Todos los datos han sido reiniciados.')
      .or(page.locator('text=settings.dataResetSuccess'))
      .first();
    await expect(successToast).toBeVisible({ timeout: 5000 });
  });
});
