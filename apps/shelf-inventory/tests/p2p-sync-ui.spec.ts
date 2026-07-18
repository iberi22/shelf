import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';
import { getLocalPeerId } from './p2p-helpers';

test.describe('P2P UI Sync Features', () => {
  test.setTimeout(120000);

  test('should link two devices using UI and sync a new branch', async ({ browser }) => {
    // We use two different contexts to simulate two different devices
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Setup Admin (Device 1)
    await setupPage(page1);
    await dismissModals(page1);
    await page1.getByTestId('nav-item-nav.settings').last().click();

    // Get Admin's Peer ID using helper
    const adminPeerId = await getLocalPeerId(page1);
    expect(adminPeerId).toBeTruthy();
    expect(adminPeerId).toBeTruthy();

    // Setup Client (Device 2)
    await setupPage(page2);
    await dismissModals(page2);

    // Navigate to Settings on Device 2
    await page2.getByTestId('nav-item-nav.settings').last().click();

    // Connect to Admin via UI
    await page2.getByTestId('manual-peer-id-input').fill(adminPeerId);
    await page2.getByTestId('manual-connect-button').click();

    // Accept the confirmation modal
    const confirmButton = page2.locator('button', { hasText: /Sincronizar y Conectar/i }).first();
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Verify connection on Device 1 (Admin)
    await expect(page1.locator('strong.text-yellow-400', { hasText: '1' }).first()).toBeVisible({ timeout: 15000 });

    // Now let's create a branch on Device 1
    await page1.getByTestId('nav-item-nav.settings').last().click();
    await page1.getByTestId('add-branch-button').click();
    await page1.getByTestId('branch-name-input').fill('Sucursal P2P');
    await page1.getByTestId('branch-address-input').fill('123 P2P Ave');
    await page1.getByTestId('branch-type-select').selectOption('sucursal');
    await page1.getByTestId('save-branch-button').click();

    // Verify it appeared in Device 1
    await expect(page1.locator('td').filter({ hasText: 'Sucursal P2P' }).first()).toBeVisible();

    // Verify the branch synced to Device 2
    await expect(page2.locator('td').filter({ hasText: 'Sucursal P2P' }).first()).toBeVisible({ timeout: 15000 });

    await context1.close();
    await context2.close();
  });
});
