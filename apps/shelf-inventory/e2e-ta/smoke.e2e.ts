import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test.describe('Smoke tests for shelf-inventory', () => {
  const productName = `Product ${Date.now()}`;

  test.beforeEach(async ({ browser }) => {
    await browser.addInitScript(() => {
      (window as any).__E2E_TEST__ = true;
      localStorage.setItem('hasVisited', 'true');
      localStorage.setItem('shelfWelcomeSeen', 'true');
      localStorage.setItem('hasCompletedOnboarding', 'true');
    });
  });

  test('app shell opens', async ({ app, screen }) => {
    // landing skipped in test mode
    await app.open('/?testMode=true');
    await expect(screen.getByRole('heading', 'Dashboard')).toBeVisible({ timeout: 15000 });
  });

  test('create a product and see it in the list', async ({ app, screen }) => {
    await app.open('/?testMode=true');
    await screen.getByTestId('nav-item-nav.inventory').tap();
    await screen.getByTestId('add-product-button').tap();
    await expect(screen.getByTestId('product-form')).toBeVisible();

    await screen.getByTestId('product-name-input').fill(productName);
    await screen.getByTestId('product-quantity-input').fill('25');
    await screen.getByTestId('product-price-input').fill('200');
    await screen.getByTestId('product-cost-input').fill('100');
    await screen.getByTestId('save-product-button').tap();

    await expect(screen.getByRole('cell', { name: productName }).first()).toBeVisible({ timeout: 15000 });
  });

  test('edit the product and the change persists after reload', async ({ app, screen, browser }) => {
    await app.open('/?testMode=true');
    await screen.getByTestId('nav-item-nav.inventory').tap();

    const editProductName = `Edit Product ${Date.now()}`;
    await screen.getByTestId('add-product-button').tap();
    await expect(screen.getByTestId('product-form')).toBeVisible();
    await screen.getByTestId('product-name-input').fill(editProductName);
    await screen.getByTestId('product-quantity-input').fill('10');
    await screen.getByTestId('product-price-input').fill('200');
    await screen.getByTestId('product-cost-input').fill('100');
    await screen.getByTestId('save-product-button').tap();
    await expect(screen.getByRole('cell', { name: editProductName }).first()).toBeVisible({ timeout: 15000 });

    const productId = await browser.evaluate((name) => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.find((item: any) => item.name === name)?.id;
    }, editProductName);

    await screen.getByTestId(`edit-product-${productId}`).first().tap();
    await expect(screen.getByTestId('product-form')).toBeVisible();
    await screen.getByTestId('product-quantity-input').fill('25');
    await screen.getByTestId('save-product-button').tap();

    // The edited quantity (25) is shown in the product's row after saving.
    const updatedRow = screen.getByRole('row').filter({ hasText: editProductName });
    await expect(updatedRow.getByRole('cell', '25')).toHaveText('25', { timeout: 15000 });

    // Reload
    await browser.reload();

    // The edited quantity (25) survived the reload.
    await screen.getByTestId('nav-item-nav.inventory').tap();
    const persistedRow = screen.getByRole('row').filter({ hasText: editProductName });
    await expect(persistedRow.getByRole('cell', '25')).toHaveText('25', { timeout: 15000 });
  });

  test('delete the product', async ({ app, screen, browser }) => {
    const deleteProductName = `Delete Product ${Date.now()}`;
    await app.open('/?testMode=true');
    await screen.getByTestId('nav-item-nav.inventory').tap();
    await screen.getByTestId('add-product-button').tap();
    await expect(screen.getByTestId('product-form')).toBeVisible();
    await screen.getByTestId('product-name-input').fill(deleteProductName);
    await screen.getByTestId('product-quantity-input').fill('10');
    await screen.getByTestId('product-price-input').fill('200');
    await screen.getByTestId('product-cost-input').fill('100');
    await screen.getByTestId('save-product-button').tap();
    await expect(screen.getByRole('cell', { name: deleteProductName }).first()).toBeVisible({ timeout: 15000 });

    const productId = await browser.evaluate((name) => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.products?.find((item: any) => item.name === name)?.id;
    }, deleteProductName);

    const dialogSub = browser.onDialog('accept');
    await screen.getByTestId(`delete-product-${productId}`).first().tap();
    await dialogSub;

    await expect(screen.getByRole('cell', { name: deleteProductName }).first()).toBeHidden({ timeout: 15000 });
  });

  test('settings page opens', async ({ app, screen }) => {
    await app.open('/?testMode=true');
    await screen.getByTestId('nav-item-nav.settings').tap();
    await expect(screen.getByTestId('settings-data-card')).toBeVisible({ timeout: 15000 });
  });

  test('offline indicator reacts to the browser offline/online events', async ({ app, screen, browser }) => {
    await browser.addInitScript(() => {
      const now = new Date().toISOString();
      localStorage.setItem(
        'guest_user',
        JSON.stringify({ uid: 'guest_offline_p2p', email: null, subscriptionTier: 'pyme', isGuest: true }),
      );
      localStorage.setItem(
        'shelfState',
        JSON.stringify({
          products: [
            {
              id: 'prod-offline-1',
              name: 'Offline Local Product',
              sku: 'OFF-P2P-001',
              quantity: 5,
              price: 9,
              cost: 3,
              isActive: true,
              updatedBy: 'local',
              updatedAt: now,
            },
          ],
          sales: [],
          clients: [],
          suppliers: [],
          purchaseOrders: [],
          peers: [],
          teamMembers: [],
          localPeerId: 'peer_offline_p2p',
          role: 'admin',
          arqueoSessions: [],
        }),
      );
    });

    await app.open('/?testMode=true');
    await expect(screen.getByTestId('nav-item-nav.inventory')).toBeVisible({ timeout: 15000 });

    // This journey only dispatches the browser `offline`/`online` events. It does
    // NOT cut the network: real offline behaviour is covered by the repo's
    // Playwright specs (see README).
    // Re-dispatch until the app has mounted its window listeners.
    await expect
      .poll(
        async () => {
          await browser.evaluate(() => window.dispatchEvent(new Event('offline')));
          return screen.getByTestId('offline-banner').count();
        },
        { timeout: 15000, message: 'offline-banner did not appear after the offline event' },
      )
      .toBeGreaterThan(0);
    await expect(screen.getByTestId('offline-indicator')).toBeVisible({ timeout: 15000 });

    // The offline UX recovers when the browser reports it is online again.
    await browser.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(screen.getByTestId('offline-banner')).toBeHidden({ timeout: 15000 });

    // The locally seeded inventory still renders.
    await screen.getByTestId('nav-item-nav.inventory').tap();
    await expect(screen.getByRole('cell', { name: 'Offline Local Product' }).first()).toBeVisible({ timeout: 15000 });
  });
});
