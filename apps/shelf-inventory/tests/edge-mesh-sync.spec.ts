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

    const sourcePeerId = await getPeerId(sourcePage);
    const targetPeerId = await getPeerId(targetPage);
    expect(sourcePeerId).toBeTruthy();
    expect(targetPeerId).toBeTruthy();

    // Authorize source on target as a verified product/client editor (remote authz path).
    await targetPage.evaluate((srcId: string) => {
      const db = (window as any)._dbSyncForTest;
      if (!db) return;
      const perms = {
        canViewProducts: true,
        canEditProducts: true,
        canViewSales: true,
        canEditSales: true,
        canViewClients: true,
        canEditClients: true,
        canViewSuppliers: true,
        canEditSuppliers: true,
        canViewPurchaseOrders: true,
        canEditPurchaseOrders: true,
        canViewReports: true,
        canViewArqueo: true,
        canViewDashboard: true,
      };
      db.updateLinkedNode(
        srcId,
        { role: 'admin', isMaster: true, dsaPublicKey: 'src-key', permissions: perms },
        db.localPeerId,
      );
      db.updateEphemeralNode(srcId, { status: 'verified', dsaPublicKey: 'src-key' });
      db.setMasterPeerId(srcId);
    }, sourcePeerId as string);

    const client = {
      id: 'edge-client-001',
      name: 'Edge Mesh Client',
      email: 'edge@example.com',
      phone: '555-0000',
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: sourcePeerId,
      updatedByRole: 'admin',
    };

    await upsertEdgeMeshEntity(sourcePage, 'clients', client.id, client);
    // Confirm source sees the entity before export
    await expectEdgeMeshEntity(sourcePage, 'clients', (items) =>
      items.some((item) => item.id === client.id && item.name === client.name),
    );
    const update = await exportEdgeMeshUpdate(sourcePage, 'clients');
    console.log(`Edge Mesh CRDT Update Size: ${update.length} bytes`);
    expect(update.length).toBeGreaterThan(0);

    // Apply as remote verified source peer (exercises applyUpdate trust gate + shared doc)
    await targetPage.evaluate(
      ({ data, srcId }) => {
        const db = (window as any)._dbSyncForTest;
        // Force trust metadata on the live singleton right before apply
        db.updateLinkedNode(
          srcId,
          {
            role: 'collaborator',
            isMaster: false,
            dsaPublicKey: 'src-key',
            permissions: {
              canViewProducts: true,
              canEditProducts: true,
              canViewSales: true,
              canEditSales: true,
              canViewClients: true,
              canEditClients: true,
              canViewSuppliers: true,
              canEditSuppliers: true,
              canViewPurchaseOrders: true,
              canEditPurchaseOrders: true,
              canViewReports: true,
              canViewArqueo: true,
              canViewDashboard: true,
            },
          },
          db.localPeerId,
        );
        db.updateEphemeralNode(srcId, { status: 'verified', dsaPublicKey: 'src-key' });
        db.applyUpdate(new Uint8Array(data), srcId);
      },
      { data: update, srcId: sourcePeerId as string },
    );

    const probe = await targetPage.evaluate((clientId: string) => {
      const db = (window as any)._dbSyncForTest;
      const fromDb = db ? Array.from(db.doc.getMap('clients').values()) : [];
      return {
        count: fromDb.length,
        has: fromDb.some((c: any) => c?.id === clientId),
        names: fromDb.map((c: any) => c?.name),
      };
    }, client.id);
    console.log('Target clients after remote apply:', JSON.stringify(probe));
    expect(probe.has).toBe(true);

    await expectEdgeMeshEntity(targetPage, 'clients', (items) =>
      items.some((item) => item.id === client.id && item.name === client.name),
    );
    await expectAppStateEntity(targetPage, 'clients', (items) =>
      items.some((item) => item.id === client.id && item.name === client.name),
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
