import { expect, test } from '@playwright/test';
import { expectProductSync } from './p2p-helpers';
import { addOverlayBlocker, dismissModals } from './helpers';

test.describe('P2P Synchronization and Conflict Resolution', () => {
  test('Two browsers can connect, assign roles, and simultaneously add products without conflicts', async ({
    browser,
  }) => {
    // 1. Create two isolated browser contexts with overlay blocker
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();

    // Both navigate to the app
    await adminPage.goto('/');
    await collabPage.goto('/');
    await dismissModals(adminPage);
    await dismissModals(collabPage);
    await adminPage.waitForTimeout(1000);
    await collabPage.waitForTimeout(1000);

    // Go to settings tab to see the Peer ID
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    // Wait until it's not "Initializing..."
    const collabPeerIdLocator = collabPage.locator('span.font-mono.text-yellow-400').first();
    await collabPeerIdLocator.waitFor({ state: 'visible' });
    await expect(collabPeerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
    const collabId = await collabPeerIdLocator.innerText();
    expect(collabId).toBeTruthy();

    // 4. Admin connects to Collab — dismiss modals before typing, wait for modal to stabilize
    await dismissModals(adminPage);
    const manualInput = adminPage.getByPlaceholder(/ingresa el Peer ID|enter Peer ID/i);
    await expect(manualInput).toBeVisible();
    await manualInput.fill(collabId);
    await adminPage.waitForTimeout(500);

    // Click Connect button — dismiss modals right before to avoid overlay interference
    await dismissModals(adminPage);
    const connectButton = adminPage.getByRole('button', { name: /^Conectar$|^Connect$/i });
    await connectButton.click({ timeout: 5000 }).catch(async () => {
      await connectButton.click({ force: true, timeout: 3000 });
    });

    // 5. Wait for the confirm connection modal to appear
    await adminPage.waitForTimeout(500);
    await dismissModals(adminPage);
    await expect(
      adminPage.locator('text=Configuración del Colaborador').or(adminPage.locator('text=Collaborator Configuration')),
    ).toBeVisible({ timeout: 10000 });

    // Click the Admin role button
    await adminPage.waitForTimeout(300);
    await dismissModals(adminPage);
    await adminPage.getByRole('button', { name: /^Admin$/i }).click({ timeout: 5000 }).catch(async () => {
      await adminPage.getByRole('button', { name: /^Admin$/i }).click({ force: true, timeout: 3000 });
    });

    // Click the confirm/proceed button to initiate the handshake
    await adminPage.waitForTimeout(300);
    await dismissModals(adminPage);
    await adminPage.getByRole('button', { name: /Continuar|Proceed|Confirmar|Confirm/i }).last().click({ timeout: 5000 }).catch(async () => {
      await adminPage.getByRole('button', { name: /Continuar|Proceed|Confirmar|Confirm/i }).last().click({ force: true, timeout: 3000 });
    });

    // Wait for them to sync
    await expect(adminPage.locator('text=/En línea|Online/i').first()).toBeVisible({ timeout: 20000 });

    // 6. Navigate to Inventory
    await dismissModals(adminPage);
    await dismissModals(collabPage);
    await adminPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();

    // 7. Wait for Add Product button and click on both
    const adminAddBtn = adminPage.getByTestId('add-product-button');
    const collabAddBtn = collabPage.getByTestId('add-product-button');

    await expect(adminAddBtn).toBeVisible();
    await expect(collabAddBtn).toBeVisible();

    await adminAddBtn.click();
    await collabAddBtn.click();
    await dismissModals(adminPage);
    await dismissModals(collabPage);

    // 8. Fill the forms
    // Admin product
    await adminPage.getByTestId('product-name-input').fill('Product Added By Admin');
    await adminPage.getByTestId('product-quantity-input').fill('10');
    await adminPage.getByTestId('product-price-input').fill('100');
    await adminPage.getByTestId('product-cost-input').fill('50');

    // Collab product
    await collabPage.getByTestId('product-name-input').fill('Product Added By Collab');
    await collabPage.getByTestId('product-quantity-input').fill('5');
    await collabPage.getByTestId('product-price-input').fill('50');
    await collabPage.getByTestId('product-cost-input').fill('25');

    // 9. Submit simultaneously
    const adminSaveBtn = adminPage.getByTestId('save-product-button');
    const collabSaveBtn = collabPage.getByTestId('save-product-button');

    await Promise.all([adminSaveBtn.click(), collabSaveBtn.click()]);

    // 10. Verify both products appear on their own browsers first
    await expect(adminPage.locator('text=Product Added By Admin').first()).toBeVisible();
    await expect(collabPage.locator('text=Product Added By Collab').first()).toBeVisible();

    // 11. Verify cross-sync — poll with re-broadcast recovery
    await expectProductSync(adminPage, collabPage, 'Product Added By Collab');
    await expectProductSync(collabPage, adminPage, 'Product Added By Admin');

    // Verify DOM visibility on both
    await expect(adminPage.locator('text=Product Added By Admin').first()).toBeVisible();
    await expect(adminPage.locator('text=Product Added By Collab').first()).toBeVisible();
    await expect(collabPage.locator('text=Product Added By Collab').first()).toBeVisible();
    await expect(collabPage.locator('text=Product Added By Admin').first()).toBeVisible();
  });
});
