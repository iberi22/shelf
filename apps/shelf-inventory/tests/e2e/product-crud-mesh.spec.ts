import { expect, type Page, test } from '@playwright/test';
import { parseProductCsv } from '../../lib/csvProductImport';
import { addOverlayBlocker, dismissModals, setupPage } from '../helpers';
import { getLocalPeerId } from '../p2p-helpers';

const fullPermissions = {
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

test.describe('Product CRUD across mesh — full lifecycle 3 nodes', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  let adminPage: Page;
  let worker1Page: Page;
  let worker2Page: Page;
  let adminContext: any;
  let worker1Context: any;
  let worker2Context: any;

  async function syncMeshAcrossAllNodes() {
    for (const sourcePage of [adminPage, worker1Page, worker2Page]) {
      const sourcePeerId = await getLocalPeerId(sourcePage);
      const update = await sourcePage.evaluate(() => {
        const db = (window as any)._dbSyncForTest;
        if (db?.getLocalUpdate) {
          return Array.from(db.getLocalUpdate());
        }
        return [];
      });

      if (update && update.length > 0) {
        for (const targetPage of [adminPage, worker1Page, worker2Page]) {
          if (targetPage !== sourcePage) {
            await targetPage.evaluate(
              ({ data, srcId }) => {
                const db = (window as any)._dbSyncForTest;
                if (db?.applyUpdate) {
                  db.applyUpdate(new Uint8Array(data), srcId);
                }
              },
              { data: update, srcId: sourcePeerId },
            );
          }
        }
      }

      await sourcePage
        .evaluate(() => {
          (window as any)._p2pManagerForTest?.requestFullSync?.();
        })
        .catch(() => {});
    }
  }

  async function setupAuthorityAndPermissions(adminId: string, worker1Id: string, worker2Id: string) {
    const nodes = [
      { id: adminId, role: 'admin', isMaster: true },
      { id: worker1Id, role: 'collaborator', isMaster: false },
      { id: worker2Id, role: 'collaborator', isMaster: false },
    ];

    for (const targetPage of [adminPage, worker1Page, worker2Page]) {
      await targetPage.evaluate(
        ({ masterId, nodeList, perms }) => {
          const dbSync = (window as any)._dbSyncForTest;
          const p2p = (window as any)._p2pManagerForTest;
          if (!dbSync) return;

          // 1. Set master peer ID FIRST so authorityPeerId = masterId in metadata
          dbSync.setMasterPeerId(masterId);

          // 2. Now updateLinkedNode allows authority masterId to set peer configs
          for (const node of nodeList) {
            const key = `${node.id}-dsa-key`;
            dbSync.updateLinkedNode?.(
              node.id,
              {
                role: node.role as any,
                isMaster: node.isMaster,
                dsaPublicKey: key,
                permissions: perms,
              },
              masterId,
            );
            dbSync.updateEphemeralNode?.(node.id, {
              status: 'verified',
              dsaPublicKey: key,
            });
          }

          if (p2p) {
            const selfIsAdmin = dbSync.localPeerId === masterId;
            p2p.role = selfIsAdmin ? 'admin' : 'collaborator';
          }
        },
        { masterId: adminId, nodeList: nodes, perms: fullPermissions },
      );
    }
  }

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext();
    worker1Context = await browser.newContext();
    worker2Context = await browser.newContext();

    addOverlayBlocker(adminContext);
    addOverlayBlocker(worker1Context);
    addOverlayBlocker(worker2Context);

    adminPage = await adminContext.newPage();
    worker1Page = await worker1Context.newPage();
    worker2Page = await worker2Context.newPage();

    await Promise.all([setupPage(adminPage), setupPage(worker1Page), setupPage(worker2Page)]);

    await Promise.all([
      adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click(),
      worker1Page.locator('[data-testid="nav-item-nav.settings"]').last().click(),
      worker2Page.locator('[data-testid="nav-item-nav.settings"]').last().click(),
    ]);

    await Promise.all([dismissModals(adminPage), dismissModals(worker1Page), dismissModals(worker2Page)]);

    const adminId = await getLocalPeerId(adminPage);
    const worker1Id = await getLocalPeerId(worker1Page);
    const worker2Id = await getLocalPeerId(worker2Page);

    await setupAuthorityAndPermissions(adminId, worker1Id, worker2Id);

    await syncMeshAcrossAllNodes();
  });

  test.afterAll(async () => {
    await adminContext?.close();
    await worker1Context?.close();
    await worker2Context?.close();
  });

  test('1. Admin creates product "Server Rack" -> all 3 nodes see it', async () => {
    await adminPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync?.localPeerId) throw new Error('dbSync is not ready');
      dbSync.upsertEntity('products', {
        id: 'prod-server-rack',
        name: 'Server Rack',
        quantity: 10,
        price: 1200,
        cost: 600,
        customFields: { description: 'Standard Server Rack' },
        isActive: true,
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
      });
    });

    await syncMeshAcrossAllNodes();

    for (const page of [adminPage, worker1Page, worker2Page]) {
      const res = await page.evaluate(() => {
        const db = (window as any)._dbSyncForTest;
        const products = db?.getState(db.localPeerId)?.products || [];
        return {
          count: products.length,
          hasServerRack: products.some((p: any) => p.name === 'Server Rack' && p.price === 1200),
          allNames: products.map((p: any) => p.name),
        };
      });
      expect(res.hasServerRack).toBe(true);
    }
  });

  test('2. Worker-1 updates description -> all nodes see updated description', async () => {
    await worker1Page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync?.localPeerId) throw new Error('dbSync is not ready');
      const state = dbSync.getState(dbSync.localPeerId);
      const product = state?.products?.find((p: any) => p.name === 'Server Rack');
      if (!product) throw new Error('Server Rack product not found');

      dbSync.upsertEntity('products', {
        ...product,
        customFields: {
          ...product.customFields,
          description: 'Enterprise 42U Heavy Duty Server Rack',
        },
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
        __baseUpdatedAt: product.updatedAt,
      });
    });

    await syncMeshAcrossAllNodes();

    for (const page of [adminPage, worker1Page, worker2Page]) {
      const desc = await page.evaluate(() => {
        const db = (window as any)._dbSyncForTest;
        const products = db?.getState(db.localPeerId)?.products || [];
        const p = products.find((item: any) => item.name === 'Server Rack');
        return p?.customFields?.description;
      });
      expect(desc).toBe('Enterprise 42U Heavy Duty Server Rack');
    }
  });

  test('3. Worker-2 adds variant "42U" -> all nodes see variant', async () => {
    await worker2Page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync?.localPeerId) throw new Error('dbSync is not ready');
      const state = dbSync.getState(dbSync.localPeerId);
      const product = state?.products?.find((p: any) => p.name === 'Server Rack');
      if (!product) throw new Error('Server Rack product not found');

      const variant = {
        id: 'var-42u',
        label: '42U',
        sku: 'SR-42U',
        quantity: 5,
        price: 1300,
        cost: 650,
        isActive: true,
        attributes: { Size: '42U' },
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
      };

      dbSync.upsertEntity('products', {
        ...product,
        variantAttributes: ['Size'],
        variants: [variant],
        updatedAt: new Date().toISOString(),
        updatedBy: dbSync.localPeerId,
        __baseUpdatedAt: product.updatedAt,
      });
    });

    await syncMeshAcrossAllNodes();

    for (const page of [adminPage, worker1Page, worker2Page]) {
      const variantLabel = await page.evaluate(() => {
        const db = (window as any)._dbSyncForTest;
        const products = db?.getState(db.localPeerId)?.products || [];
        const p = products.find((item: any) => item.name === 'Server Rack');
        return p?.variants?.[0]?.label;
      });
      expect(variantLabel).toBe('42U');
    }
  });

  test('4. Admin deletes product -> all nodes remove it', async () => {
    await adminPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync?.localPeerId) throw new Error('dbSync is not ready');
      const state = dbSync.getState(dbSync.localPeerId);
      const product = state?.products?.find((p: any) => p.name === 'Server Rack');
      if (!product) throw new Error('Server Rack product not found');

      dbSync.deleteEntity('products', product.id);
    });

    await syncMeshAcrossAllNodes();

    for (const page of [adminPage, worker1Page, worker2Page]) {
      const hasProduct = await page.evaluate(() => {
        const db = (window as any)._dbSyncForTest;
        const products = db?.getState(db.localPeerId)?.products || [];
        return products.some((item: any) => item.name === 'Server Rack');
      });
      expect(hasProduct).toBe(false);
    }
  });

  test('5. Bulk import: Admin imports 10 products via CSV -> all nodes receive all 10', async () => {
    const csvContent = `name,sku,quantity,price,cost
"Bulk Rack Unit 1","BR-001",10,100,50
"Bulk Rack Unit 2","BR-002",10,100,50
"Bulk Rack Unit 3","BR-003",10,100,50
"Bulk Rack Unit 4","BR-004",10,100,50
"Bulk Rack Unit 5","BR-005",10,100,50
"Bulk Rack Unit 6","BR-006",10,100,50
"Bulk Rack Unit 7","BR-007",10,100,50
"Bulk Rack Unit 8","BR-008",10,100,50
"Bulk Rack Unit 9","BR-009",10,100,50
"Bulk Rack Unit 10","BR-010",10,100,50
`;
    const parsed = parseProductCsv(csvContent);
    expect(parsed.products).toHaveLength(10);

    await adminPage.evaluate((productsToImport) => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync?.localPeerId) throw new Error('dbSync is not ready');
      const now = new Date().toISOString();

      for (const item of productsToImport) {
        dbSync.upsertEntity('products', {
          id: `csv-${item.sku}`,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
          cost: item.cost,
          isActive: true,
          updatedAt: now,
          updatedBy: dbSync.localPeerId,
        });
      }
    }, parsed.products);

    await syncMeshAcrossAllNodes();

    for (const page of [adminPage, worker1Page, worker2Page]) {
      const count = await page.evaluate(() => {
        const db = (window as any)._dbSyncForTest;
        const products = db?.getState(db.localPeerId)?.products || [];
        return products.filter((item: any) => item.name.startsWith('Bulk Rack Unit')).length;
      });
      expect(count).toBe(10);
    }
  });

  test('6. Search: All nodes can search and filter products across mesh', async () => {
    for (const page of [adminPage, worker1Page, worker2Page]) {
      await page.locator('[data-testid="nav-item-nav.inventory"]').first().click();
      await dismissModals(page);

      await page.getByTestId('inventory-search-input').fill('Bulk Rack Unit 7');
      await expect(page.getByTestId('inventory-table').first()).toContainText('Bulk Rack Unit 7', {
        timeout: 10000,
      });
      await expect(page.getByTestId('inventory-table').first()).not.toContainText('Bulk Rack Unit 1', {
        timeout: 10000,
      });

      await page.getByTestId('inventory-search-input').fill('');
    }
  });
});
