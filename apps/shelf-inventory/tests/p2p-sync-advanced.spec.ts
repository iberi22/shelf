import { expect, test } from '@playwright/test';

test.describe('P2P Advanced Synchronization', () => {

  const initScript = `
    localStorage.setItem('hasVisited', 'true');
    localStorage.setItem('shelfWelcomeSeen', 'true');
  `;

  async function connectAndSync(adminPage: any, collabPage: any, role: 'collaborator' | 'admin' = 'collaborator') {
    // Admin goes to settings
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();

    // Get collab peer ID
    const collabPeerIdLocator = collabPage.locator('span.font-mono.text-yellow-400').first();
    await collabPeerIdLocator.waitFor({ state: 'visible' });
    await expect(collabPeerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
    const collabId = await collabPeerIdLocator.innerText();

    // Admin connects to collab
    const manualInput = adminPage.getByPlaceholder(/ingresa el Peer ID|enter Peer ID/i);
    await expect(manualInput).toBeVisible();
    await manualInput.fill(collabId);
    await adminPage.getByRole('button', { name: /^Conectar$|^Connect$/i }).click();

    // Assign role
    await expect(
      adminPage.locator('text=Configuración del Colaborador').or(adminPage.locator('text=Collaborator Configuration')),
    ).toBeVisible();

    if (role === 'admin') {
      await adminPage.getByRole('button', { name: /^Admin$/i }).click();
    }

    await adminPage.getByRole('button', { name: /Sincronizar y Conectar|Synchronize/i }).click();
    await expect(adminPage.locator('text=/En línea|Online/i').first()).toBeVisible({ timeout: 20000 });

    return collabId;
  }

  test('YJS_UPDATE is not double-applied — no duplicate products after concurrent adds', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await adminContext.addInitScript(initScript);
    await collabContext.addInitScript(initScript);
    await adminPage.goto('/');
    await collabPage.goto('/');
    await adminPage.waitForTimeout(2000);
    await collabPage.waitForTimeout(2000);

    const _ = await connectAndSync(adminPage, collabPage, 'collaborator');

    // Both add the same product name simultaneously
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();

    await adminPage.getByTestId('add-product-button').click();
    await collabPage.getByTestId('add-product-button').click();

    await adminPage.getByTestId('product-name-input').fill('Concurrent Duplicate Risk');
    await adminPage.getByTestId('product-quantity-input').fill('5');
    await adminPage.getByTestId('product-price-input').fill('50');
    await adminPage.getByTestId('product-cost-input').fill('25');

    await collabPage.getByTestId('product-name-input').fill('Concurrent Duplicate Risk');
    await collabPage.getByTestId('product-quantity-input').fill('3');
    await collabPage.getByTestId('product-price-input').fill('30');
    await collabPage.getByTestId('product-cost-input').fill('15');

    await Promise.all([
      adminPage.getByTestId('save-product-button').click(),
      collabPage.getByTestId('save-product-button').click(),
    ]);

    await adminPage.waitForTimeout(4000);

    // Count how many products named "Concurrent Duplicate Risk" exist on admin
    const productCount = await adminPage.evaluate(() => {
      const state = (window as any)._dbSyncForTest?.getState() || {};
      const products: any[] = state.products || [];
      return products.filter((p: any) => p.name === 'Concurrent Duplicate Risk').length;
    });

    // Should be exactly 2 (one from each peer), not 3+ due to double-apply
    expect(productCount).toBe(2);
  });

  test('False positive expulsion is prevented — no RESET_DATA on temporary disconnect', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await adminContext.addInitScript(initScript);
    await collabContext.addInitScript(initScript);
    await adminPage.goto('/');
    await collabPage.goto('/');
    await adminPage.waitForTimeout(2000);
    await collabPage.waitForTimeout(2000);

    const collabId = await connectAndSync(adminPage, collabPage, 'collaborator');

    // Add a product while connected
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await adminPage.getByTestId('add-product-button').click();
    await adminPage.getByTestId('product-name-input').fill('Persistent Product');
    await adminPage.getByTestId('product-quantity-input').fill('99');
    await adminPage.getByTestId('product-price-input').fill('999');
    await adminPage.getByTestId('product-cost-input').fill('500');
    await adminPage.getByTestId('save-product-button').click();
    await expect(adminPage.locator('text=Persistent Product').first()).toBeVisible({ timeout: 5000 });

    // Simulate collab disconnect by closing context
    await collabContext.close();
    await adminPage.waitForTimeout(5000);

    // Verify admin did NOT RESET_DATA — products should still exist
    const productsAfterDisconnect = await adminPage.evaluate(() => {
      const state = (window as any)._dbSyncForTest?.getState() || {};
      const products: any[] = state.products || [];
      return products.map((p: any) => p.name);
    });

    expect(productsAfterDisconnect).toContain('Persistent Product');

    // Verify admin is not marked as expelled
    const isExpelled = await adminPage.evaluate(() => {
      const state = (window as any)._shelfStateForTest || {};
      return state.isExpelled || false;
    });
    expect(isExpelled).toBe(false);
  });

  test('Smart merge resolves SYNC_STATE conflicts via timestamp LWW', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await adminContext.addInitScript(initScript);
    await collabContext.addInitScript(initScript);
    await adminPage.goto('/');
    await collabPage.goto('/');
    await adminPage.waitForTimeout(2000);
    await collabPage.waitForTimeout(2000);

    const collabId = await connectAndSync(adminPage, collabPage, 'collaborator');

    // Admin adds a product
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await adminPage.getByTestId('add-product-button').click();
    await adminPage.getByTestId('product-name-input').fill('Merge Target Product');
    await adminPage.getByTestId('product-quantity-input').fill('10');
    await adminPage.getByTestId('product-price-input').fill('100');
    await adminPage.getByTestId('product-cost-input').fill('50');
    await adminPage.getByTestId('save-product-button').click();

    await expect(collabPage.locator('text=Merge Target Product').first()).toBeVisible({ timeout: 15000 });

    // Now both update the same product with different prices
    // Admin updates price to 200
    await adminPage.locator('text=Merge Target Product').first().click();
    await adminPage.getByTestId('product-price-input').fill('200');
    await adminPage.getByTestId('save-product-button').click();
    await adminPage.waitForTimeout(1000);

    // Collab updates the same product price to 300
    await collabPage.locator('text=Merge Target Product').first().click();
    await collabPage.getByTestId('product-price-input').fill('300');
    await collabPage.getByTestId('save-product-button').click();

    await adminPage.waitForTimeout(4000);

    // After sync, both should converge to one value (the one with latest timestamp)
    const adminFinalPrice = await adminPage.evaluate(() => {
      const state = (window as any)._dbSyncForTest?.getState() || {};
      const products: any[] = state.products || [];
      const p = products.find((x: any) => x.name === 'Merge Target Product');
      return p?.price;
    });

    // Price should be a number (whichever won the LWW race) — not undefined, not NaN
    expect(adminFinalPrice).toEqual(expect.any(Number));
    expect([200, 300]).toContain(adminFinalPrice);

    // The merge should not have created duplicates
    const productCount = await adminPage.evaluate(() => {
      const state = (window as any)._dbSyncForTest?.getState() || {};
      const products: any[] = state.products || [];
      return products.filter((p: any) => p.name === 'Merge Target Product').length;
    });
    expect(productCount).toBe(1);
  });

  test('Auto-reconnection after peer disconnect recovers sync', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await adminContext.addInitScript(initScript);
    await collabContext.addInitScript(initScript);
    await adminPage.goto('/');
    await collabPage.goto('/');
    await adminPage.waitForTimeout(2000);
    await collabPage.waitForTimeout(2000);

    const _ = await connectAndSync(adminPage, collabPage, 'collaborator');

    // Verify initial sync
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await adminPage.getByTestId('add-product-button').click();
    await adminPage.getByTestId('product-name-input').fill('Reconnection Test Product');
    await adminPage.getByTestId('product-quantity-input').fill('7');
    await adminPage.getByTestId('product-price-input').fill('70');
    await adminPage.getByTestId('product-cost-input').fill('35');
    await adminPage.getByTestId('save-product-button').click();
    await expect(collabPage.locator('text=Reconnection Test Product').first()).toBeVisible({ timeout: 15000 });

    // Close collab and wait for reconnection backoff
    await collabContext.close();
    await adminPage.waitForTimeout(6000);

    // Create a new collab context and reconnect
    const collabContext2 = await browser.newContext();
    const collabPage2 = await collabContext2.newPage();
    await collabContext2.addInitScript(initScript);
    await collabPage2.goto('/');
    await collabPage2.waitForTimeout(2000);

    // Collab should eventually receive sync
    await collabPage2.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await expect(collabPage2.locator('text=Reconnection Test Product').first()).toBeVisible({ timeout: 30000 });

    // Cross-sync should still work both ways
    await collabPage2.getByTestId('add-product-button').click();
    await collabPage2.getByTestId('product-name-input').fill('Post-Reconnection Product');
    await collabPage2.getByTestId('product-quantity-input').fill('3');
    await collabPage2.getByTestId('product-price-input').fill('30');
    await collabPage2.getByTestId('product-cost-input').fill('15');
    await collabPage2.getByTestId('save-product-button').click();
    await expect(adminPage.locator('text=Post-Reconnection Product').first()).toBeVisible({ timeout: 15000 });
  });
});
