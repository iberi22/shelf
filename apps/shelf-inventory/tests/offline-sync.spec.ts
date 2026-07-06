import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { expectProductSync, getLocalPeerId } from './p2p-helpers';

test.describe('Offline Product Creation and Sync', () => {
  test.setTimeout(120000);

  test('offline-created products sync when the peer reconnects', async ({ browser }) => {
    // 1. Open two browser contexts (Admin A, Admin B)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    addOverlayBlocker(contextA);
    addOverlayBlocker(contextB);

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await setupPage(pageA);
    await setupPage(pageB);

    // 2. Navigate to Settings to ensure P2P manager is initialized
    await pageA.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await pageB.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(pageA);
    await dismissModals(pageB);

    // 3. Connect them via P2P
    const peerIdB = await getLocalPeerId(pageB);
    await pageA.evaluate((id) => {
      (window as any)._p2pManagerForTest?.connect(id);
    }, peerIdB);

    // Verify connection
    await expect
      .poll(
        async () => {
          return pageA.evaluate(() => {
            return (window as any)._dbSyncForTest?.getLinkedNodes()?.length || 0;
          });
        },
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(1);

    await expect
      .poll(
        async () => {
          return pageB.evaluate(() => {
            return (window as any)._dbSyncForTest?.getLinkedNodes()?.length || 0;
          });
        },
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(1);

    // 4. Take Admin B offline
    await contextB.setOffline(true);

    // 5. Admin B creates a product via the UI
    await pageB.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(pageB);

    await pageB.getByTestId('add-product-button').click();
    await expect(pageB.getByTestId('product-form')).toBeVisible();
    await pageB.waitForTimeout(500); // Stabilize DOM after modal open

    await pageB.getByTestId('product-name-input').fill('Offline Product');
    await pageB.getByTestId('product-sku-input').fill('OFFLINE-001');
    await pageB.getByTestId('product-price-input').fill('100');
    await pageB.getByTestId('product-quantity-input').fill('50');
    await pageB.getByTestId('save-product-button').click();

    // Verify product is created locally on B
    await expect(pageB.locator('text=Offline Product')).toBeVisible({ timeout: 15000 });

    // 6. Bring Admin B back online
    await contextB.setOffline(false);

    // 7. Verify the product syncs to Admin A
    await pageA.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(pageA);

    await expectProductSync(pageA, pageB, 'Offline Product');
  });
});
