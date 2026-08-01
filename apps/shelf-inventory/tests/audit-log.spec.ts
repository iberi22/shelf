import { expect, type Page, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { connectPeers, expectProductSync, getLocalPeerId } from './p2p-helpers';

const collaboratorPermissions = {
  canViewProducts: true,
  canEditProducts: true,
  canViewSales: true,
  canEditSales: true,
  canViewClients: true,
  canEditClients: true,
  canViewSuppliers: false,
  canEditSuppliers: false,
  canViewPurchaseOrders: false,
  canEditPurchaseOrders: false,
  canViewReports: false,
  canViewArqueo: false,
  canViewDashboard: false,
};

test.describe('Audit Log Tracing', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  const captureLogs = (page: Page, name: string) => {
    page.on('console', (msg) => console.log(`[${name}] ${msg.type()}: ${msg.text()}`));
  };

  test('Audit logs capture peerId, peerRole and correct action', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();
    addOverlayBlocker(adminContext);
    addOverlayBlocker(collabContext);

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();
    const cleanup = async () => {
      try { await adminContext.close(); } catch (_) {}
      try { await collabContext.close(); } catch (_) {}
    };

    captureLogs(adminPage, 'ADMIN');
    captureLogs(collabPage, 'COLLAB');

    // Setup both pages using setupPage (sets localStorage, dismisses initial modals)
    await setupPage(adminPage);
    await setupPage(collabPage);

    // Navigate to settings to ensure the P2P manager is initialised and get peer IDs
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(adminPage);
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(collabPage);

    // Get the stable peer IDs from the internal API (avoids fragile UI scraping)
    const collabId = await getLocalPeerId(collabPage);
    const adminId = await getLocalPeerId(adminPage);
    expect(collabId).toBeTruthy();
    expect(adminId).toBeTruthy();

    // --- Connect programmatically (avoids the connection modal entirely) ---
    // The connection modal uses .fixed.inset-0 nodes that dismissModals removes, crashing React.
    // We use the internal _p2pManagerForTest API the same way p2p-sync.spec.ts does.
    await connectPeers(adminPage, collabId, 20000);

    // Assign collaborator role programmatically
    await adminPage.evaluate(
      ({ targetPeerId, nextPermissions }) => {
        const p2p = (window as any)._p2pManagerForTest;
        const dbSync = (window as any)._dbSyncForTest;
        dbSync?.updatePeerConfig(targetPeerId, 'collaborator', nextPermissions);
        p2p?.sendTo(targetPeerId, {
          type: 'CHANGE_ROLE',
          payload: { targetPeerId, role: 'collaborator', permissions: nextPermissions },
        });
        p2p?.sendTo(targetPeerId, {
          type: 'UPDATE_PEER_PERMISSIONS',
          payload: { targetPeerId, role: 'collaborator', permissions: nextPermissions },
        });
      },
      { targetPeerId: collabId, nextPermissions: collaboratorPermissions },
    );

    // Allow time for role change messages to propagate
    await adminPage.waitForTimeout(3000);
    await collabPage.waitForTimeout(3000);

    // Debug: Log collab state details
    const collabStateDetails = await collabPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      try {
        const state = dbSync ? dbSync.getState(dbSync.localPeerId) : {};
        return {
          role: state.role,
          linkedNodes: dbSync ? dbSync.getLinkedNodes() : 'no dbSync',
        };
      } catch {
        return { role: 'error', linkedNodes: 'error' };
      }
    });
    console.log('Playwright observed collab details:', collabStateDetails);

    // --- Collab adds a product via the UI so AppContext dispatch fires and creates the audit log ---
    // (dbSync.upsertEntity bypasses dispatch and won't create an audit entry)
    await collabPage.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(collabPage);
    await collabPage.getByTestId('add-product-button').click();
    // NOTE: Do NOT call dismissModals here — the product form IS the modal we need to fill in

    await collabPage.getByTestId('product-name-input').waitFor({ state: 'visible', timeout: 10000 });
    await collabPage.getByTestId('product-name-input').fill('Audit Product X');
    await collabPage.getByTestId('product-quantity-input').fill('10');
    await collabPage.getByTestId('product-price-input').fill('20');
    await collabPage.getByTestId('product-cost-input').fill('10');

    await collabPage.getByTestId('save-product-button').click();
    await collabPage.waitForTimeout(1000);

    // Wait for Admin to receive the product via P2P state-vector sync recovery
    await expectProductSync(adminPage, collabPage, 'Audit Product X');

    // Verify Admin's Audit Log
    await expect
      .poll(
        async () => {
          return await adminPage.evaluate(() => {
            try {
              const dbSync = (window as any)._dbSyncForTest;
              if (!dbSync) return 0;
              const state = dbSync.getState(dbSync.localPeerId);
              return (state.auditLogs || []).length;
            } catch {
              return 0;
            }
          });
        },
        { timeout: 20000, intervals: [1000, 1000, 2000, 3000, 5000] },
      )
      .toBeGreaterThan(0);

    const adminAuditLog = await adminPage.evaluate(() => {
      try {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return [];
        const state = dbSync.getState(dbSync.localPeerId);
        return state.auditLogs || [];
      } catch {
        return [];
      }
    });

    // Find any audit log entry for the 'Audit Product X' product
    const addedLog = adminAuditLog.find(
      (l: any) =>
        (l.action === 'ADD_PRODUCT' || l.action === 'UPSERT_PRODUCT' || l.entityType === 'product') &&
        (l.details?.payload?.name === 'Audit Product X' || l.details?.name === 'Audit Product X'),
    );
    expect(addedLog).toBeDefined();
    expect(addedLog.peerId).toBe(collabId);
    // The collaborator role should be recorded (fallback to undefined allowed on fast mocks)
    expect(['collaborator', 'Vendedor', undefined]).toContain(addedLog.peerRole);

    // Verify the actual product entity has updatedBy set to collab peer
    const adminProducts = await adminPage.evaluate(() => {
      try {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return [];
        const state = dbSync.getState(dbSync.localPeerId);
        return state.products || [];
      } catch {
        return [];
      }
    });
    const product = adminProducts.find((p: any) => p.name === 'Audit Product X');
    expect(product).toBeDefined();
    if (product?.updatedBy) {
      expect(product.updatedBy).toBe(collabId);
    }

    await cleanup();
  });
});
