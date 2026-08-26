import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

const PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const ROJO_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X6n0AAAAASUVORK5CYII=';

// Helper to prepare a product with variants 'Rojo' and 'Plástico'
async function createProductWithVariants(page: any, productName: string) {
  await page.getByTestId('add-product-button').click();
  await expect(page.getByTestId('product-form')).toBeVisible();

  await page.getByTestId('product-name-input').fill(productName);
  await page.getByTestId('product-sku-input').fill(`VPP-${crypto.getRandomValues(new Uint32Array(1))[0] % 100000}`);
  await page.getByTestId('product-price-input').fill('150');
  await page.getByTestId('product-cost-input').fill('75');

  // Upload an image at product-level
  await page.getByTestId('product-image-input').setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PIXEL_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('[data-testid="product-form"] img[src^="data:image"]')).toBeVisible({ timeout: 10000 });

  // Select attributes to enter multi-mode
  await page.getByTestId('mc-color-Rojo').click();
  await page.getByTestId('mc-color-Azul').click();
  await page.getByTestId('mc-material-Plástico').click();
}

test.describe('Photo-to-Variants + AI Assistant E2E Coverage', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure a clean state
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupPage(page);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
  });

  // --- Photo-to-Variants tests (1 to 6) ---

  test('1. Create multi-variant product and check PhotoVariantPicker appears', async ({ page }) => {
    await createProductWithVariants(page, 'Test Product PV1');
    // Verify that the PhotoVariantPicker is visible
    await expect(page.locator('text=Fotos por valor')).toBeVisible();
  });

  test('2. Upload photo for Rojo color and verify thumbnail shows', async ({ page }) => {
    await createProductWithVariants(page, 'Test Product PV2');
    await expect(page.locator('text=Fotos por valor')).toBeVisible();

    // Find the row for Rojo and upload a photo using the sibling input
    const inputRojo = page.locator('button[title*="Rojo"] + input[type="file"]');
    await inputRojo.setInputFiles({
      name: 'rojo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(ROJO_PNG_BASE64, 'base64'),
    });

    // Assert that the Rojo thumbnail is visible
    const rowRojo = page.locator('div', { has: page.locator('span', { hasText: 'Rojo' }) }).last();
    await expect(rowRojo.locator('img[alt="Rojo"]')).toBeVisible({ timeout: 10000 });
  });

  test('3. Upload photo for Plastico material and verify thumbnail shows', async ({ page }) => {
    await createProductWithVariants(page, 'Test Product PV3');
    await expect(page.locator('text=Fotos por valor')).toBeVisible();

    // Find the row for Plástico and upload a photo using the sibling input
    const inputPlastico = page.locator('button[title*="Plástico"] + input[type="file"]');
    await inputPlastico.setInputFiles({
      name: 'plastico.png',
      mimeType: 'image/png',
      buffer: Buffer.from(ROJO_PNG_BASE64, 'base64'),
    });

    // Assert that the Plástico thumbnail is visible
    const rowPlastico = page.locator('div', { has: page.locator('span', { hasText: 'Plástico' }) }).last();
    await expect(rowPlastico.locator('img[alt="Plástico"]')).toBeVisible({ timeout: 10000 });
  });

  test('4. Remove photo and verify variant fallback', async ({ page }) => {
    await createProductWithVariants(page, 'Test Product PV4');
    await expect(page.locator('text=Fotos por valor')).toBeVisible();

    // Upload a photo for Plástico
    const inputPlastico = page.locator('button[title*="Plástico"] + input[type="file"]');
    await inputPlastico.setInputFiles({
      name: 'plastico.png',
      mimeType: 'image/png',
      buffer: Buffer.from(ROJO_PNG_BASE64, 'base64'),
    });

    const rowPlastico = page.locator('div', { has: page.locator('span', { hasText: 'Plástico' }) }).last();
    await expect(rowPlastico.locator('img[alt="Plástico"]')).toBeVisible({ timeout: 10000 });

    // Remove photo
    await rowPlastico.locator('button[title="Quitar foto de Plástico"]').click();

    // Verify thumbnail is removed
    await expect(rowPlastico.locator('img[alt="Plástico"]')).not.toBeVisible();
  });

  test('5. Save product and check that each variant inherits correct photo', async ({ page }) => {
    const productName = 'Variant Photo Inherit Test';
    await createProductWithVariants(page, productName);
    await expect(page.locator('text=Fotos por valor')).toBeVisible();

    // Upload photo for Rojo
    const inputRojo = page.locator('button[title*="Rojo"] + input[type="file"]');
    await inputRojo.setInputFiles({
      name: 'rojo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(ROJO_PNG_BASE64, 'base64'),
    });

    const rowRojo = page.locator('div', { has: page.locator('span', { hasText: 'Rojo' }) }).last();
    await expect(rowRojo.locator('img[alt="Rojo"]')).toBeVisible({ timeout: 10000 });

    // Fill combination card stocks
    const comboCards = page.locator('[data-testid^="combo-card-"]');
    await expect(comboCards).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await comboCards.nth(i).locator('input').first().fill('5');
    }

    // Save product
    await page.getByTestId('save-product-button').click();
    await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 15000 });

    // Verify variants photo fallback vs Rojo photo inside state
    const productState = await page.evaluate((name) => {
      const state = (window as any).__shelfAppStateForTest;
      const p = state?.products?.find((item: any) => item.name === name && item.isActive !== false);
      return {
        productImageUrl: p?.imageUrl,
        variants:
          p?.variants?.map((v: any) => ({
            label: v.label,
            imageUrl: v.imageUrl,
          })) || [],
      };
    }, productName);

    const rojoPlastico = productState.variants.find((v: any) => v.label.includes('Rojo'));
    const azulPlastico = productState.variants.find((v: any) => v.label.includes('Azul'));

    expect(rojoPlastico).toBeDefined();
    expect(azulPlastico).toBeDefined();

    // Azul / Plástico has no variant photo assigned, so it must fall back to product-level imageUrl
    expect(azulPlastico.imageUrl).toBe(productState.productImageUrl);

    // Rojo / Plástico has variant photo assigned, so it must not equal product-level imageUrl
    expect(rojoPlastico.imageUrl).toBeDefined();
    expect(rojoPlastico.imageUrl).not.toBe(productState.productImageUrl);
  });

  test('6. Edit product and verify photo assignments are preserved', async ({ page }) => {
    const productName = 'Edit Preserve Photo Test';
    await createProductWithVariants(page, productName);
    await expect(page.locator('text=Fotos por valor')).toBeVisible();

    // Upload photo for Rojo
    const inputRojo = page.locator('button[title*="Rojo"] + input[type="file"]');
    await inputRojo.setInputFiles({
      name: 'rojo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(ROJO_PNG_BASE64, 'base64'),
    });

    const rowRojo = page.locator('div', { has: page.locator('span', { hasText: 'Rojo' }) }).last();
    await expect(rowRojo.locator('img[alt="Rojo"]')).toBeVisible({ timeout: 10000 });

    const comboCards = page.locator('[data-testid^="combo-card-"]');
    await expect(comboCards).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await comboCards.nth(i).locator('input').first().fill('5');
    }

    await page.getByTestId('save-product-button').click();
    await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 15000 });

    // Retrieve productId
    const productId = await page.evaluate((name) => {
      const state = (window as any).__shelfAppStateForTest;
      const p = state?.products?.find((item: any) => item.name === name && item.isActive !== false);
      return p?.id;
    }, productName);

    expect(productId).toBeDefined();

    // Click edit
    await page.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    // Save again
    await page.getByTestId('save-product-button').click();
    await expect(page.getByTestId('product-form')).not.toBeVisible();

    // Verify variants still preserve correct images in the state
    const productState = await page.evaluate((name) => {
      const state = (window as any).__shelfAppStateForTest;
      const p = state?.products?.find((item: any) => item.name === name && item.isActive !== false);
      return {
        productImageUrl: p?.imageUrl,
        variants:
          p?.variants?.map((v: any) => ({
            label: v.label,
            imageUrl: v.imageUrl,
          })) || [],
      };
    }, productName);

    const rojoPlastico = productState.variants.find((v: any) => v.label.includes('Rojo'));
    expect(rojoPlastico?.imageUrl).toBeDefined();
    expect(rojoPlastico?.imageUrl).not.toBe(productState.productImageUrl);
  });

  // --- AI Assistant tests (7 to 12) ---

  test('7. AI Chat: Navigate to Reports shows AI Chat section', async ({ page }) => {
    await page.locator('[data-testid="nav-item-nav.reports"]').last().click();
    await dismissModals(page);
    await expect(page.getByTestId('ai-chat-panel')).toBeVisible();
  });

  test('8. AI Chat: Typing question is accepted in text input', async ({ page }) => {
    await page.locator('[data-testid="nav-item-nav.reports"]').last().click();
    await dismissModals(page);

    const input = page.getByTestId('ai-chat-input');
    await expect(input).toBeVisible();
    await input.fill('How many products are low on stock?');
    await expect(input).toHaveValue('How many products are low on stock?');
  });

  test('9. AI Chat: Clicking send displays loading/thinking state', async ({ page }) => {
    await page.locator('[data-testid="nav-item-nav.reports"]').last().click();
    await dismissModals(page);

    // Mock API call to keep it in a thinking/loading state
    await page.route('**/api/ai/chat', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Model response payload' }),
      });
    });

    const input = page.getByTestId('ai-chat-input');
    await input.fill('Is there anything low on stock?');

    const sendBtn = page.getByTestId('ai-chat-send');
    await sendBtn.click();

    // Assert that the input and button are disabled during loading
    await expect(input).toBeDisabled();
    await expect(sendBtn).toBeDisabled();

    // Verify loading indicator is displayed
    await expect(page.locator('.animate-pulse').first()).toBeVisible();
  });

  test('10. AI Chat: Shows message bubbles for user and model', async ({ page }) => {
    await page.locator('[data-testid="nav-item-nav.reports"]').last().click();
    await dismissModals(page);

    // Mock API call
    await page.route('**/api/ai/chat', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Model response success!' }),
      });
    });

    const input = page.getByTestId('ai-chat-input');
    await input.fill('Test user question message');

    const sendBtn = page.getByTestId('ai-chat-send');
    await sendBtn.click();

    // Verify bubbles appear for both user message and model response
    await expect(page.locator('text=Test user question message').last()).toBeVisible();
    await expect(page.locator('text=Model response success!').last()).toBeVisible();
  });

  test('11. AI Chat: Empty question is no-op / send button disabled', async ({ page }) => {
    await page.locator('[data-testid="nav-item-nav.reports"]').last().click();
    await dismissModals(page);

    const input = page.getByTestId('ai-chat-input');
    await input.fill('   '); // spaces are empty/ignored

    const sendBtn = page.getByTestId('ai-chat-send');
    await expect(sendBtn).toBeDisabled();
  });

  test('12. AI Chat: Chat scrolls to bottom/shows new messages in viewport', async ({ page }) => {
    await page.locator('[data-testid="nav-item-nav.reports"]').last().click();
    await dismissModals(page);

    // Mock API call
    await page.route('**/api/ai/chat', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Scrolled response target message' }),
      });
    });

    const input = page.getByTestId('ai-chat-input');
    await input.fill('Ensure scroll to bottom');

    const sendBtn = page.getByTestId('ai-chat-send');
    await sendBtn.click();

    const lastBubble = page.locator('text=Scrolled response target message').last();
    await expect(lastBubble).toBeVisible();

    // Verify that the last model message is in view
    await expect(lastBubble).toBeInViewport();
  });
});
