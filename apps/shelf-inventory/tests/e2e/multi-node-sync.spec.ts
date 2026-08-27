import { expect, type Page, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from '../helpers';
import { getLocalPeerId } from '../p2p-helpers';

interface NodeFixture {
  context: import('@playwright/test').BrowserContext;
  page: Page;
  peerId: string;
}

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

async function createNode(browser: import('@playwright/test').Browser): Promise<NodeFixture> {
  const context = await browser.newContext();
  addOverlayBlocker(context);
  const page = await context.newPage();
  await setupPage(page);
  await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
  await dismissModals(page);

  const peerId = await getLocalPeerId(page, 30_000);
  return { context, page, peerId };
}

async function connectNodes(nodes: NodeFixture[]) {
  const masterId = nodes[0].peerId;

  // Set up master authority on all nodes
  for (const node of nodes) {
    await node.page.evaluate(
      ({ mId, allNodes, perms }) => {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return;
        dbSync.setMasterPeerId(mId);
        for (const n of allNodes) {
          const key = `key-${n.peerId}`;
          dbSync.updateLinkedNode(
            n.peerId,
            {
              role: n.peerId === mId ? 'admin' : 'collaborator',
              isMaster: n.peerId === mId,
              dsaPublicKey: key,
              permissions: perms,
            },
            mId,
          );
          dbSync.updateEphemeralNode(n.peerId, { status: 'verified', dsaPublicKey: key });
        }
      },
      { mId: masterId, allNodes: nodes.map((n) => ({ peerId: n.peerId })), perms: fullPermissions },
    );
  }

  // Connect peers in a mesh topology
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      if (i !== j) {
        const source = nodes[i].page;
        const targetId = nodes[j].peerId;
        await source.evaluate((id) => {
          const p2p = (window as any)._p2pManagerForTest;
          if (p2p && !p2p.isPeerConnected(id)) {
            p2p.connect(id);
          }
        }, targetId);
      }
    }
  }

  // Wait for connections to settle between node 0 and all other nodes
  for (let i = 1; i < nodes.length; i++) {
    await expect
      .poll(
        async () => {
          return nodes[0].page.evaluate((id) => {
            return Boolean((window as any)._p2pManagerForTest?.isPeerConnected(id));
          }, nodes[i].peerId);
        },
        { timeout: 30_000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
  }
}

async function closeNodes(nodes: NodeFixture[]) {
  for (const node of nodes) {
    await node.page
      .evaluate(() => {
        const p2p = (window as any)._p2pManagerForTest;
        if (p2p?.disconnect) p2p.disconnect();
      })
      .catch(() => {});
    await node.context.close().catch(() => {});
  }
}

async function waitForProductInState(
  page: Page,
  productName: string,
  predicate?: (p: any) => boolean,
  timeout = 10_000,
) {
  await expect
    .poll(
      async () => {
        return page.evaluate(
          ({ name }) => {
            try {
              const dbSync = (window as any)._dbSyncForTest;
              if (!dbSync) return false;
              const state = dbSync.getState(dbSync.localPeerId);
              const prods = state?.products as any[];
              if (!prods) return false;
              const found = prods.find((p: any) => p.name === name);
              return Boolean(found);
            } catch {
              return false;
            }
          },
          { name: productName },
        );
      },
      { timeout, intervals: [300, 500, 1000] },
    )
    .toBe(true);

  if (predicate) {
    await expect
      .poll(
        async () => {
          return page.evaluate(
            ({ name }) => {
              try {
                const dbSync = (window as any)._dbSyncForTest;
                if (!dbSync) return null;
                const state = dbSync.getState(dbSync.localPeerId);
                const prods = state?.products as any[];
                return prods?.find((p: any) => p.name === name) || null;
              } catch {
                return null;
              }
            },
            { name: productName },
          );
        },
        { timeout, intervals: [300, 500, 1000] },
      )
      .toSatisfy(predicate);
  }
}

async function waitForProductAbsentInState(page: Page, productName: string, timeout = 10_000) {
  await expect
    .poll(
      async () => {
        return page.evaluate(
          ({ name }) => {
            try {
              const dbSync = (window as any)._dbSyncForTest;
              if (!dbSync) return true;
              const state = dbSync.getState(dbSync.localPeerId);
              const prods = state?.products as any[];
              if (!prods) return true;
              return !prods.some((p: any) => p.name === name);
            } catch {
              return true;
            }
          },
          { name: productName },
        );
      },
      { timeout, intervals: [300, 500, 1000] },
    )
    .toBe(true);
}

test.describe('4-node headless inventory sync — Playwright multi-browser', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  let nodes: NodeFixture[] = [];

  test.beforeEach(async ({ browser }) => {
    nodes = [];
    for (let i = 0; i < 4; i++) {
      const node = await createNode(browser);
      nodes.push(node);
    }
    await connectNodes(nodes);
  });

  test.afterEach(async () => {
    await closeNodes(nodes);
    nodes = [];
  });

  test('1. Node-1 adds "Laptop" (qty=10, price=999) -> all 4 nodes show it in inventory', async () => {
    const laptopId = `prod-laptop-${Date.now()}`;

    // Node-1 adds "Laptop"
    await nodes[0].page.evaluate(
      ({ id }) => {
        const dbSync = (window as any)._dbSyncForTest;
        dbSync.upsertEntity('products', {
          id,
          name: 'Laptop',
          quantity: 10,
          price: 999,
          cost: 500,
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      },
      { id: laptopId },
    );

    // Validate all 4 nodes show it within 10 seconds
    for (let i = 0; i < 4; i++) {
      await waitForProductInState(nodes[i].page, 'Laptop', (p) => p && p.quantity === 10 && p.price === 999, 10_000);
    }
  });

  test('2. Node-2 updates qty to 5 -> nodes 1,3,4 see qty=5', async () => {
    const laptopId = `prod-laptop-upd-${Date.now()}`;

    // Node-1 adds "Laptop"
    await nodes[0].page.evaluate(
      ({ id }) => {
        const dbSync = (window as any)._dbSyncForTest;
        dbSync.upsertEntity('products', {
          id,
          name: 'Laptop',
          quantity: 10,
          price: 999,
          cost: 500,
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      },
      { id: laptopId },
    );

    // Wait for sync to Node-2
    await waitForProductInState(nodes[1].page, 'Laptop', undefined, 10_000);

    // Node-2 updates quantity to 5
    await nodes[1].page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync.getState(dbSync.localPeerId);
      const laptop = state.products.find((p: any) => p.name === 'Laptop');
      if (laptop) {
        dbSync.upsertEntity('products', {
          ...laptop,
          quantity: 5,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      }
    });

    // Nodes 1, 3, 4 see quantity=5 within 10 seconds
    for (const nodeIdx of [0, 2, 3]) {
      await waitForProductInState(nodes[nodeIdx].page, 'Laptop', (p) => p && p.quantity === 5, 10_000);
    }
  });

  test('3. Node-3 deletes product -> all nodes remove it', async () => {
    const laptopId = `prod-laptop-del-${Date.now()}`;

    // Node-1 adds "Laptop"
    await nodes[0].page.evaluate(
      ({ id }) => {
        const dbSync = (window as any)._dbSyncForTest;
        dbSync.upsertEntity('products', {
          id,
          name: 'Laptop',
          quantity: 10,
          price: 999,
          cost: 500,
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      },
      { id: laptopId },
    );

    // Wait until Node-3 sees it
    await waitForProductInState(nodes[2].page, 'Laptop', undefined, 10_000);

    // Node-3 deletes product
    await nodes[2].page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const state = dbSync.getState(dbSync.localPeerId);
      const laptop = state.products.find((p: any) => p.name === 'Laptop');
      if (laptop) {
        dbSync.remove('products', laptop.id);
      }
    });

    // Validate all nodes (0, 1, 2, 3) remove it
    for (let i = 0; i < 4; i++) {
      await waitForProductAbsentInState(nodes[i].page, 'Laptop', 10_000);
    }
  });

  test('4. All 4 nodes add 1 product simultaneously -> all 4 products appear on all nodes', async () => {
    const time = Date.now();
    const productSpecs = [
      { name: 'Prod-Node-1', price: 100, qty: 1, id: `p1-${time}` },
      { name: 'Prod-Node-2', price: 200, qty: 2, id: `p2-${time}` },
      { name: 'Prod-Node-3', price: 300, qty: 3, id: `p3-${time}` },
      { name: 'Prod-Node-4', price: 400, qty: 4, id: `p4-${time}` },
    ];

    // All 4 nodes add 1 product simultaneously
    await Promise.all(
      nodes.map((node, idx) => {
        const spec = productSpecs[idx];
        return node.page.evaluate(
          ({ item }) => {
            const dbSync = (window as any)._dbSyncForTest;
            dbSync.upsertEntity('products', {
              id: item.id,
              name: item.name,
              quantity: item.qty,
              price: item.price,
              cost: 50,
              isActive: true,
              updatedAt: new Date().toISOString(),
              updatedBy: dbSync.localPeerId,
            });
          },
          { item: spec },
        );
      }),
    );

    // Validate all 4 products appear on all nodes
    for (let i = 0; i < 4; i++) {
      for (const spec of productSpecs) {
        await waitForProductInState(nodes[i].page, spec.name, (p) => p && p.price === spec.price, 10_000);
      }
    }
  });

  test('5. Offline simulation: Node-4 disconnects -> Node-1 adds product -> Node-4 reconnects -> syncs', async () => {
    const productName = 'Offline-Laptop';
    const prodId = `prod-offline-${Date.now()}`;

    // Disconnect Node-4 P2P connection
    await nodes[3].page.evaluate(() => {
      const p2p = (window as any)._p2pManagerForTest;
      if (p2p?.disconnect) p2p.disconnect();
    });

    // Wait a brief moment to ensure disconnect registered
    await nodes[0].page.waitForTimeout(1000);

    // Node-1 adds "Offline-Laptop"
    await nodes[0].page.evaluate(
      ({ id, name }) => {
        const dbSync = (window as any)._dbSyncForTest;
        dbSync.upsertEntity('products', {
          id,
          name,
          quantity: 1,
          price: 500,
          cost: 250,
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: dbSync.localPeerId,
        });
      },
      { id: prodId, name: productName },
    );

    // Nodes 1, 2, 3 see "Offline-Laptop"
    for (const nodeIdx of [0, 1, 2]) {
      await waitForProductInState(nodes[nodeIdx].page, productName, undefined, 10_000);
    }

    // Node-4 does not see "Offline-Laptop" while disconnected
    const node4HasProduct = await nodes[3].page.evaluate(
      ({ name }) => {
        const dbSync = (window as any)._dbSyncForTest;
        if (!dbSync) return false;
        const state = dbSync.getState(dbSync.localPeerId);
        return state?.products?.some((p: any) => p.name === name) ?? false;
      },
      { name: productName },
    );
    expect(node4HasProduct).toBe(false);

    // Reconnect Node-4 to Node-1
    const node1Id = nodes[0].peerId;
    await nodes[3].page.evaluate((targetId) => {
      const p2p = (window as any)._p2pManagerForTest;
      if (p2p?.connect) p2p.connect(targetId);
    }, node1Id);

    // Request CRDT sync if needed and wait for Node-4 to receive "Offline-Laptop"
    await waitForProductInState(nodes[3].page, productName, (p) => p && p.price === 500, 10_000);
  });
});
