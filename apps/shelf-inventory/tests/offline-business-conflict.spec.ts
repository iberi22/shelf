import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { connectPeers, expectProductSync, getLocalPeerId } from './p2p-helpers';

test.describe('Offline Business Conflict Resolution', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test('Two offline terminals sell same item → sync triggers conflict review & can be resolved', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await setupPage(adminPage);
    await setupPage(collabPage);

    // Make sure we set the peer status in settings
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    const collabId = await getLocalPeerId(collabPage);
    const adminId = await getLocalPeerId(adminPage);

    // Ensure they both have autoApplyProductUpdates is true
    for (const page of [adminPage, collabPage]) {
      await expect
        .poll(
          async () => {
            return page.evaluate(() => (window as any)._dbSyncForTest?.isReady);
          },
          { timeout: 15000 },
        )
        .toBe(true);

      await page.evaluate(() => {
        const dbSync = (window as any)._dbSyncForTest;
        if (dbSync) {
          const config = dbSync.getInventoryConfig() || {
            variantAttributes: ['Color', 'Medida'],
            fields: [],
            measureOptions: [],
            productHistoryLimit: 5,
          };
          dbSync.setInventoryConfig({
            ...config,
            autoApplyProductUpdates: true,
          });
        }
      });
    }

    // Connect peers
    await connectPeers(adminPage, collabId);

    // Wait for bidirectional connection (isPeerConnected) on both pages
    await expect
      .poll(
        async () => {
          return adminPage.evaluate((targetPeerId: string) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, collabId);
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await expect
      .poll(
        async () => {
          return collabPage.evaluate((targetPeerId: string) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(targetPeerId));
          }, adminId);
        },
        { timeout: 30000 },
      )
      .toBe(true);

    // Settle connection
    await adminPage.waitForTimeout(2000);
    await collabPage.waitForTimeout(2000);

    // Admin creates product 'Conflict Stock Product' with stock = 1
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(adminPage);
    await adminPage.waitForTimeout(1000);

    await adminPage.locator('[data-testid="add-product-button"]').click();
    await expect(adminPage.getByTestId('product-form')).toBeVisible();
    await adminPage.getByTestId('product-name-input').fill('Conflict Stock Product');
    await adminPage.getByTestId('product-price-input').fill('100');
    await adminPage.getByTestId('product-cost-input').fill('40');
    await adminPage.getByTestId('product-quantity-input').fill('1');
    await adminPage.getByTestId('save-product-button').click();
    await expect(adminPage.getByTestId('product-form')).toBeHidden({ timeout: 10000 });

    // Wait for product to sync to Collab
    await expectProductSync(collabPage, adminPage, 'Conflict Stock Product');

    // Get the product ID
    const productId = await adminPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      return dbSync?.getState()?.products?.find((p: any) => p.name === 'Conflict Stock Product')?.id;
    });
    expect(productId).toBeTruthy();

    // Now partition them (force offline on both pages)
    await adminPage.evaluate(() => {
      (window as any)._p2pManagerForTest?.disconnect();
    });
    await collabPage.evaluate(() => {
      (window as any)._p2pManagerForTest?.disconnect();
    });

    // Settle offline states
    await adminPage.waitForTimeout(1000);
    await collabPage.waitForTimeout(1000);

    // ─── ADMIN OFFLINE SALE ───
    await adminPage.locator('[data-testid="nav-item-nav.sales"]').last().click();
    await dismissModals(adminPage);
    await adminPage.locator('[data-testid="add-sale-button"]').click();
    await expect(adminPage.getByTestId('sale-form')).toBeVisible();
    await adminPage.locator('[data-testid="add-sale-item-button"]').click();
    await adminPage.locator('[data-testid="sale-item-product-0"]').selectOption(productId);
    await adminPage.locator('[data-testid="sale-item-quantity-0"]').fill('1');
    await adminPage.locator('[data-testid="save-sale-button"]').click();
    await expect(adminPage.getByTestId('sale-form')).toBeHidden({ timeout: 10000 });

    // ─── COLLAB OFFLINE SALE ───
    await collabPage.locator('[data-testid="nav-item-nav.sales"]').last().click();
    await dismissModals(collabPage);
    await collabPage.locator('[data-testid="add-sale-button"]').click();
    await expect(collabPage.getByTestId('sale-form')).toBeVisible();
    await collabPage.locator('[data-testid="add-sale-item-button"]').click();
    await collabPage.locator('[data-testid="sale-item-product-0"]').selectOption(productId);
    await collabPage.locator('[data-testid="sale-item-quantity-0"]').fill('1');
    await collabPage.locator('[data-testid="save-sale-button"]').click();
    await expect(collabPage.getByTestId('sale-form')).toBeHidden({ timeout: 10000 });

    // Verify local stocks are 0 on both pages before reconnecting
    const adminStockBefore = await adminPage.evaluate((id: string) => {
      return (window as any)._dbSyncForTest?.getState()?.products?.find((p: any) => p.id === id)?.quantity;
    }, productId);
    const collabStockBefore = await collabPage.evaluate((id: string) => {
      return (window as any)._dbSyncForTest?.getState()?.products?.find((p: any) => p.id === id)?.quantity;
    }, productId);

    expect(adminStockBefore).toBe(0);
    expect(collabStockBefore).toBe(0);

    // Reconnect peers
    await connectPeers(adminPage, collabId);

    // Wait for sync to propagate and trigger business conflicts (negative stock)
    await expect
      .poll(
        async () => {
          // Request full sync to speed up propagation
          await adminPage.evaluate(() => (window as any)._p2pManagerForTest?.requestFullSync?.());
          await collabPage.evaluate(() => (window as any)._p2pManagerForTest?.requestFullSync?.());
          await adminPage.waitForTimeout(500);

          return adminPage.evaluate(() => {
            const dbSync = (window as any)._dbSyncForTest;
            return dbSync?.getState()?.sales?.length;
          });
        },
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(2);

    // Let's expand P2P panel on admin to look for conflict alert
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    const isExpanded = await adminPage.locator('[data-testid="local-peer-id-display"]').isVisible().catch(() => false);
    if (!isExpanded) {
      await adminPage.locator('[data-testid="p2p-status-toggle"]').click();
    }

    // Expect negative stock alert to be visible
    await expect(adminPage.locator('[data-testid="negative-stock-alert"]')).toBeVisible({ timeout: 15000 });

    // Open Stock Resolver modal
    await adminPage.locator('[data-testid="resolve-stock-conflicts-btn"]').click();

    // Verify modal is open and shows conflict product group
    await expect(adminPage.locator(`[data-testid="stock-conflict-group-${productId}::base"]`)).toBeVisible();

    // Verify adjust stock Option works (Setting stock to 5)
    await adminPage.locator(`[data-testid="adjust-stock-input-${productId}::base"]`).fill('5');
    await adminPage.locator(`[data-testid="adjust-stock-btn-${productId}::base"]`).click();

    // Verify negative stock alert has disappeared
    await expect(adminPage.locator('[data-testid="negative-stock-alert"]')).toBeHidden({ timeout: 10000 });

    // Verify product stock is now updated to 5
    const finalStock = await adminPage.evaluate((id: string) => {
      return (window as any)._dbSyncForTest?.getState()?.products?.find((p: any) => p.id === id)?.quantity;
    }, productId);
    expect(finalStock).toBe(5);

    await adminContext.close();
    await collabContext.close();
  });
});
