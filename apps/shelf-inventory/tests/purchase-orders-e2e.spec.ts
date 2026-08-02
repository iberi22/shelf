import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

/**
 * Purchase Orders E2E — receive stock increments inventory (closes #355)
 */

async function waitForDbSync(page: import('@playwright/test').Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const dbSync = (window as unknown as { _dbSyncForTest?: unknown })._dbSyncForTest;
          return !!dbSync;
        }),
      { timeout: 20_000, intervals: [200, 500, 1000] },
    )
    .toBe(true);
}

async function getProductQuantity(page: import('@playwright/test').Page, productName: string): Promise<number | null> {
  return page.evaluate((name) => {
    const dbSync = (window as unknown as { _dbSyncForTest?: any })._dbSyncForTest;
    if (!dbSync) return null;
    const state = dbSync.getState?.(dbSync.localPeerId) ?? dbSync.getState?.();
    const product = state?.products?.find(
      (p: { name: string; isActive?: boolean }) => p.name === name && p.isActive !== false,
    );
    if (!product) return null;
    if (typeof product.quantity === 'number') return product.quantity;
    const variants = product.variants as Array<{ quantity?: number }> | undefined;
    if (variants?.length) {
      return variants.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0);
    }
    return null;
  }, productName);
}

test.describe('Purchase Orders E2E — receive stock', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      (window as unknown as { __E2E_TEST__: boolean }).__E2E_TEST__ = true;
      localStorage.setItem('hasVisited', 'true');
      localStorage.setItem('shelfWelcomeSeen', 'true');
    });
    await setupPage(page);
    await waitForDbSync(page);
  });

  test('receive stock increments product inventory', async ({ page }) => {
    const productName = 'PO Receive Stock Product';
    const supplierName = 'PO Receive Supplier';
    const initialQty = 10;
    const receiveQty = 5;

    const ids = await page.evaluate(
      ({ productName: pName, supplierName: sName, initialQty: qty }) => {
        const dbSync = (window as unknown as { _dbSyncForTest: any })._dbSyncForTest;
        const productId = `po-recv-product-${Date.now()}`;
        const supplierId = `po-recv-supplier-${Date.now()}`;
        const now = new Date().toISOString();
        dbSync.upsertEntity('products', {
          id: productId,
          name: pName,
          sku: `PO-RECV-${Date.now()}`,
          quantity: qty,
          price: 100,
          cost: 40,
          isActive: true,
          updatedAt: now,
          updatedBy: dbSync.localPeerId || 'local',
          variants: [
            {
              id: `${productId}-v0`,
              label: 'Default',
              sku: `PO-RECV-${Date.now()}-V0`,
              quantity: qty,
              price: 100,
              cost: 40,
              attributes: {},
              updatedAt: now,
              updatedBy: dbSync.localPeerId || 'local',
            },
          ],
        });
        dbSync.upsertEntity('suppliers', {
          id: supplierId,
          name: sName,
          phone: '3001234567',
          email: 'po-receive@example.com',
          isActive: true,
          updatedAt: now,
          updatedBy: dbSync.localPeerId || 'local',
        });
        return { productId, supplierId };
      },
      { productName, supplierName, initialQty },
    );

    await expect.poll(async () => getProductQuantity(page, productName)).toBe(initialQty);

    page.once('dialog', (dialog) => dialog.accept());

    await page.locator('[data-testid="nav-item-nav.purchases"]').last().click();
    await dismissModals(page);

    await page.getByTestId('add-purchase-order-button').click();
    await expect(page.getByTestId('purchase-order-form')).toBeVisible();

    await page.getByTestId('purchase-order-supplier-select').selectOption(ids.supplierId);
    await page.getByTestId('purchase-order-item-product-0').selectOption(ids.productId);
    await page.getByTestId('purchase-order-item-quantity-0').fill(String(receiveQty));
    await page.getByTestId('purchase-order-item-cost-0').fill('40');
    await page.getByTestId('save-purchase-order-button').click();

    await expect(page.getByTestId('purchase-order-form')).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(supplierName).first()).toBeVisible({ timeout: 15_000 });

    const markReceived = page.getByTestId('po-mark-received').first();
    await expect(markReceived).toBeVisible({ timeout: 10_000 });
    await markReceived.click();

    await expect
      .poll(async () => getProductQuantity(page, productName), {
        timeout: 20_000,
        intervals: [300, 500, 1000],
      })
      .toBe(initialQty + receiveQty);
  });
});
