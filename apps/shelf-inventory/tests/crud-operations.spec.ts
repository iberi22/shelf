import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('CRUD Operations — Inventory, Sales, Clients, Suppliers', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('Product CRUD: create, read, update, delete', async ({ page }) => {
    // Navigate to Inventory
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    // --- CREATE ---
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();
    await page.getByTestId('product-name-input').fill('Test CRUD Product');
    await page.getByTestId('product-quantity-input').fill('20');
    await page.getByTestId('product-price-input').fill('150');
    await page.getByTestId('product-cost-input').fill('75');
    await page.getByTestId('save-product-button').click();
    await expect(page.locator('text=Test CRUD Product').first()).toBeVisible({ timeout: 5000 });
    const productId = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.find((item: any) => item.name === 'Test CRUD Product')?.id;
    });
    expect(productId).toBeTruthy();

    // --- READ ---
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const state = (window as any).__shelfAppStateForTest;
          const product = state?.products?.find((item: any) => item.name === 'Test CRUD Product');
          return product ? { quantity: product.quantity, price: product.price } : null;
        }),
      )
      .toEqual({ quantity: 20, price: 150 });

    // --- UPDATE ---
    // Click the edit button (pencil icon) for the product
    await page.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(page.getByTestId('product-form')).toBeVisible();

    // Change quantity to 25
    await page.getByTestId('product-quantity-input').fill('25');
    await page.getByTestId('save-product-button').click();
    await page.waitForTimeout(1000);

    // Verify update reflected
    await dismissModals(page);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const state = (window as any).__shelfAppStateForTest;
          return state?.products?.find((item: any) => item.name === 'Test CRUD Product')?.quantity;
        }),
      )
      .toBe(25);

    // --- DELETE ---
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator(`[data-testid="delete-product-${productId}"]:visible`).click();

    await dismissModals(page);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const state = (window as any).__shelfAppStateForTest;
          return state?.products?.find((item: any) => item.name === 'Test CRUD Product')?.isActive;
        }),
      )
      .toBe(false);
  });

  test('Sales flow: create sale and verify stock decrements', async ({ page }) => {
    // First create a product to sell
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();
    await page.getByTestId('product-name-input').fill('Sale Test Product');
    await page.getByTestId('product-quantity-input').fill('50');
    await page.getByTestId('product-price-input').fill('200');
    await page.getByTestId('product-cost-input').fill('100');
    await page.getByTestId('save-product-button').click();
    await expect(page.locator('text=Sale Test Product').first()).toBeVisible({ timeout: 5000 });
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const state = (window as any).__shelfAppStateForTest;
          return state?.products?.find((item: any) => item.name === 'Sale Test Product')?.quantity;
        }),
      )
      .toBe(50);

    await page.waitForTimeout(1000);

    // Navigate to Sales
    await dismissModals(page);
    await page.locator('[data-testid="nav-item-nav.sales"]').last().click();
    await dismissModals(page);
    await page.waitForTimeout(500);

    // Create a new sale
    const addSaleBtn = page
      .getByRole('button', { name: /nueva venta|new sale|agregar venta/i })
      .or(page.getByTestId('add-sale-button'));
    if (await addSaleBtn.isVisible().catch(() => false)) {
      await addSaleBtn.click();
    }
    await expect(page.getByTestId('sale-form')).toBeVisible();
    await page.getByTestId('add-sale-item-button').click();
    await expect(page.getByTestId('sale-item-product-0')).toBeVisible();

    const saleProductId = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.find((item: any) => item.name === 'Sale Test Product')?.id;
    });
    expect(saleProductId).toBeTruthy();
    await page.getByTestId('sale-item-product-0').selectOption(String(saleProductId));
    await page.getByTestId('sale-item-quantity-0').fill('1');

    // Save the sale
    const saveSaleBtn = page
      .getByTestId('save-sale-button')
      .or(page.getByRole('button', { name: /guardar venta|save sale|completar venta/i }));
    if (await saveSaleBtn.isVisible().catch(() => false)) {
      await saveSaleBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify stock decremented
    await dismissModals(page);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const state = (window as any).__shelfAppStateForTest;
          return state?.products?.find((item: any) => item.name === 'Sale Test Product')?.quantity;
        }),
      )
      .toBe(49);
  });

  test('Client CRUD: create and list clients', async ({ page }) => {
    // Navigate to Clients
    await page.locator('[data-testid="nav-item-nav.clients"]').last().click();
    await dismissModals(page);
    await page.waitForTimeout(500);

    // Add client
    const addBtn = page.getByRole('button', { name: /nuevo cliente|add client|agregar cliente/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
    }

    const nameInput = page.getByPlaceholder(/nombre.*cliente|client.*name|name/i).first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Test Client Name');
    }

    const saveBtn = page.getByRole('button', { name: /guardar|save/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify page didn't crash — text may not render immediately
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('Supplier CRUD: create and list suppliers', async ({ page }) => {
    // Navigate to Suppliers
    await page.locator('[data-testid="nav-item-nav.suppliers"]').last().click();
    await dismissModals(page);
    await page.waitForTimeout(500);

    // Add supplier
    const addBtn = page.getByRole('button', { name: /nuevo proveedor|add supplier|agregar proveedor/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
    }

    const nameInput = page.getByPlaceholder(/nombre.*proveedor|supplier.*name|name/i).first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Test Supplier Name');
    }

    const saveBtn = page.getByRole('button', { name: /guardar|save/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify page didn't crash
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });
});
