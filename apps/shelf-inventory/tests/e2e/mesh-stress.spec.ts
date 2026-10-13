import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from '../helpers';
import { connectPeers, getLocalPeerId } from '../p2p-helpers';

const fullProductPermissions = {
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

test.describe('Mesh stress test — 8 nodes, 100 products, sync latency', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240000);

  let contexts: BrowserContext[] = [];
  let pages: Page[] = [];
  let peerIds: string[] = [];

  test.beforeAll(async ({ browser }) => {
    // Launch 8 browser contexts representing 8 nodes in the same room
    contexts = await Promise.all(Array.from({ length: 8 }, () => browser.newContext()));

    for (const ctx of contexts) {
      addOverlayBlocker(ctx);
    }

    pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

    // Setup pages and navigate to settings to initialize P2P
    await Promise.all(pages.map((p) => setupPage(p)));
    await Promise.all(pages.map((p) => p.locator('[data-testid="nav-item-nav.settings"]').last().click()));
    await Promise.all(pages.map((p) => dismissModals(p)));

    // Retrieve local peer IDs
    peerIds = await Promise.all(pages.map((p) => getLocalPeerId(p)));

    // Enable auto-apply for product updates across all 8 nodes
    for (const page of pages) {
      await page.evaluate(() => {
        const dbSync = (window as any)._dbSyncForTest;
        if (dbSync) {
          const config = dbSync.getInventoryConfig() || {};
          dbSync.setInventoryConfig({ ...config, autoApplyProductUpdates: true });
        }
      });
    }

    // Retrieve DSA public keys for each node
    const dsaKeys = await Promise.all(
      pages.map((p) =>
        p.evaluate(() => {
          const p2p = (window as any)._p2pManagerForTest;
          const keyBytes = p2p?.dsaKeyPair?.publicKey;
          return keyBytes ? Array.from(keyBytes, (b: number) => b.toString(16).padStart(2, '0')).join('') : null;
        }),
      ),
    );

    // Connect Nodes 2..8 to Node-1
    for (let i = 1; i < 8; i++) {
      await connectPeers(pages[0], peerIds[i]);
      await connectPeers(pages[i], peerIds[0]);
    }

    // Setup Master authority on Node 1 and grant collaborator roles to Nodes 2..8 on ALL pages
    for (let pageIndex = 0; pageIndex < 8; pageIndex++) {
      await pages[pageIndex].evaluate(
        ({ masterId, peerIds, dsaKeys, fullPermissions }) => {
          const dbSync = (window as any)._dbSyncForTest;
          if (dbSync) {
            dbSync.setMasterPeerId(masterId);
            peerIds.forEach((id: string, idx: number) => {
              const role = idx === 0 ? 'admin' : 'collaborator';
              const isMaster = idx === 0;
              dbSync.updateLinkedNode(
                id,
                { role, isMaster, dsaPublicKey: dsaKeys[idx], permissions: fullPermissions },
                masterId,
              );
              dbSync.updateEphemeralNode(id, { status: 'verified', dsaPublicKey: dsaKeys[idx] });
            });
          }
        },
        { masterId: peerIds[0], peerIds, dsaKeys, fullPermissions: fullProductPermissions },
      );
    }

    // Also send P2P CHANGE_ROLE from Node 1 to Nodes 2..8
    for (let i = 1; i < 8; i++) {
      await pages[0].evaluate(
        ({ targetPeerId, fullPermissions }) => {
          const p2p = (window as any)._p2pManagerForTest;
          p2p?.sendTo(targetPeerId, {
            type: 'CHANGE_ROLE',
            payload: { targetPeerId, role: 'collaborator', permissions: fullPermissions },
          });
          p2p?.sendTo(targetPeerId, {
            type: 'UPDATE_PEER_PERMISSIONS',
            payload: { targetPeerId, role: 'collaborator', permissions: fullPermissions },
          });
        },
        { targetPeerId: peerIds[i], fullPermissions: fullProductPermissions },
      );
    }

    // Give role propagation and PQC handshake time to settle across all pages
    await pages[0].waitForTimeout(2000);
  });

  test.afterAll(async () => {
    for (const p of pages) {
      await p
        .evaluate(() => {
          const p2p = (window as any)._p2pManagerForTest;
          if (p2p?.disconnect) p2p.disconnect();
        })
        .catch(() => {});
    }
    for (const ctx of contexts) {
      await ctx.close().catch(() => {});
    }
  });

  // 1. Bulk Add Scale Test
  test('1. Scale: Node-1 adds 100 products in rapid succession, all 8 nodes sync within 30s', async () => {
    const startTime = Date.now();

    await pages[0].evaluate(
      ({ peerId }) => {
        const dbSync = (window as any)._dbSyncForTest;
        for (let i = 1; i <= 100; i++) {
          dbSync?.upsertEntity('products', {
            id: `prod-scale-${i}`,
            name: `Scale Product ${i}`,
            quantity: 10,
            price: 50 + i,
            cost: 20,
            isActive: true,
            updatedAt: new Date().toISOString(),
            updatedBy: peerId,
          });
        }
      },
      { peerId: peerIds[0] },
    );

    // Assert all 8 nodes have 100 active products within 30 seconds
    await expect
      .poll(
        async () => {
          for (const p of pages) {
            await p
              .evaluate(() => {
                (window as any)._p2pManagerForTest?.requestFullSync?.();
              })
              .catch(() => {});
          }

          const counts = await Promise.all(
            pages.map((p) =>
              p.evaluate(() => {
                const dbSync = (window as any)._dbSyncForTest;
                const state = dbSync?.getState();
                return state?.products?.filter((item: any) => item.isActive !== false)?.length || 0;
              }),
            ),
          );
          return counts;
        },
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toEqual([100, 100, 100, 100, 100, 100, 100, 100]);

    const elapsedTime = Date.now() - startTime;
    expect(elapsedTime).toBeLessThan(30000);
  });

  // 2. Sync Latency Test
  test('2. Latency: time from Node-1 add to Node-8 seeing it < 5s average', async () => {
    const latencies: number[] = [];
    const sampleCount = 5;

    for (let k = 1; k <= sampleCount; k++) {
      const prodId = `prod-lat-sample-${k}`;
      const prodName = `Latency Test Sample ${k}`;
      const tStart = Date.now();

      await pages[0].evaluate(
        ({ peerId, id, name }) => {
          const dbSync = (window as any)._dbSyncForTest;
          dbSync?.upsertEntity('products', {
            id,
            name,
            quantity: 5,
            price: 99,
            cost: 10,
            isActive: true,
            updatedAt: new Date().toISOString(),
            updatedBy: peerId,
          });
        },
        { peerId: peerIds[0], id: prodId, name: prodName },
      );

      // Poll Node-8 (pages[7]) until product is received
      await expect
        .poll(
          async () => {
            await pages[7]
              .evaluate(() => {
                (window as any)._p2pManagerForTest?.requestFullSync?.();
              })
              .catch(() => {});
            return pages[7].evaluate((id) => {
              const dbSync = (window as any)._dbSyncForTest;
              const state = dbSync?.getState();
              return state?.products?.some((p: any) => p.id === id);
            }, prodId);
          },
          { timeout: 10000, intervals: [100, 200, 500] },
        )
        .toBe(true);

      const latencyMs = Date.now() - tStart;
      latencies.push(latencyMs);

      // Clean up sample product on Node-1 so total count remains clean
      await pages[0].evaluate((id) => {
        const dbSync = (window as any)._dbSyncForTest;
        dbSync?.deleteEntity('products', id);
      }, prodId);
    }

    // Wait for cleanup to sync across all nodes so count returns to 100
    await expect
      .poll(
        async () => {
          for (const p of pages) {
            await p
              .evaluate(() => {
                (window as any)._p2pManagerForTest?.requestFullSync?.();
              })
              .catch(() => {});
          }

          const counts = await Promise.all(
            pages.map((p) =>
              p.evaluate(() => {
                const dbSync = (window as any)._dbSyncForTest;
                const state = dbSync?.getState();
                return state?.products?.filter((item: any) => item.isActive !== false)?.length || 0;
              }),
            ),
          );
          return counts;
        },
        { timeout: 15000, intervals: [500, 1000] },
      )
      .toEqual([100, 100, 100, 100, 100, 100, 100, 100]);

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    expect(avgLatency).toBeLessThan(5000);
  });

  // 3. Concurrent Writes Test
  test('3. Concurrent: 4 nodes each add 25 products simultaneously -> all 8 nodes have 200 products', async () => {
    // Nodes 1, 2, 3, 4 each add 25 products simultaneously
    const addBatch = async (nodeIndex: number, prefix: string, count: number) => {
      await pages[nodeIndex].evaluate(
        ({ peerId, prefix, count }) => {
          const dbSync = (window as any)._dbSyncForTest;
          for (let i = 1; i <= count; i++) {
            dbSync?.upsertEntity('products', {
              id: `prod-concurrent-${prefix}-${i}`,
              name: `Concurrent Product ${prefix}-${i}`,
              quantity: 15,
              price: 200 + i,
              cost: 100,
              isActive: true,
              updatedAt: new Date().toISOString(),
              updatedBy: peerId,
            });
          }
        },
        { peerId: peerIds[nodeIndex], prefix, count },
      );
    };

    await Promise.all([
      addBatch(0, 'node1', 25),
      addBatch(1, 'node2', 25),
      addBatch(2, 'node3', 25),
      addBatch(3, 'node4', 25),
    ]);

    // Assert all 8 nodes converge on 200 active products (100 initial + 100 concurrent)
    await expect
      .poll(
        async () => {
          for (const p of pages) {
            await p
              .evaluate(() => {
                (window as any)._p2pManagerForTest?.requestFullSync?.();
              })
              .catch(() => {});
          }

          const counts = await Promise.all(
            pages.map((p) =>
              p.evaluate(() => {
                const dbSync = (window as any)._dbSyncForTest;
                const state = dbSync?.getState();
                return state?.products?.filter((item: any) => item.isActive !== false)?.length || 0;
              }),
            ),
          );
          return counts;
        },
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toEqual([200, 200, 200, 200, 200, 200, 200, 200]);
  });

  // 4. Memory Check Test
  test('4. Memory check: after 200 products, assert no memory leak (heap < 200MB per context)', async () => {
    for (let i = 0; i < 8; i++) {
      await pages[i]
        .evaluate(() => {
          if (typeof (window as any).gc === 'function') {
            (window as any).gc();
          }
        })
        .catch(() => {});

      const heapUsedBytes = await pages[i].evaluate(() => {
        const perf = window.performance as any;
        return perf?.memory?.usedJSHeapSize || 0;
      });

      if (heapUsedBytes > 0) {
        const heapMb = heapUsedBytes / (1024 * 1024);
        expect(heapMb).toBeLessThan(200);
      }
    }
  });

  // 5. Partial Disconnect / Reconnect Test
  test('5. Partial disconnect: disconnect 3 nodes -> remaining 5 work -> reconnect 3 -> sync catches up', async () => {
    // Disconnect Nodes 6, 7, 8 (pages[5..7]) completely from mesh
    for (let i = 5; i < 8; i++) {
      await pages[i].evaluate(() => {
        const p2p = (window as any)._p2pManagerForTest;
        p2p?.disconnect?.();
      });
    }

    await pages[0].waitForTimeout(1000);

    // Node-1 adds 10 new products while 3 nodes are disconnected
    await pages[0].evaluate(
      ({ peerId }) => {
        const dbSync = (window as any)._dbSyncForTest;
        for (let i = 1; i <= 10; i++) {
          dbSync?.upsertEntity('products', {
            id: `prod-disconn-${i}`,
            name: `Disconnect Test Product ${i}`,
            quantity: 20,
            price: 300 + i,
            cost: 150,
            isActive: true,
            updatedAt: new Date().toISOString(),
            updatedBy: peerId,
          });
        }
      },
      { peerId: peerIds[0] },
    );

    // Verify remaining 5 connected nodes (pages[0..4]) reach 210 products
    await expect
      .poll(
        async () => {
          for (let i = 0; i < 5; i++) {
            await pages[i]
              .evaluate(() => {
                (window as any)._p2pManagerForTest?.requestFullSync?.();
              })
              .catch(() => {});
          }

          const counts = await Promise.all(
            pages.slice(0, 5).map((p) =>
              p.evaluate(() => {
                const dbSync = (window as any)._dbSyncForTest;
                const state = dbSync?.getState();
                return state?.products?.filter((item: any) => item.isActive !== false)?.length || 0;
              }),
            ),
          );
          return counts;
        },
        { timeout: 20000, intervals: [500, 1000] },
      )
      .toEqual([210, 210, 210, 210, 210]);

    // Verify disconnected nodes (pages[5..7]) still have only 200 products
    const disconnectedCounts = await Promise.all(
      pages.slice(5, 8).map((p) =>
        p.evaluate(() => {
          const dbSync = (window as any)._dbSyncForTest;
          const state = dbSync?.getState();
          return state?.products?.filter((item: any) => item.isActive !== false)?.length || 0;
        }),
      ),
    );
    expect(disconnectedCounts).toEqual([200, 200, 200]);

    // Reconnect Nodes 6, 7, 8 to Node-1
    for (let i = 5; i < 8; i++) {
      await pages[i].evaluate((targetId) => {
        const p2p = (window as any)._p2pManagerForTest;
        p2p?.init();
        p2p?.connect(targetId);
      }, peerIds[0]);

      await connectPeers(pages[i], peerIds[0]);
      await connectPeers(pages[0], peerIds[i]);

      await pages[i].evaluate(() => {
        (window as any)._p2pManagerForTest?.requestFullSync?.();
      });
      await pages[0].evaluate(() => {
        (window as any)._p2pManagerForTest?.requestFullSync?.();
      });
    }

    // Assert all 8 nodes catch up to 210 active products
    await expect
      .poll(
        async () => {
          for (const p of pages) {
            await p
              .evaluate(() => {
                (window as any)._p2pManagerForTest?.requestFullSync?.();
              })
              .catch(() => {});
          }

          const counts = await Promise.all(
            pages.map((p) =>
              p.evaluate(() => {
                const dbSync = (window as any)._dbSyncForTest;
                const state = dbSync?.getState();
                return state?.products?.filter((item: any) => item.isActive !== false)?.length || 0;
              }),
            ),
          );
          return counts;
        },
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toEqual([210, 210, 210, 210, 210, 210, 210, 210]);
  });
});
