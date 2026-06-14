import { expect, type Page, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals } from './helpers';
import { expectProductSync } from './p2p-helpers';

test.describe('Audit Log Tracing', () => {
  const captureLogs = (page: Page, name: string) => {
    page.on('console', (msg) => console.log(`[${name}] ${msg.type()}: ${msg.text()}`));
  };

  test('Audit logs capture peerId, peerRole and correct action', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    captureLogs(adminPage, 'ADMIN');
    captureLogs(collabPage, 'COLLAB');

    // Setup Admin
    await adminPage.goto('/');
    await dismissModals(adminPage);
    await adminPage.waitForTimeout(1500);
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    const masterPeerIdLocator = adminPage.locator('span.font-mono.text-yellow-400').first();
    await masterPeerIdLocator.waitFor({ state: 'visible' });
    await expect(masterPeerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
    const _masterId = await masterPeerIdLocator.innerText();

    // Setup Collab
    await collabPage.goto('/');
    await dismissModals(collabPage);
    await collabPage.waitForTimeout(1500);
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(collabPage);
    const collabPeerIdLocator = collabPage.locator('span.font-mono.text-yellow-400').first();
    await collabPeerIdLocator.waitFor({ state: 'visible' });
    await expect(collabPeerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
    const collabId = await collabPeerIdLocator.innerText();

    // Connect Admin to Collab (since we are in Settings)
    await dismissModals(adminPage);
    await dismissModals(collabPage);
    const manualInput = adminPage.getByPlaceholder(/ingresa el Peer ID|enter Peer ID/i);
    await expect(manualInput).toBeVisible();
    await manualInput.fill(collabId);
    await adminPage.waitForTimeout(500);

    // Click Connect button
    await adminPage.getByRole('button', { name: /^Conectar$|^Connect$/i }).click();

    // Wait for the confirm connection modal to appear — use the role selection buttons as indicator
    // (Do NOT call dismissModals here — the modal itself is what we want to see)
    const roleButton = adminPage.getByRole('button', { name: /Admin|Vendedor|Personalizado/i }).first();
    await expect(roleButton).toBeVisible({ timeout: 10000 });

    // The default role is "Vendedor" which maps to "collaborator". No need to click a role button.

    // Click the confirm/proceed button to initiate the handshake ("Synchronize & Connect" / "Sincronizar y Conectar")
    await adminPage.waitForTimeout(300);
    const proceedBtn = adminPage.getByRole('button', { name: /Synchronize|Sincronizar|Sync|Conectar/i }).last();
    await proceedBtn.click({ timeout: 5000 }).catch(async () => {
      await proceedBtn.click({ force: true, timeout: 3000 });
    });

    // Wait for them to sync (En línea status)
    await expect(adminPage.locator('text=/En línea|Online/i').first()).toBeVisible({ timeout: 20000 });

    // Debug Collab's Role before action
    const collabStateDetails = await collabPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      try {
        const state = dbSync ? dbSync.getState(dbSync.localPeerId) : {};
        return {
          role: state.role,
          linkedNodes: dbSync ? dbSync.getLinkedNodes() : 'no dbSync',
        };
      } catch {
        return { role: 'error', linkedNodes: 'error' };
      }
    });
    console.log('Playwright observed collab details:', collabStateDetails);

    // Collab adds a product
    await dismissModals(collabPage);
    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(collabPage);
    await collabPage.getByTestId('add-product-button').click();
    await dismissModals(collabPage);

    await collabPage.getByTestId('product-name-input').fill('Audit Product X');
    await collabPage.getByTestId('product-quantity-input').fill('10');
    await collabPage.getByTestId('product-price-input').fill('20');
    await collabPage.getByTestId('product-cost-input').fill('10');

    await collabPage.getByTestId('save-product-button').click();

    // Wait for Admin to receive the product via P2P sync with re-broadcast recovery
    await expectProductSync(adminPage, collabPage, 'Audit Product X');
    await expect(adminPage.locator('text=Audit Product X').first()).toBeVisible({ timeout: 5000 });

    // Verify Admin's Audit Log
    // Wait for audit logs via _dbSyncForTest
    await expect
      .poll(
        async () => {
          return await adminPage.evaluate(() => {
            try {
              const dbSync = (window as any)._dbSyncForTest;
              if (!dbSync) return 0;
              const state = dbSync.getState(dbSync.localPeerId);
              return (state.auditLogs || []).length;
            } catch {
              return 0;
            }
          });
        },
        { timeout: 20000, intervals: [1000, 1000, 2000, 3000, 5000] },
      )
      .toBeGreaterThan(0);

    const adminAuditLog = await adminPage.evaluate(() => {
      try {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return [];
        const state = dbSync.getState(dbSync.localPeerId);
        return state.auditLogs || [];
      } catch {
        return [];
      }
    });

    const addedLog = adminAuditLog.find(
      (l: any) => l.action === 'ADD_PRODUCT' && l.details?.payload?.name === 'Audit Product X',
    );
    expect(addedLog).toBeDefined();
    expect(addedLog.peerId).toBe(collabId);
    expect(addedLog.peerRole).toBe('collaborator');

    // Verify the actual product entity has updatedByRole
    const adminProducts = await adminPage.evaluate(() => {
      try {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return [];
        const state = dbSync.getState(dbSync.localPeerId);
        return state.products || [];
      } catch {
        return [];
      }
    });
    const product = adminProducts.find((p: any) => p.name === 'Audit Product X');
    expect(product).toBeDefined();
    if (product.updatedBy) {
      expect(product.updatedBy).toBe(collabId);
      expect(product.updatedByRole).toBe('collaborator');
    }
  });
});
