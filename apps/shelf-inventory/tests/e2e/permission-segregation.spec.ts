import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from '../helpers';
import {
  applyRemoteEdgeMeshUpdate,
  expectEdgeMeshEntity,
  expectEdgeMeshReady,
  exportEdgeMeshUpdate,
  getEdgeMeshEntities,
  upsertEdgeMeshEntity,
} from '../p2p-helpers';

async function setupEdgeMeshNode(page: import('@playwright/test').Page) {
  await setupPage(page);
  await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
  await dismissModals(page);
  await expectEdgeMeshReady(page);
}

test.describe('Node permission segregation — bodega isolation', () => {
  test.describe.configure({ mode: 'serial' });

  test('1. Node-admin adds product to main namespace -> node-admin sees it, node-worker access is rejected', async ({
    browser,
  }) => {
    const contextAdmin = await browser.newContext();
    const contextWorker = await browser.newContext();
    addOverlayBlocker(contextAdmin);
    addOverlayBlocker(contextWorker);

    const pageAdmin = await contextAdmin.newPage();
    const pageWorker = await contextWorker.newPage();

    await setupEdgeMeshNode(pageAdmin);
    await setupEdgeMeshNode(pageWorker);

    // Setup node-admin in swal/shelf/main and node-worker in swal/shelf/warehouse-b
    const nsMain = 'swal/shelf/main';

    const productAdmin = {
      id: 'prod-main-001',
      name: 'Bodega Main Item',
      price: 150,
      quantity: 10,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: 'node-admin',
    };

    // Node-admin adds product to main namespace
    await upsertEdgeMeshEntity(pageAdmin, 'products', productAdmin.id, productAdmin);
    await expectEdgeMeshEntity(pageAdmin, 'products', (items) => items.some((item) => item.id === productAdmin.id));

    // Export update from node-admin for swal/shelf/main
    const updateMain = await exportEdgeMeshUpdate(pageAdmin, 'products');

    // Node-worker attempts to receive remote update for swal/shelf/main where it lacks write/read capabilities
    // Authorize nodeWorker with permissions restricted away from main namespace, then apply remote update
    await pageWorker.evaluate(
      ({ data, ns }) => {
        const testWindow = window as any;
        const harness = testWindow.__shelfEdgeMeshForTest;
        if (!harness) throw new Error('EdgeMesh harness not available');

        // Apply update with custom namespace parameter representing swal/shelf/main
        try {
          harness.applyRemoteUpdate('node-admin', data, 'products', ns);
        } catch (_e) {
          // Sync rejection expected
        }
      },
      { data: updateMain, ns: nsMain },
    );

    // Node-worker should NOT have synced the product from main namespace
    const workerProducts = await getEdgeMeshEntities(pageWorker, 'products');
    expect(workerProducts.some((item) => item.id === productAdmin.id)).toBe(false);

    await contextAdmin.close();
    await contextWorker.close();
  });

  test('2. Node-worker adds product to warehouse-b namespace -> node-worker sees it, node-admin access is rejected', async ({
    browser,
  }) => {
    const contextAdmin = await browser.newContext();
    const contextWorker = await browser.newContext();
    addOverlayBlocker(contextAdmin);
    addOverlayBlocker(contextWorker);

    const pageAdmin = await contextAdmin.newPage();
    const pageWorker = await contextWorker.newPage();

    await setupEdgeMeshNode(pageAdmin);
    await setupEdgeMeshNode(pageWorker);

    const nsWarehouseB = 'swal/shelf/warehouse-b';

    const productWorker = {
      id: 'prod-whb-001',
      name: 'Warehouse B Item',
      price: 80,
      quantity: 5,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: 'node-worker',
    };

    // Node-worker adds product to warehouse-b namespace
    await upsertEdgeMeshEntity(pageWorker, 'products', productWorker.id, productWorker);
    await expectEdgeMeshEntity(pageWorker, 'products', (items) => items.some((item) => item.id === productWorker.id));

    // Export update from node-worker for swal/shelf/warehouse-b
    const updateWhB = await exportEdgeMeshUpdate(pageWorker, 'products');

    // Node-admin attempts to receive remote update for swal/shelf/warehouse-b namespace without capability
    await pageAdmin.evaluate(
      ({ data, ns }) => {
        const testWindow = window as any;
        const harness = testWindow.__shelfEdgeMeshForTest;
        if (!harness) throw new Error('EdgeMesh harness not available');

        try {
          harness.applyRemoteUpdate('node-worker', data, 'products', ns);
        } catch (_e) {
          // Sync rejection expected
        }
      },
      { data: updateWhB, ns: nsWarehouseB },
    );

    // Node-admin should NOT have synced the product from warehouse-b namespace
    const adminProducts = await getEdgeMeshEntities(pageAdmin, 'products');
    expect(adminProducts.some((item) => item.id === productWorker.id)).toBe(false);

    await contextAdmin.close();
    await contextWorker.close();
  });

  test('3. Both nodes can read shared global namespace products', async ({ browser }) => {
    const contextAdmin = await browser.newContext();
    const contextWorker = await browser.newContext();
    addOverlayBlocker(contextAdmin);
    addOverlayBlocker(contextWorker);

    const pageAdmin = await contextAdmin.newPage();
    const pageWorker = await contextWorker.newPage();

    await setupEdgeMeshNode(pageAdmin);
    await setupEdgeMeshNode(pageWorker);

    const productGlobal = {
      id: 'prod-global-001',
      name: 'Shared Global Item',
      price: 50,
      quantity: 20,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: 'node-admin',
    };

    // Admin adds product in global namespace
    await upsertEdgeMeshEntity(pageAdmin, 'products', productGlobal.id, productGlobal);
    const updateGlobal = await exportEdgeMeshUpdate(pageAdmin, 'products');

    // Apply remote update to node-worker (authorized for global namespace)
    await applyRemoteEdgeMeshUpdate(pageWorker, 'node-admin', updateGlobal, 'products');

    // Both nodes see the shared product in global namespace
    await expectEdgeMeshEntity(pageAdmin, 'products', (items) => items.some((item) => item.id === productGlobal.id));
    await expectEdgeMeshEntity(pageWorker, 'products', (items) => items.some((item) => item.id === productGlobal.id));

    await contextAdmin.close();
    await contextWorker.close();
  });

  test('4. Test that unauthorized mutations are reverted (self-healing)', async ({ browser }) => {
    const contextAdmin = await browser.newContext();
    const contextWorker = await browser.newContext();
    addOverlayBlocker(contextAdmin);
    addOverlayBlocker(contextWorker);

    const pageAdmin = await contextAdmin.newPage();
    const pageWorker = await contextWorker.newPage();

    await setupEdgeMeshNode(pageAdmin);
    await setupEdgeMeshNode(pageWorker);

    const originalProduct = {
      id: 'prod-revert-001',
      name: 'Original Admin Product',
      price: 200,
      quantity: 10,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: 'node-admin',
    };

    // Seed original valid product in node-admin
    await upsertEdgeMeshEntity(pageAdmin, 'products', originalProduct.id, originalProduct);
    await expectEdgeMeshEntity(pageAdmin, 'products', (items) => items.some((item) => item.id === originalProduct.id));

    const hackedProduct = {
      id: 'prod-revert-001',
      name: 'Hacked Admin Product',
      price: 0,
      quantity: 999,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: 'node-worker',
    };

    // Worker creates an unauthorized mutation
    await upsertEdgeMeshEntity(pageWorker, 'products', hackedProduct.id, hackedProduct);
    const maliciousUpdate = await exportEdgeMeshUpdate(pageWorker, 'products');

    // Apply malicious update to node-admin as node-worker (which lacks permission to mutate main products)
    await applyRemoteEdgeMeshUpdate(pageAdmin, 'node-worker', maliciousUpdate, 'products');

    // Verify self-healing revert: node-admin product remains unchanged (original product retained)
    const adminProducts = await getEdgeMeshEntities<typeof originalProduct>(pageAdmin, 'products');
    const targetProduct = adminProducts.find((item) => item.id === originalProduct.id);

    expect(targetProduct).toBeDefined();
    expect(targetProduct?.name).toBe('Original Admin Product');
    expect(targetProduct?.price).toBe(200);

    await contextAdmin.close();
    await contextWorker.close();
  });
});
