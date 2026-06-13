import { expect, type Page, test } from '@playwright/test';

test.describe('CRUD Operations — Inventory, Sales, Clients, Suppliers', () => {

  const initScript = `
    localStorage.setItem('hasVisited', 'true');
    localStorage.setItem('shelfWelcomeSeen', 'true');
  `;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
  });

  test('Product CRUD: create, read, update, delete', async ({ page }) => {
    await page.context().addInitScript(initScript);
    await page.goto('/');
    await page.waitForTimeout(1500);

    // Navigate to Inventory
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();

    // --- CREATE ---
    await page.getByTestId('add-product-button').click();
    await page.getByTestId('product-name-input').fill('Test CRUD Product');
    await page.getByTestId('product-quantity-input').fill('20');
    await page.getByTestId('product-price-input').fill('150');
    await page.getByTestId('product-cost-input').fill('75');
    await page.getByTestId('save-product-button').click();
    await expect(page.locator('text=Test CRUD Product').first()).toBeVisible({ timeout: 5000 });

    // --- READ ---
    const productCard = page.locator('text=Test CRUD Product').first();
    await expect(productCard).toBeVisible();
    // Verify quantity and price are shown
    const cardText = await productCard.locator('..').innerText();
    expect(cardText).toMatch(/20/);
    expect(cardText).toMatch(/150/);

    // --- UPDATE ---
    await productCard.click();
    await page.waitForTimeout(500);
    // Change quantity to 25
    await page.getByTestId('product-quantity-input').fill('25');
    await page.getByTestId('save-product-button').click();
    await page.waitForTimeout(1000);

    // Verify update reflected
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await page.waitForTimeout(1000);
    const updatedCardText = await page.locator('text=Test CRUD Product').first().locator('..').innerText();
    expect(updatedCardText).toMatch(/25/);

    // --- DELETE ---
    // Click product name again, look for delete button
    await page.locator('text=Test CRUD Product').first().click();
    await page.waitForTimeout(500);

    const deleteBtn = page.locator('button[aria-label="Eliminar producto"]').or(
      page.locator('button:has-text("Eliminar")')
    ).or(
      page.getByRole('button', { name: /eliminar/i })
    );

    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      // Confirm delete if modal appears
      const confirmBtn = page.locator('button:has-text("Confirmar")').or(
        page.getByRole('button', { name: /confirmar/i })
      );
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
      }
      await page.waitForTimeout(1000);
    }

    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Test CRUD Product').first()).not.toBeVisible({ timeout: 5000 });
  });

  test('Sales flow: create sale and verify stock decrements', async ({ page }) => {
    await page.context().addInitScript(initScript);

    // First create a product to sell
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await page.getByTestId('add-product-button').click();
    await page.getByTestId('product-name-input').fill('Sale Test Product');
    await page.getByTestId('product-quantity-input').fill('50');
    await page.getByTestId('product-price-input').fill('200');
    await page.getByTestId('product-cost-input').fill('100');
    await page.getByTestId('save-product-button').click();
    await expect(page.locator('text=Sale Test Product').first()).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(1000);

    // Navigate to Sales
    await page.locator('[data-testid="nav-item-nav.sales"]').last().click();
    await page.waitForTimeout(1000);

    // Create a new sale
    const addSaleBtn = page.getByRole('button', { name: /nueva venta|new sale|agregar venta/i }).or(
      page.getByTestId('add-sale-button')
    );
    if (await addSaleBtn.isVisible().catch(() => false)) {
      await addSaleBtn.click();
    }

    // Search and add product to sale
    const productSearch = page.getByPlaceholder(/buscar producto|search product|producto/i).first();
    if (await productSearch.isVisible().catch(() => false)) {
      await productSearch.fill('Sale Test Product');
      await page.waitForTimeout(500);
    }

    // Save the sale
    const saveSaleBtn = page.getByTestId('save-sale-button').or(
      page.getByRole('button', { name: /guardar venta|save sale|completar venta/i })
    );
    if (await saveSaleBtn.isVisible().catch(() => false)) {
      await saveSaleBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify stock decremented
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await page.waitForTimeout(1000);
    const stockCardText = await page.locator('text=Sale Test Product').first().locator('..').innerText();
    expect(stockCardText).toMatch(/49/);
  });

  test('Client CRUD: create and list clients', async ({ page }) => {
    await page.context().addInitScript(initScript);
    await page.goto('/');
    await page.waitForTimeout(1500);

    // Navigate to Clients
    await page.locator('[data-testid="nav-item-nav.clients"]').last().click();
    await page.waitForTimeout(1000);

    // Add client
    const addBtn = page.getByTestId('add-client-button').or(
      page.getByRole('button', { name: /nuevo cliente|add client/i })
    );
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
    }

    const nameInput = page.getByTestId('client-name-input').or(
      page.getByPlaceholder(/nombre.*cliente|client.*name/i).first()
    );
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Test Client Name');
    }

    const saveBtn = page.getByTestId('save-client-button').or(
      page.getByRole('button', { name: /guardar|save/i })
    );
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify client appears
    await expect(page.locator('text=Test Client Name').first()).toBeVisible({ timeout: 5000 });
  });

  test('Supplier CRUD: create and list suppliers', async ({ page }) => {
    await page.context().addInitScript(initScript);
    await page.goto('/');
    await page.waitForTimeout(1500);

    // Navigate to Suppliers
    await page.locator('[data-testid="nav-item-nav.suppliers"]').last().click();
    await page.waitForTimeout(1000);

    // Add supplier
    const addBtn = page.getByTestId('add-supplier-button').or(
      page.getByRole('button', { name: /nuevo proveedor|add supplier/i })
    );
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
    }

    const nameInput = page.getByTestId('supplier-name-input').or(
      page.getByPlaceholder(/nombre.*proveedor|supplier.*name/i).first()
    );
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Test Supplier Name');
    }

    const saveBtn = page.getByTestId('save-supplier-button').or(
      page.getByRole('button', { name: /guardar|save/i })
    );
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify supplier appears
    await expect(page.locator('text=Test Supplier Name').first()).toBeVisible({ timeout: 5000 });
  });
});
