import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals } from './helpers';

test.describe('Security & Unauthorized Mutations', () => {
  test('Collaborator is blocked from mutating unauthorized tables locally', async ({ browser }) => {
    const context = await browser.newContext();
    addOverlayBlocker(context);

    const page = await context.newPage();
    await page.goto('/');
    await dismissModals(page);
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);

    const peerIdLocator = page.locator('span.font-mono.text-yellow-400').first();
    await peerIdLocator.waitFor({ state: 'visible' });
    await expect(peerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });

    const result = await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync) return { error: 'NO_DBSYNC' };

      const authorityPeerId = dbSync.getMasterPeerId?.();
      const originalLocalPeerId = dbSync.localPeerId;

      // Simulate a collaborator context by swapping the local peer identity to a
      // non-authority peer before exercising the mutation guards.
      dbSync.localPeerId = 'collaborator-node';

      dbSync.updatePeerConfig(
        'spoofed-peer-node',
        'admin',
        {
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
        'spoofed-peer',
      );

      dbSync.upsertEntity('auditLogs', {
        id: 'hack-123',
        action: 'ELEVATE_PRIVILEGES',
        timestamp: new Date().toISOString(),
      });

      const state = dbSync.getState('collaborator-node');
      dbSync.localPeerId = originalLocalPeerId;

      return {
        authorityPeerId,
        peers: state?.peers || [],
        auditLogs: state?.auditLogs || [],
      };
    });

    expect(result.authorityPeerId).toBeTruthy();
    expect(result.peers.some((peer: any) => peer.id === 'spoofed-peer-node')).toBe(false);
    expect(result.auditLogs.some((log: any) => log.id === 'hack-123')).toBe(false);
  });

  test('Multi-peer ACL test: only admin and collaborator can edit products, vendedor edits are reverted and logged', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    addOverlayBlocker(context);

    const page = await context.newPage();
    await page.goto('/');
    await dismissModals(page);
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);

    const peerIdLocator = page.locator('span.font-mono.text-yellow-400').first();
    await peerIdLocator.waitFor({ state: 'visible' });
    await expect(peerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });

    const result = await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync) return { error: 'NO_DBSYNC' };

      const Y = (window as any).Y || require('yjs');

      // 1. Setup Admin (local node)
      const localId = dbSync.localPeerId;
      dbSync.setMasterPeerId(localId);
      dbSync.updateLinkedNode(
        localId,
        {
          role: 'admin',
          isMaster: true,
          dsaPublicKey: 'admin-key',
        },
        localId,
      );

      // 2. Setup Collaborator Peer
      const collaboratorPeerId = 'collaborator-peer';
      dbSync.updateLinkedNode(
        collaboratorPeerId,
        {
          role: 'collaborator',
          isMaster: false,
          dsaPublicKey: 'collab-key',
          permissions: {
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
          },
        },
        localId,
      );
      dbSync.updateEphemeralNode(collaboratorPeerId, {
        status: 'verified',
        dsaPublicKey: 'collab-key',
      });

      // 3. Setup Vendedor Peer
      const vendedorPeerId = 'vendedor-peer';
      dbSync.updateLinkedNode(
        vendedorPeerId,
        {
          role: 'vendedor',
          isMaster: false,
          dsaPublicKey: 'vendedor-key',
          permissions: {
            canViewProducts: true,
            canEditProducts: false,
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
          },
        },
        localId,
      );
      dbSync.updateEphemeralNode(vendedorPeerId, {
        status: 'verified',
        dsaPublicKey: 'vendedor-key',
      });

      // Clear any pre-existing products
      const productsMap = dbSync.doc.getMap('products');
      productsMap.forEach((_v: any, k: string) => {
        productsMap.delete(k);
      });

      // --- TEST 1: VENDEDOR MUTATION (Rejected) ---
      // Vendedor tries to inject/mutate a product
      const vendedorDoc = new Y.Doc();
      const vendedorProducts = vendedorDoc.getMap('products');
      vendedorProducts.set('prod-vendedor', {
        id: 'prod-vendedor',
        name: 'Vendedor Illegal Product',
        quantity: 10,
        price: 99.9,
        cost: 50.0,
        isActive: true,
        updatedBy: vendedorPeerId,
        updatedAt: new Date().toISOString(),
      });
      const vendedorUpdate = Y.encodeStateAsUpdate(vendedorDoc);

      // Apply update on admin with vendedor-peer origin
      dbSync.applyUpdate(vendedorUpdate, vendedorPeerId);

      // Check if product was reverted
      const productForVendedorExists = productsMap.has('prod-vendedor');

      // Check rejected mutations in audit logs
      const stateAfterVendedor = dbSync.getState(localId);
      const rejectedAudits = (stateAfterVendedor.auditLogs || []).filter(
        (log: any) => log.action === 'REJECTED_MUTATION' && log.peerId === vendedorPeerId,
      );

      // --- TEST 2: COLLABORATOR MUTATION (Applied) ---
      const collaboratorDoc = new Y.Doc();
      const collaboratorProducts = collaboratorDoc.getMap('products');
      collaboratorProducts.set('prod-collab', {
        id: 'prod-collab',
        name: 'Collaborator Legal Product',
        quantity: 5,
        price: 49.9,
        cost: 25.0,
        isActive: true,
        updatedBy: collaboratorPeerId,
        updatedAt: new Date().toISOString(),
      });
      const collaboratorUpdate = Y.encodeStateAsUpdate(collaboratorDoc);

      dbSync.applyUpdate(collaboratorUpdate, collaboratorPeerId);

      const productForCollabExists = productsMap.has('prod-collab');
      const collabProduct = productsMap.get('prod-collab');

      return {
        productForVendedorExists,
        rejectedAudits,
        productForCollabExists,
        collabProductName: collabProduct?.name,
      };
    });

    expect(result.productForVendedorExists).toBe(false);
    expect(result.rejectedAudits.length).toBeGreaterThan(0);
    expect(result.rejectedAudits[0].entityType).toBe('products');
    expect(result.rejectedAudits[0].timestamp).toBeTruthy();
    expect(result.rejectedAudits[0].peerId).toBe('vendedor-peer');

    expect(result.productForCollabExists).toBe(true);
    expect(result.collabProductName).toBe('Collaborator Legal Product');
  });
});
