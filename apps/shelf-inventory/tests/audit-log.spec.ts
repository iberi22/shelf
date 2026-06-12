import { expect, type Page, test } from '@playwright/test';

test.describe('Audit Log Tracing', () => {
  const captureLogs = (page: Page, name: string) => {
    page.on('console', (msg) => console.log(`[${name}] ${msg.type()}: ${msg.text()}`));
  };

  test('Audit logs capture peerId, peerRole and correct action', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    captureLogs(adminPage, 'ADMIN');
    captureLogs(collabPage, 'COLLAB');

    const initScript = `
      localStorage.setItem('hasVisited', 'true');
      localStorage.setItem('shelfWelcomeSeen', 'true');
    `;
    await adminContext.addInitScript(initScript);
    await collabContext.addInitScript(initScript);

    // Setup Admin
    await adminPage.goto('/');
    await adminPage.waitForTimeout(2000); // Give it a sec to render
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    const masterPeerIdLocator = adminPage.locator('span.font-mono.text-yellow-400').first();
    await masterPeerIdLocator.waitFor({ state: 'visible' });
    await expect(masterPeerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
    const _masterId = await masterPeerIdLocator.innerText();

    // Setup Collab
    await collabPage.goto('/');
    await collabPage.waitForTimeout(2000);
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    const collabPeerIdLocator = collabPage.locator('span.font-mono.text-yellow-400').first();
    await collabPeerIdLocator.waitFor({ state: 'visible' });
    await expect(collabPeerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
    const collabId = await collabPeerIdLocator.innerText();

    // Connect Admin to Collab (since we are in Settings)
    const manualInput = adminPage.getByPlaceholder(/ingresa el Peer ID|enter Peer ID/i);
    await expect(manualInput).toBeVisible();
    await manualInput.fill(collabId);

    await adminPage.getByRole('button', { name: /^Conectar$|^Connect$/i }).click();

    // Admin assigns "Collaborator" role to Collab in the confirm modal
    await expect(
      adminPage.locator('text=Configuración del Colaborador').or(adminPage.locator('text=Collaborator Configuration')),
    ).toBeVisible();

    // Click the Collaborator role button (it should be the default, but we ensure it's selected)
    // Actually the default is collaborator, but let's click it to be safe if possible, or just sync
    // The button might be name: /^Colaborador$/i
    await adminPage.getByRole('button', { name: /Sincronizar y Conectar|Synchronize/i }).click();

    // Wait for them to sync
    await expect(adminPage.locator('text=/En línea|Online/i').first()).toBeVisible({ timeout: 20000 });

    // Debug Collab's Role before action
    const collabStateDetails = await collabPage.evaluate(() => {
      const state = (window as any)._shelfStateForTest || JSON.parse(localStorage.getItem('shelfState') || '{}');
      const _p2pManager = (window as any)._p2pManagerForTest;
      const dbSync = (window as any)._dbSyncForTest;
      return {
        role: state.role,
        linkedNodes: dbSync ? dbSync.getLinkedNodes() : 'no dbSync',
      };
    });
    console.log('Playwright observed collab details:', collabStateDetails);

    // Collab adds a product
    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await collabPage.getByTestId('add-product-button').click();

    await collabPage.getByTestId('product-name-input').fill('Audit Product X');
    await collabPage.getByTestId('product-quantity-input').fill('10');
    await collabPage.getByTestId('product-price-input').fill('20');
    await collabPage.getByTestId('product-cost-input').fill('10');

    await collabPage.getByTestId('save-product-button').click();
    await collabPage.waitForTimeout(1000);

    // Verify Admin receives the product
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await expect(adminPage.locator('text=Audit Product X').first()).toBeVisible({ timeout: 15000 });

    // Verify Admin's Audit Log
    // We check the local storage state directly and wait for it
    await expect
      .poll(
        async () => {
          return await adminPage.evaluate(() => {
            const state = (window as any)._shelfStateForTest || JSON.parse(localStorage.getItem('shelfState') || '{}');
            console.log('Test evaluate state:', Object.keys(state), state.auditLogs?.length);
            return (state.auditLogs || []).length;
          });
        },
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);

    const adminAuditLog = await adminPage.evaluate(() => {
      const state = (window as any)._shelfStateForTest || JSON.parse(localStorage.getItem('shelfState') || '{}');
      return state.auditLogs || [];
    });

    const addedLog = adminAuditLog.find(
      (l: any) => l.action === 'ADD_PRODUCT' && l.details?.payload?.name === 'Audit Product X',
    );
    expect(addedLog).toBeDefined();
    expect(addedLog.peerId).toBe(collabId);
    expect(addedLog.peerRole).toBe('collaborator');

    // Verify the actual product entity has updatedByRole
    const adminProducts = await adminPage.evaluate(() => {
      const state = (window as any)._shelfStateForTest || JSON.parse(localStorage.getItem('shelfState') || '{}');
      return state.products || [];
    });
    const product = adminProducts.find((p: any) => p.name === 'Audit Product X');
    expect(product).toBeDefined();
    expect(product.updatedBy).toBe(collabId);
    expect(product.updatedByRole).toBe('collaborator');
  });
});
