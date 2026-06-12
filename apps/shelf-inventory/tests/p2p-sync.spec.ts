import { expect, test } from '@playwright/test';

test.describe('P2P Synchronization and Conflict Resolution', () => {
  test('Two browsers can connect, assign roles, and simultaneously add products without conflicts', async ({
    browser,
  }) => {
    // 1. Create two isolated browser contexts
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    // 2. Set localStorage to bypass landing page and welcome modal
    const initScript = `
      localStorage.setItem('hasVisited', 'true');
      localStorage.setItem('shelfWelcomeSeen', 'true');
    `;
    await adminContext.addInitScript(initScript);
    await collabContext.addInitScript(initScript);

    // Both navigate to the app
    await adminPage.goto('/');
    await collabPage.goto('/');

    // 3. Extract Peer ID from Collab
    await collabPage.waitForTimeout(2000); // give it a sec to render
    await collabPage.screenshot({ path: 'collab-before-settings.png' });
    await adminPage.screenshot({ path: 'admin-before-settings.png' });

    // Go to settings tab to see the Peer ID
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();

    // Wait until it's not "Initializing..."
    const collabPeerIdLocator = collabPage.locator('span.font-mono.text-yellow-400').first();
    await collabPeerIdLocator.waitFor({ state: 'visible' });
    await expect(collabPeerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
    const collabId = await collabPeerIdLocator.innerText();
    expect(collabId).toBeTruthy();

    // 4. Admin connects to Collab
    const manualInput = adminPage.getByPlaceholder(/ingresa el Peer ID|enter Peer ID/i);
    await expect(manualInput).toBeVisible();
    await manualInput.fill(collabId);

    // Click Connect button
    await adminPage.getByRole('button', { name: /^Conectar$|^Connect$/i }).click();

    // 5. Admin assigns "Admin" role to Collab in the confirm modal
    // Wait for modal to appear
    await expect(
      adminPage.locator('text=Configuración del Colaborador').or(adminPage.locator('text=Collaborator Configuration')),
    ).toBeVisible();

    // Click the Admin role button
    await adminPage.getByRole('button', { name: /^Admin$/i }).click();

    // Confirm connection
    await adminPage.getByRole('button', { name: /Sincronizar y Conectar|Synchronize/i }).click();

    // Wait for them to sync
    // The text shows "En línea (Sincronizado)" or "En línea (Sincronizando...)"
    await expect(adminPage.locator('text=/En línea|Online/i').first()).toBeVisible({ timeout: 20000 });

    // 6. Navigate to Inventory
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();

    // 7. Wait for Add Product button and click on both
    const adminAddBtn = adminPage.getByTestId('add-product-button');
    const collabAddBtn = collabPage.getByTestId('add-product-button');

    await expect(adminAddBtn).toBeVisible();
    await expect(collabAddBtn).toBeVisible();

    await adminAddBtn.click();
    await collabAddBtn.click();

    // 8. Fill the forms
    // Admin product
    await adminPage.getByTestId('product-name-input').fill('Product Added By Admin');
    await adminPage.getByTestId('product-quantity-input').fill('10');
    await adminPage.getByTestId('product-price-input').fill('100');
    await adminPage.getByTestId('product-cost-input').fill('50');

    // Collab product
    await collabPage.getByTestId('product-name-input').fill('Product Added By Collab');
    await collabPage.getByTestId('product-quantity-input').fill('5');
    await collabPage.getByTestId('product-price-input').fill('50');
    await collabPage.getByTestId('product-cost-input').fill('25');

    // 9. Submit simultaneously
    const adminSaveBtn = adminPage.getByTestId('save-product-button');
    const collabSaveBtn = collabPage.getByTestId('save-product-button');

    await Promise.all([adminSaveBtn.click(), collabSaveBtn.click()]);

    // 10. Verify both products appear on their own browsers first
    await expect(adminPage.locator('text=Product Added By Admin').first()).toBeVisible();
    await expect(collabPage.locator('text=Product Added By Collab').first()).toBeVisible();

    // 11. Verify cross-sync
    await expect(adminPage.locator('text=Product Added By Collab').first()).toBeVisible({ timeout: 15000 });
    await expect(collabPage.locator('text=Product Added By Admin').first()).toBeVisible({ timeout: 15000 });
  });
});
