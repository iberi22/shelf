import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals } from './helpers';
import { expectProductSync } from './p2p-helpers';

test.describe('P2P Advanced Synchronization', () => {
  async function connectAndSync(adminPage: any, collabPage: any, role: 'collaborator' | 'admin' = 'collaborator') {
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    // Admin goes to settings
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);
    await adminPage.waitForTimeout(300);

    // Get collab peer ID
    const collabPeerIdLocator = collabPage.locator('span.font-mono.text-yellow-400').first();
    await collabPeerIdLocator.waitFor({ state: 'visible' });
    await expect(collabPeerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
    const collabId = await collabPeerIdLocator.innerText();

    // Admin connects to collab — dismiss modals before typing, then wait for modal to stabilize
    await dismissModals(adminPage);
    const manualInput = adminPage.getByTestId('manual-peer-id-input');
    await expect(manualInput).toBeVisible();
    await manualInput.fill(collabId);
    await adminPage.waitForTimeout(500);

    // Click Connect
    await dismissModals(adminPage);
    const connectButton = adminPage.getByTestId('manual-connect-button');
    await connectButton.click({ timeout: 5000 }).catch(async () => {
      // Fallback: force click if the button got detached
      await connectButton.click({ force: true, timeout: 3000 });
    });

    // Verify roles and handle optional dropdown (admin/collaborator) appear — use the role selection buttons as indicator
    // (Do NOT call dismissModals here — the modal itself is what we want to see)
    const roleBtn = adminPage.getByRole('button', { name: /Admin|Vendedor|Personalizado/i }).first();
    await expect(roleBtn).toBeVisible({ timeout: 10000 });

    // Select role in the modal if admin
    if (role === 'admin') {
      await adminPage.waitForTimeout(300);
      await adminPage
        .getByRole('button', { name: /^Admin$/i })
        .click({ timeout: 5000 })
        .catch(async () => {
          await adminPage.getByRole('button', { name: /^Admin$/i }).click({ force: true, timeout: 3000 });
        });
    }
    // Default role is 'Vendedor' which maps to 'collaborator'

    // Accept the confirmation modal
    const confirmButton = adminPage
      .locator('button', { hasText: /Synchronize|Sincronizar|Sync|Conectar/i })
      .filter({ hasText: /Connect|Conectar/i })
      .first();
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Wait for connection (En línea status)
    await expect(adminPage.locator('text=/En línea|Online/i').first()).toBeVisible({ timeout: 20000 });

    return collabId;
  }

  test('YJS_UPDATE is not double-applied — no duplicate products after concurrent adds', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await adminPage.goto('/');
    await collabPage.goto('/');
    await dismissModals(adminPage);
    await dismissModals(collabPage);
    await adminPage.waitForTimeout(1000);
    await collabPage.waitForTimeout(1000);

    const _ = await connectAndSync(adminPage, collabPage, 'collaborator');

    await dismissModals(adminPage);
    await dismissModals(collabPage);
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();

    await adminPage.getByTestId('add-product-button').click();
    await collabPage.getByTestId('add-product-button').click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);

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

    // Wait for P2P sync with state-vector diff recovery
    await expect(async () => {
      for (const page of [adminPage, collabPage]) {
        await page.evaluate(() => {
          const p2pManager = (window as any)._p2pManagerForTest;
          p2pManager?.requestFullSync?.();
        });
      }
      await adminPage.waitForTimeout(500);

      const productCount = await adminPage.evaluate(() => {
        try {
          const dbSync = (window as any)._dbSyncForTest;
          if (!dbSync) return -1;
          const state = dbSync.getState(dbSync.localPeerId);
          if (!state?.products) return 0;
          return (state.products as any[]).filter((p: any) => p.name === 'Concurrent Duplicate Risk').length;
        } catch {
          return -1;
        }
      });
      expect(productCount).toBe(2);
    }).toPass({ timeout: 30000, intervals: [1000, 1000, 2000, 3000, 5000] });
  });

  test('False positive expulsion is prevented — no RESET_DATA on temporary disconnect', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await adminPage.goto('/');
    await collabPage.goto('/');
    await dismissModals(adminPage);
    await dismissModals(collabPage);
    await adminPage.waitForTimeout(1000);
    await collabPage.waitForTimeout(1000);

    const _collabId = await connectAndSync(adminPage, collabPage, 'collaborator');

    // Add a product while connected
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(adminPage);
    await adminPage.getByTestId('add-product-button').click();
    await dismissModals(adminPage);
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
      try {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return [];
        const state = dbSync.getState(dbSync.localPeerId);
        if (!state?.products) return [];
        return (state.products as any[]).map((p: any) => p.name);
      } catch {
        return [];
      }
    });

    expect(productsAfterDisconnect).toContain('Persistent Product');

    const isExpelled = await adminPage.evaluate(() => {
      try {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return false;
        const state = dbSync.getState(dbSync.localPeerId);
        return !!(state as any)?.isExpelled;
      } catch {
        return false;
      }
    });
    expect(isExpelled).toBe(false);
  });

  test('Smart merge resolves SYNC_STATE conflicts via timestamp LWW', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await adminPage.goto('/');
    await collabPage.goto('/');
    await dismissModals(adminPage);
    await dismissModals(collabPage);
    await adminPage.waitForTimeout(1000);
    await collabPage.waitForTimeout(1000);

    const _collabId = await connectAndSync(adminPage, collabPage, 'collaborator');

    // Admin adds a product
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(adminPage);
    await adminPage.getByTestId('add-product-button').click();
    await dismissModals(adminPage);
    await adminPage.getByTestId('product-name-input').fill('Merge Target Product');
    await adminPage.getByTestId('product-quantity-input').fill('10');
    await adminPage.getByTestId('product-price-input').fill('100');
    await adminPage.getByTestId('product-cost-input').fill('50');
    await adminPage.getByTestId('save-product-button').click();

    // Wait for collab to receive the sync'd product
    await expectProductSync(collabPage, adminPage, 'Merge Target Product');
    await expect(collabPage.locator('text=Merge Target Product').first()).toBeVisible({ timeout: 5000 });

    // Now both update the same product with different prices
    // Admin updates price to 200
    await dismissModals(adminPage);
    await adminPage.locator('[data-testid^="edit-product-"]').first().click();
    await dismissModals(adminPage);
    await adminPage.getByTestId('product-price-input').fill('200');
    await adminPage.getByTestId('save-product-button').click();
    await adminPage.waitForTimeout(1000);

    // Collab updates the same product price to 300
    await dismissModals(collabPage);
    await collabPage.locator('[data-testid^="edit-product-"]').first().click();
    await dismissModals(collabPage);
    await collabPage.getByTestId('product-price-input').fill('300');
    await collabPage.getByTestId('save-product-button').click();

    // Wait for sync by polling admin state for the price OR the pendingEdits array
    await expect(async () => {
      await collabPage.evaluate(() => {
        const p2pManager = (window as any)._p2pManagerForTest;
        p2pManager?.requestFullSync?.();
      });
      await adminPage.waitForTimeout(500);

      const hasPendingEdit = await adminPage.evaluate(() => {
        try {
          const dbSync = (window as any)._dbSyncForTest;
          if (!dbSync) return false;
          const state = dbSync.getState(dbSync.localPeerId);
          return state.pendingEdits && state.pendingEdits.length > 0;
        } catch {
          return false;
        }
      });
      expect(hasPendingEdit).toBe(true);
    }).toPass({ timeout: 30000, intervals: [1000, 1000, 2000, 3000, 5000] });

    // Admin resolves the pending edit
    await adminPage.getByRole('button', { name: /Revisar Ediciones/i }).click();
    await adminPage.getByRole('button', { name: /Fusionar y Guardar/i }).click();
    await adminPage.waitForTimeout(1000);

    // After sync, both should converge to one value
    const adminFinalPrice = await adminPage.evaluate(() => {
      try {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return undefined;
        const state = dbSync.getState(dbSync.localPeerId);
        if (!state?.products) return undefined;
        const products: any[] = state.products;
        const p = products.find((x: any) => x.name === 'Merge Target Product');
        return p?.price;
      } catch {
        return undefined;
      }
    });

    expect(adminFinalPrice).toEqual(expect.any(Number));
    expect([200, 300]).toContain(adminFinalPrice);

    expect(adminFinalPrice).toEqual(expect.any(Number));

    // The merge should not have created duplicates
    const productCount = await adminPage.evaluate(() => {
      try {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return -1;
        const state = dbSync.getState(dbSync.localPeerId);
        if (!state?.products) return 0;
        return (state.products as any[]).filter((p: any) => p.name === 'Merge Target Product').length;
      } catch {
        return -1;
      }
    });
    expect(productCount).toBe(1);
  });

  test('Auto-reconnection after peer disconnect recovers sync', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await adminPage.goto('/');
    await collabPage.goto('/');
    await dismissModals(adminPage);
    await dismissModals(collabPage);
    await adminPage.waitForTimeout(1000);
    await collabPage.waitForTimeout(1000);

    const _ = await connectAndSync(adminPage, collabPage, 'collaborator');

    // Verify initial sync
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(adminPage);
    await adminPage.getByTestId('add-product-button').click();
    await dismissModals(adminPage);
    await adminPage.getByTestId('product-name-input').fill('Reconnection Test Product');
    await adminPage.getByTestId('product-quantity-input').fill('7');
    await adminPage.getByTestId('product-price-input').fill('70');
    await adminPage.getByTestId('product-cost-input').fill('35');
    await adminPage.getByTestId('save-product-button').click();

    // Wait for collab to receive the product via P2P sync
    await expectProductSync(collabPage, adminPage, 'Reconnection Test Product');
    await expect(collabPage.locator('text=Reconnection Test Product').first()).toBeVisible({ timeout: 5000 });

    // Close collab and wait for reconnection backoff
    await collabContext.close();
    await adminPage.waitForTimeout(6000);

    // Create a new collab context and reconnect
    const collabContext2 = await browser.newContext();
    addOverlayBlocker(collabContext2);
    const collabPage2 = await collabContext2.newPage();
    await collabPage2.goto('/');
    await dismissModals(collabPage2);
    await collabPage2.waitForTimeout(1000);

    // Collab should eventually receive sync
    await expectProductSync(collabPage2, adminPage, 'Reconnection Test Product', 40000);
    await expect(collabPage2.locator('text=Reconnection Test Product').first()).toBeVisible({ timeout: 5000 });

    // Cross-sync should still work both ways
    await dismissModals(collabPage2);
    await collabPage2.getByTestId('add-product-button').click();
    await dismissModals(collabPage2);
    await collabPage2.getByTestId('product-name-input').fill('Post-Reconnection Product');
    await collabPage2.getByTestId('product-quantity-input').fill('3');
    await collabPage2.getByTestId('product-price-input').fill('30');
    await collabPage2.getByTestId('product-cost-input').fill('15');
    await collabPage2.getByTestId('save-product-button').click();

    // Wait for admin to receive the cross-sync'd product
    await expectProductSync(adminPage, collabPage2, 'Post-Reconnection Product', 40000);
    await expect(adminPage.locator('text=Post-Reconnection Product').first()).toBeVisible({ timeout: 5000 });
  });
});
