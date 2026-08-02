import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Internationalization (i18n) E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies & localStorage for a clean state in every scenario
    await page.context().clearCookies();
    // Open a blank page first to have a valid origin for localStorage clearing
    await page.goto('/?testMode=true');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('1. Open Settings -> language selector is visible', async ({ page }) => {
    // Navigate to settings with test mode bypass
    await setupPage(page);
    await dismissModals(page);

    // Click Settings navigation item
    const settingsNavItem = page.getByTestId('nav-item-nav.settings').last();
    await expect(settingsNavItem).toBeVisible();
    await settingsNavItem.click();

    // Verify language selector is visible and accessible
    const selectorBtn = page.getByTestId('language-selector-btn');
    await expect(selectorBtn).toBeVisible();
  });

  test('2. Switch EN -> ES -> UI text changes', async ({ page }) => {
    // Standard bypass loads default language (detected or English)
    await setupPage(page);
    await dismissModals(page);

    // Go to Settings
    await page.getByTestId('nav-item-nav.settings').last().click();

    // Open language selector
    const selectorBtn = page.getByTestId('language-selector-btn');
    await selectorBtn.click();

    // Click Spanish option
    const esOption = page.getByTestId('language-option-es');
    await expect(esOption).toBeVisible();
    await esOption.click();

    // Verify navigation or setting label changes to Spanish
    const settingsTitle = page.locator('[data-testid="settings-general-card"]');
    await expect(settingsTitle).toBeVisible();
    // In Spanish, settings-general-card has the title "General"
    // Let's verify the text description change or navigation change
    // Let's check settings.languageDescription change
    const langDesc = page.locator('text=Cambia el idioma de la interfaz desde configuración.');
    await expect(langDesc).toBeVisible({ timeout: 5000 });
  });

  test('3. Switch ES -> PT -> UI text changes', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);

    await page.getByTestId('nav-item-nav.settings').last().click();

    // Open language selector and switch to Spanish first
    await page.getByTestId('language-selector-btn').click();
    await page.getByTestId('language-option-es').click();

    // Verify Spanish is loaded
    await expect(page.locator('text=Cambia el idioma de la interfaz desde configuración.')).toBeVisible();

    // Open language selector and switch to Portuguese
    await page.getByTestId('language-selector-btn').click();
    await page.getByTestId('language-option-pt').click();

    // Verify Portuguese language description is shown
    await expect(page.locator('text=Altere o idioma da interface nas configurações.')).toBeVisible({ timeout: 5000 });
  });

  test('4. Language persists after reload', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);

    await page.getByTestId('nav-item-nav.settings').last().click();

    // Switch to Spanish
    await page.getByTestId('language-selector-btn').click();
    await page.getByTestId('language-option-es').click();

    // Verify Spanish is active
    await expect(page.locator('text=Cambia el idioma de la interfaz desde configuración.')).toBeVisible();

    const shelfLocaleBefore = await page.evaluate(() => localStorage.getItem('shelfLocale'));
    const userSetBefore = await page.evaluate(() => localStorage.getItem('shelfLocaleSetByUser'));
    console.log('BEFORE RELOAD:', { shelfLocaleBefore, userSetBefore });

    // Simulate reload using setupPage to ensure init scripts (like bypassing landing/welcome) are set
    await setupPage(page);
    await dismissModals(page);

    const shelfLocaleAfter = await page.evaluate(() => localStorage.getItem('shelfLocale'));
    const userSetAfter = await page.evaluate(() => localStorage.getItem('shelfLocaleSetByUser'));
    console.log('AFTER RELOAD:', { shelfLocaleAfter, userSetAfter });

    // Verify that Spanish is still active
    await page.getByTestId('nav-item-nav.settings').last().click();
    await expect(page.locator('text=Cambia el idioma de la interfaz desde configuración.')).toBeVisible({
      timeout: 5000,
    });
  });

  test('5. Navigation labels translated', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);

    // Default or English nav items visible
    const settingsNav = page.getByTestId('nav-item-nav.settings').last();
    const inventoryNav = page.getByTestId('nav-item-nav.inventory').last();
    await expect(settingsNav).toBeVisible();
    await expect(inventoryNav).toBeVisible();

    // Change to Spanish
    await settingsNav.click();
    await page.getByTestId('language-selector-btn').click();
    await page.getByTestId('language-option-es').click();

    // Wait a brief moment for state and translations to apply
    await page.waitForTimeout(300);

    // Verify navigation labels now have Spanish titles via explicit text matches
    await expect(page.locator('[data-testid="nav-item-nav.settings"] >> text=Configuración').last()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-testid="nav-item-nav.inventory"] >> text=Inventario').last()).toBeVisible({
      timeout: 5000,
    });
  });

  test('6. Product form labels translated', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);

    // Set language to Spanish
    await page.getByTestId('nav-item-nav.settings').last().click();
    await page.getByTestId('language-selector-btn').click();
    await page.getByTestId('language-option-es').click();

    // Go to Inventory
    await page.getByTestId('nav-item-nav.inventory').last().click();
    await dismissModals(page);

    // Open add product modal
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    // Check placeholder inside product-name-input is Spanish
    const nameInput = page.getByTestId('product-name-input');
    await expect(nameInput).toHaveAttribute('placeholder', /Nombre del Producto/);
  });

  test('7. Onboarding text translated', async ({ page }) => {
    // Visit port 5176 where VITE_SKIP_LANDING and VITE_TEST_MODE are false to see onboarding flow
    const onboardingUrl = 'http://127.0.0.1:5176';
    await page.goto(onboardingUrl);

    // Landing screen can show Spanish because of browser locale, let's click CTA to go to onboarding
    const ctaBtn = page
      .locator('button:has-text("landing.cta"), button:has-text("Empieza Gratis"), button:has-text("Start for Free")')
      .first();
    await expect(ctaBtn).toBeVisible({ timeout: 10000 });
    await ctaBtn.click();

    // If welcome modal appears, dismiss it
    const welcomeGetStarted = page.getByTestId('welcome-modal-get-started-button');
    try {
      await welcomeGetStarted.waitFor({ state: 'visible', timeout: 3000 });
      await welcomeGetStarted.click();
    } catch {
      // Ignore if not visible
    }

    // Verify Onboarding screen titles are translated/loaded correctly
    // The onboarding title is either "¡Bienvenido a Shelf!" (ES) or "Welcome to Shelf!" (EN)
    const onboardingTitle = page.locator('h1');
    await expect(onboardingTitle).toBeVisible({ timeout: 5000 });
    const textContent = await onboardingTitle.textContent();
    expect(textContent).toMatch(/(Welcome to Shelf!|¡Bienvenido a Shelf!|Bem-vindo ao Shelf!)/);
  });

  test('8. Error messages translated', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);

    // Switch language to Spanish
    await page.getByTestId('nav-item-nav.settings').last().click();
    await page.getByTestId('language-selector-btn').click();
    await page.getByTestId('language-option-es').click();

    // Go to Inventory
    await page.getByTestId('nav-item-nav.inventory').last().click();
    await dismissModals(page);

    // Open add product modal
    await page.getByTestId('add-product-button').click();

    // Ensure product form is fully loaded
    await expect(page.getByTestId('product-form')).toBeVisible();

    // Submit empty form to trigger validation error
    await page.getByTestId('save-product-button').click();

    // Verify nameRequired validation error is displayed in Spanish
    const errorMsg = page.getByTestId('product-name-error');
    await expect(errorMsg).toBeVisible();
    await expect(errorMsg).toHaveText('El nombre es obligatorio.');
  });
});
