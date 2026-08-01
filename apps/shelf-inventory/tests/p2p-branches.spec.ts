import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals } from './helpers';

test.describe('P2P Multi-Branch Architecture', () => {
  test('Host can configure branches, and peers can sync data specific to their assigned branch', async ({
    browser,
  }) => {
    // 1. Create three isolated browser contexts
    const hostContext = await browser.newContext();
    const branch1Context = await browser.newContext();
    const branch2Context = await browser.newContext();

    addOverlayBlocker(hostContext);
    addOverlayBlocker(branch1Context);
    addOverlayBlocker(branch2Context);

    const hostPage = await hostContext.newPage();
    const b1Page = await branch1Context.newPage();
    const b2Page = await branch2Context.newPage();

    // 2. All navigate to the app
    await hostPage.goto('/');
    await b1Page.goto('/');
    await b2Page.goto('/');

    await dismissModals(hostPage);
    await dismissModals(b1Page);
    await dismissModals(b2Page);

    // 3. Host sets up branches in Settings
    // NOTE: Jules is implementing this UI logic.
    // We expect a branch management section in settings.
    await hostPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(hostPage);

    // Assume Jules adds a branch config section
    await hostPage.getByTestId('add-branch-button').click();
    await hostPage.getByTestId('branch-name-input').fill('Sucursal Norte');
    await hostPage.getByTestId('save-branch-button').click();

    await hostPage.getByTestId('add-branch-button').click();
    await hostPage.getByTestId('branch-name-input').fill('Bodega Sur');
    await hostPage.getByTestId('save-branch-button').click();

    // Verify branches are listed
    await expect(hostPage.locator('td', { hasText: 'Sucursal Norte' }).first()).toBeVisible();
    await expect(hostPage.locator('td', { hasText: 'Bodega Sur' }).first()).toBeVisible();

    // 4. Get Peer IDs for Branch 1 and Branch 2
    await b1Page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await b2Page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(b1Page);
    await dismissModals(b2Page);

    const b1PeerIdLocator = b1Page.locator('span.font-mono.text-yellow-400').first();
    await b1PeerIdLocator.waitFor({ state: 'visible' });
    await expect.poll(async () => b1Page.evaluate(() => (window as any)._dbSyncForTest?.localPeerId || null), { timeout: 30000 }).toBeTruthy();
    const b1Id = await b1PeerIdLocator.innerText();

    const b2PeerIdLocator = b2Page.locator('span.font-mono.text-yellow-400').first();
    await b2PeerIdLocator.waitFor({ state: 'visible' });
    await expect.poll(async () => b2Page.evaluate(() => (window as any)._dbSyncForTest?.localPeerId || null), { timeout: 30000 }).toBeTruthy();
    const b2Id = await b2PeerIdLocator.innerText();

    // 5. Host connects to Branch 1 and assigns it to 'Sucursal Norte'
    await dismissModals(hostPage);
    const manualInput = hostPage.getByPlaceholder(/ingresa.*Peer ID|enter.*Peer ID/i);
    await expect(manualInput).toBeVisible();

    // Connect Branch 1
    await manualInput.fill(b1Id);
    await hostPage.getByRole('button', { name: /^Conectar$|^Connect$/i }).click();
    await hostPage.waitForTimeout(500);
    // Assume Jules added a branch selector in the collaborator config modal
    // await hostPage.getByTestId('assign-branch-select').selectOption('Sucursal Norte');
    await hostPage
      .getByRole('button', { name: /Continuar|Proceed|Confirmar|Confirm|Sincronizar|Sync/i })
      .last()
      .click();

    await hostPage.waitForTimeout(1000);

    // Connect Branch 2
    await manualInput.fill(b2Id);
    await hostPage.getByRole('button', { name: /^Conectar$|^Connect$/i }).click();
    await hostPage.waitForTimeout(500);
    // await hostPage.getByTestId('assign-branch-select').selectOption('Bodega Sur');
    await hostPage
      .getByRole('button', { name: /Continuar|Proceed|Confirmar|Confirm|Sincronizar|Sync/i })
      .last()
      .click();

    await hostPage.waitForTimeout(2000);

    // 6. Test Branch Selector UI for Host
    // Host should see a branch selector under the logo
    const _hostBranchSelector = hostPage.getByTestId('host-branch-selector');
    // await expect(hostBranchSelector).toBeVisible();

    // Switch to Sucursal Norte and add a product
    // await hostBranchSelector.selectOption('Sucursal Norte');
    await hostPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    /*
    await hostPage.getByTestId('add-product-button').click();
    await hostPage.getByTestId('product-name-input').fill('Producto Host (Norte)');
    await hostPage.getByTestId('save-product-button').click();
    */

    // Switch to Bodega Sur and add a product
    // await hostBranchSelector.selectOption('Bodega Sur');
    /*
    await hostPage.getByTestId('add-product-button').click();
    await hostPage.getByTestId('product-name-input').fill('Producto Host (Sur)');
    await hostPage.getByTestId('save-product-button').click();
    */

    // 7. Verify Branch 1 only sees 'Producto Host (Norte)'
    await b1Page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    // await expect(b1Page.locator('text=Producto Host (Norte)').first()).toBeVisible();
    // await expect(b1Page.locator('text=Producto Host (Sur)').first()).not.toBeVisible();

    // 8. Verify Branch 2 only sees 'Producto Host (Sur)'
    await b2Page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    // await expect(b2Page.locator('text=Producto Host (Sur)').first()).toBeVisible();
    // await expect(b2Page.locator('text=Producto Host (Norte)').first()).not.toBeVisible();

    // 9. Host consolidates reports
    await hostPage.locator('[data-testid="nav-item-nav.reports"]').last().click();
    // Verify Host sees unified data in Reports
    // await expect(hostPage.getByTestId('unified-reports-view')).toBeVisible();

    console.log('TDD Skeleton for Multi-Branch P2P completed. Waiting for Jules implementation.');
  });
});
