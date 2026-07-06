import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';
import { expectProductPriceSync, expectProductSync, getLocalPeerId } from './p2p-helpers';

test.describe('Multi-Peer E2E Synchronization', () => {
  test.setTimeout(120000);

  test('Peer A creates a product, Peer B syncs, Peer B edits, Peer A syncs', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    await setupPage(adminPage);
    await setupPage(collabPage);

    // Navigate to settings to ensure P2PSyncManager is mounted
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    // Get Peer IDs
    const collabId = await getLocalPeerId(collabPage);

    // Connect Peer A to Peer B
    await adminPage.evaluate((targetPeerId: string) => {
      (window as any)._p2pManagerForTest?.connect(targetPeerId);
    }, collabId);

    // Wait for connection
    await expect
      .poll(
        async () => {
          return adminPage.evaluate(() => {
            const dbSync = (window as any)._dbSyncForTest;
            return dbSync ? dbSync.getLinkedNodes()?.length : 0;
          });
        },
        { timeout: 15000 },
      )
      .toBeGreaterThanOrEqual(1);

    // Step 2: Peer A creates a product
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(adminPage);
    await adminPage.waitForTimeout(1000);

    await adminPage.locator('[data-testid="add-product-button"]').click();
    await expect(adminPage.getByTestId('product-form')).toBeVisible();
    await adminPage.waitForTimeout(500);
    await adminPage.getByTestId('product-name-input').fill('Multi-Peer Sync Product');
    await adminPage.getByTestId('product-price-input').fill('100');
    await adminPage.getByTestId('product-cost-input').fill('50');
    await adminPage.getByTestId('product-quantity-input').fill('10');
    await adminPage.getByTestId('save-product-button').click();
    await expect(adminPage.getByTestId('product-form')).toBeHidden({ timeout: 10000 });

    // Step 3: Peer B verifies the product was received via sync
    await expectProductSync(adminPage, collabPage, 'Multi-Peer Sync Product');

    // Step 4: Peer B edits the product
    const productId = await collabPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync?.getState(dbSync.localPeerId);
      return state?.products?.find((p: any) => p.name === 'Multi-Peer Sync Product')?.id;
    });
    expect(productId).toBeTruthy();

    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await collabPage.waitForTimeout(500);
    await collabPage.locator(`[data-testid="edit-product-${productId}"]:visible`).click();
    await expect(collabPage.getByTestId('product-form')).toBeVisible();
    await collabPage.getByTestId('product-price-input').fill('250');
    await collabPage.getByTestId('save-product-button').click();

    // Step 5: Peer A verifies the update
    await expectProductPriceSync(adminPage, collabPage, 'Multi-Peer Sync Product', 250);

    // Cleanup
    await adminContext.close();
    await collabContext.close();
  });
});
