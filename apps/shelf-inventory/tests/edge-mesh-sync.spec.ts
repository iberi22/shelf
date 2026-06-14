import { expect, type Page, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';
import {
  applyRemoteEdgeMeshUpdate,
  expectAppStateEntity,
  expectEdgeMeshEntity,
  expectEdgeMeshReady,
  exportEdgeMeshUpdate,
  getAppStateEntities,
  getEdgeMeshEntities,
  upsertEdgeMeshEntity,
} from './p2p-helpers';

async function openSettingsWithEdgeMesh(page: Page) {
  await setupPage(page);
  await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
  await dismissModals(page);
  await expectEdgeMeshReady(page);
}

async function getPeerId(page: Page) {
  const peerIdLocator = page.locator('span.font-mono.text-yellow-400').first();
  await peerIdLocator.waitFor({ state: 'visible' });
  await expect(peerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
  return page.evaluate(() => (window as any)._dbSyncForTest?.localPeerId);
}

test.describe('Edge Mesh workflow synchronization and data security', () => {
  test('applies exported Edge Mesh CRDT updates in a second browser', async ({ browser }) => {
    const sourceContext = await browser.newContext();
    const targetContext = await browser.newContext();
    const sourcePage = await sourceContext.newPage();
    const targetPage = await targetContext.newPage();

    await openSettingsWithEdgeMesh(sourcePage);
    await openSettingsWithEdgeMesh(targetPage);

    const targetPeerId = await getPeerId(targetPage);
    const product = {
      id: 'edge-product-001',
      name: 'Edge Mesh Product',
      sku: 'EDGE-001',
      quantity: 12,
      price: 42,
      cost: 21,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: targetPeerId,
      updatedByRole: 'admin',
    };

    await upsertEdgeMeshEntity(sourcePage, 'products', product.id, product);
    const update = await exportEdgeMeshUpdate(sourcePage);
    await applyRemoteEdgeMeshUpdate(targetPage, targetPeerId, update);

    await expectEdgeMeshEntity(targetPage, 'products', (items) =>
      items.some((item) => item.id === product.id && item.name === product.name),
    );
    await expectAppStateEntity(targetPage, 'products', (items) =>
      items.some((item) => item.id === product.id && item.name === product.name),
    );

    const status = await targetPage.evaluate(() => (window as any).__shelfEdgeMeshStatus);
    expect(status.enabled).toBe(true);
    expect(status.totalItems).toBeGreaterThan(0);

    await sourceContext.close();
    await targetContext.close();
  });

  test('blocks unauthorized remote Edge Mesh mutations of restricted collections', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await openSettingsWithEdgeMesh(page);

    const attackerContext = await browser.newContext();
    const attackerPage = await attackerContext.newPage();
    await openSettingsWithEdgeMesh(attackerPage);

    const supplier = {
      id: 'blocked-supplier-001',
      name: 'Blocked Supplier',
      phone: '555-0000',
      email: 'blocked@example.com',
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: 'unknown-attacker',
      updatedByRole: 'collaborator',
    };

    const auditLog = {
      id: 'blocked-audit-001',
      action: 'ELEVATE_PRIVILEGES',
      timestamp: new Date().toISOString(),
      peerId: 'unknown-attacker',
      peerRole: 'collaborator',
    };

    await upsertEdgeMeshEntity(attackerPage, 'suppliers', supplier.id, supplier);
    await upsertEdgeMeshEntity(attackerPage, 'auditLogs', auditLog.id, auditLog);
    const maliciousUpdate = await exportEdgeMeshUpdate(attackerPage);

    await applyRemoteEdgeMeshUpdate(page, 'unknown-attacker', maliciousUpdate);

    await expect
      .poll(
        async () => {
          const suppliers = await getAppStateEntities(page, 'suppliers');
          const edgeSuppliers = await getEdgeMeshEntities(page, 'suppliers');
          const auditLogs = await getAppStateEntities(page, 'auditLogs');
          const edgeAuditLogs = await getEdgeMeshEntities(page, 'auditLogs');

          return (
            suppliers.some((item) => item.id === supplier.id) ||
            edgeSuppliers.some((item) => item.id === supplier.id) ||
            auditLogs.some((item) => item.id === auditLog.id) ||
            edgeAuditLogs.some((item) => item.id === auditLog.id)
          );
        },
        { timeout: 8000, intervals: [500, 1000, 1500, 2000] },
      )
      .toBe(false);

    await attackerContext.close();
    await context.close();
  });
});
