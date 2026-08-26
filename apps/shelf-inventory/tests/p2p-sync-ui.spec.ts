import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { connectPeers, getLocalPeerId } from './p2p-helpers';

test.describe('P2P UI Sync Features', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test('should link two devices using programmatic API and sync a new branch', async ({ browser }) => {
    // We use two different contexts to simulate two different devices
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    addOverlayBlocker(context1);
    addOverlayBlocker(context2);

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Setup Admin (Device 1)
    await setupPage(page1);
    await dismissModals(page1);
    await page1.getByTestId('nav-item-nav.settings').last().click();

    // Get Admin's Peer ID using helper
    const adminPeerId = await getLocalPeerId(page1);
    expect(adminPeerId).toBeTruthy();

    // Setup Client (Device 2)
    await setupPage(page2);
    await dismissModals(page2);

    // Navigate to Settings on Device 2
    await page2.getByTestId('nav-item-nav.settings').last().click();

    // Get Device 2's peer ID
    const clientPeerId = await getLocalPeerId(page2);
    expect(clientPeerId).toBeTruthy();

    // Connect programmatically — Device 2 connects to Device 1 (admin)
    await connectPeers(page2, adminPeerId, 30000);

    // Verify connection on both sides
    await expect
      .poll(
        async () =>
          page1.evaluate(() => {
            const db = (window as any)._dbSyncForTest;
            return db?.getLinkedNodes?.()?.length || 0;
          }),
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(1);

    await expect
      .poll(
        async () =>
          page2.evaluate(() => {
            return Boolean(
              (window as any)._p2pManagerForTest?.isPeerConnected((window as any)._dbSyncForTest?.localPeerId),
            );
          }),
        { timeout: 30000 },
      )
      .toBe(true);

    // Now let's create a branch on Device 1
    await page1.getByTestId('nav-item-nav.settings').last().click();
    await page1.getByTestId('add-branch-button').click();
    await page1.getByTestId('branch-name-input').fill('Sucursal P2P');
    await page1.getByTestId('branch-address-input').fill('123 P2P Ave');
    await page1.getByTestId('branch-type-select').selectOption('sucursal');
    await page1.getByTestId('save-branch-button').click();

    // Verify it appeared in Device 1
    await expect(page1.locator('td').filter({ hasText: 'Sucursal P2P' }).first()).toBeVisible();

    // Verify the branch synced to Device 2 via CRDT sync
    await expect(page2.locator('td').filter({ hasText: 'Sucursal P2P' }).first()).toBeVisible({ timeout: 15000 });

    await context1.close();
    await context2.close();
  });

  test('should reflect offline writes instantly via CRDT (unidirectional reactive, SHELF-103)', async ({ page }) => {
    // Single device with NO peers connected — validates the local CRDT apply
    // path: a UI mutation must reach the Yjs doc and the React projection
    // without any P2P round-trip, and CRDT state must match the UI.
    await setupPage(page);
    await dismissModals(page);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    const productName = `Offline CRDT ${Date.now()}`;
    await page.getByTestId('add-product-button').click();
    await expect(page.getByTestId('product-form')).toBeVisible();
    await page.getByTestId('product-name-input').fill(productName);
    await page.getByTestId('product-quantity-input').fill('7');
    await page.getByTestId('product-price-input').fill('99');
    await page.getByTestId('save-product-button').click();

    // 1) The Yjs CRDT map must contain the product IMMEDIATELY after the save
    //    click (synchronously applied to the local doc — no sync wait).
    const crdtSnapshot = (await page.evaluate((name) => {
      const db = (window as any)._dbSyncForTest;
      const map = db?.doc?.getMap?.('products');
      if (!map) return null;
      const product = Array.from(map.values?.() || []).find((p: any) => p?.name === name);
      return product ? { id: product.id, name: product.name, quantity: product.quantity, price: product.price } : null;
    }, productName)) as { id: string; name: string; quantity: number; price: number } | null;
    expect(crdtSnapshot).toEqual({
      id: expect.any(String),
      name: productName,
      quantity: 7,
      price: 99,
    });

    // 2) React state is a read-only projection of the CRDT doc → must agree.
    const reactProjection = await page.evaluate((name) => {
      const state = (window as any).__shelfAppStateForTest;
      const product = state?.products?.find((p: any) => p?.name === name);
      return product ? { id: product.id, name: product.name, quantity: product.quantity } : null;
    }, productName);
    expect(reactProjection).toEqual({
      id: crdtSnapshot?.id,
      name: productName,
      quantity: 7,
    });

    // 3) The offline-created product is visible in the UI.
    await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 5000 });

    // 4) CRDT id and UI projection id are the same entity.
    await expect
      .poll(async () =>
        page.evaluate((id) => {
          const state = (window as any).__shelfAppStateForTest;
          return state?.products?.some((p: any) => p?.id === id);
        }, crdtSnapshot?.id as string),
      )
      .toBe(true);
  });
});
