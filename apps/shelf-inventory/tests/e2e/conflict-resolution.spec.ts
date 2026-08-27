import { expect, type Page, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from '../helpers';
import { connectPeers, expectProductSync, getLocalPeerId } from '../p2p-helpers';

async function setupMeshRoles(node1Page: Page, node2Page: Page, node1Id: string, node2Id: string) {
  const node1DsaKey = await node1Page.evaluate(() => {
    const p2p = (window as any)._p2pManagerForTest;
    const keyBytes = p2p?.dsaKeyPair?.publicKey;
    return keyBytes ? Array.from(keyBytes, (b: number) => b.toString(16).padStart(2, '0')).join('') : null;
  });

  const node2DsaKey = await node2Page.evaluate(() => {
    const p2p = (window as any)._p2pManagerForTest;
    const keyBytes = p2p?.dsaKeyPair?.publicKey;
    return keyBytes ? Array.from(keyBytes, (b: number) => b.toString(16).padStart(2, '0')).join('') : null;
  });

  await node1Page.evaluate(
    ({ adminId, collabId, adminKey, collabKey }) => {
      const dbSync = (window as any)._dbSyncForTest;
      if (dbSync) {
        dbSync.setMasterPeerId(adminId);
        dbSync.updateLinkedNode(adminId, { role: 'admin', isMaster: true, dsaPublicKey: adminKey });
        dbSync.updateLinkedNode(collabId, {
          role: 'collaborator',
          isMaster: false,
          dsaPublicKey: collabKey,
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
        });
        dbSync.updateEphemeralNode(collabId, { status: 'verified', dsaPublicKey: collabKey });
      }
    },
    { adminId: node1Id, collabId: node2Id, adminKey: node1DsaKey, collabKey: node2DsaKey },
  );

  await node2Page.evaluate(
    ({ adminId, collabId, adminKey, collabKey }) => {
      const dbSync = (window as any)._dbSyncForTest;
      if (dbSync) {
        dbSync.setMasterPeerId(adminId);
        dbSync.updateLinkedNode(adminId, { role: 'admin', isMaster: true, dsaPublicKey: adminKey });
        dbSync.updateLinkedNode(collabId, {
          role: 'collaborator',
          isMaster: false,
          dsaPublicKey: collabKey,
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
        });
        dbSync.updateEphemeralNode(adminId, { status: 'verified', dsaPublicKey: adminKey });
      }
    },
    { adminId: node1Id, collabId: node2Id, adminKey: node1DsaKey, collabKey: node2DsaKey },
  );
}

async function waitForPeersConnectedAndLinked(page1: Page, page1TargetId: string, page2: Page, page2TargetId: string) {
  await expect
    .poll(
      async () => {
        return page1.evaluate((targetId) => {
          const mgr = (window as any)._p2pManagerForTest;
          const db = (window as any)._dbSyncForTest;
          const isConnected = Boolean(mgr?.isPeerConnected(targetId));
          const hasLinked = (db?.getLinkedNodes?.()?.length || 0) >= 1;
          return isConnected && hasLinked;
        }, page1TargetId);
      },
      { timeout: 30000 },
    )
    .toBe(true);

  await expect
    .poll(
      async () => {
        return page2.evaluate((targetId) => {
          const mgr = (window as any)._p2pManagerForTest;
          const db = (window as any)._dbSyncForTest;
          const isConnected = Boolean(mgr?.isPeerConnected(targetId));
          const hasLinked = (db?.getLinkedNodes?.()?.length || 0) >= 1;
          return isConnected && hasLinked;
        }, page2TargetId);
      },
      { timeout: 30000 },
    )
    .toBe(true);

  await page1.waitForTimeout(500);
  await page2.waitForTimeout(500);
}

test.describe('CRDT Conflict Resolution — Concurrent Product Edits', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test('Concurrent per-field edits (qty=20, price=75) merge correctly after reconnect', async ({ browser }) => {
    const node1Context = await browser.newContext();
    const node2Context = await browser.newContext();
    addOverlayBlocker(node1Context);
    addOverlayBlocker(node2Context);

    const node1Page = await node1Context.newPage();
    const node2Page = await node2Context.newPage();

    await setupPage(node1Page);
    await setupPage(node2Page);

    await node1Page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await node2Page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(node1Page);
    await dismissModals(node2Page);

    const node1Id = await getLocalPeerId(node1Page);
    const node2Id = await getLocalPeerId(node2Page);

    for (const page of [node1Page, node2Page]) {
      await page.evaluate(() => {
        const dbSync = (window as any)._dbSyncForTest;
        if (dbSync) {
          const config = dbSync.getInventoryConfig() || {
            variantAttributes: ['Color', 'Medida'],
            fields: [],
            measureOptions: [],
            productHistoryLimit: 5,
          };
          dbSync.setInventoryConfig({
            ...config,
            autoApplyProductUpdates: true,
          });
        }
      });
    }

    await setupMeshRoles(node1Page, node2Page, node1Id, node2Id);
    await connectPeers(node1Page, node2Id);
    await waitForPeersConnectedAndLinked(node1Page, node2Id, node2Page, node1Id);

    // Node 1 creates initial product "Widget" (qty=10, price=50)
    await node1Page.evaluate((peerId) => {
      const dbSync = (window as any)._dbSyncForTest;
      dbSync?.upsertEntity('products', {
        id: 'prod-widget',
        name: 'Widget',
        quantity: 10,
        price: 50,
        cost: 20,
        isActive: true,
        updatedAt: new Date().toISOString(),
        updatedBy: peerId,
      });
    }, node1Id);

    await expectProductSync(node2Page, node1Page, 'Widget');

    const initialOnNode2 = await node2Page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      return dbSync?.getState()?.products?.find((p: any) => p.name === 'Widget');
    });
    expect(initialOnNode2).toBeTruthy();
    expect(initialOnNode2.quantity).toBe(10);
    expect(initialOnNode2.price).toBe(50);

    // Both nodes go offline (disconnect transport)
    await node1Page.evaluate((targetId) => {
      (window as any)._p2pManagerForTest?.disconnectPeer(targetId);
    }, node2Id);
    await node2Page.evaluate((targetId) => {
      (window as any)._p2pManagerForTest?.disconnectPeer(targetId);
    }, node1Id);

    await node1Page.waitForTimeout(1000);
    await node2Page.waitForTimeout(1000);

    // Node 1 sets qty=20 offline
    await node1Page.evaluate((peerId) => {
      const dbSync = (window as any)._dbSyncForTest;
      const current = dbSync?.getState()?.products?.find((p: any) => p.id === 'prod-widget');
      if (current) {
        dbSync.upsertEntity('products', {
          ...current,
          quantity: 20,
          updatedAt: new Date().toISOString(),
          updatedBy: peerId,
        });
      }
    }, node1Id);

    // Node 2 sets price=75 offline
    await node2Page.evaluate((peerId) => {
      const dbSync = (window as any)._dbSyncForTest;
      const current = dbSync?.getState()?.products?.find((p: any) => p.id === 'prod-widget');
      if (current) {
        dbSync.upsertEntity('products', {
          ...current,
          price: 75,
          updatedAt: new Date().toISOString(),
          updatedBy: peerId,
        });
      }
    }, node2Id);

    // Both nodes reconnect transport
    await connectPeers(node1Page, node2Id);
    await waitForPeersConnectedAndLinked(node1Page, node2Id, node2Page, node1Id);

    await node1Page.evaluate(() => (window as any)._p2pManagerForTest?.requestFullSync?.());
    await node2Page.evaluate(() => (window as any)._p2pManagerForTest?.requestFullSync?.());

    // Assert both nodes merge to qty=20 AND price=75
    await expect
      .poll(
        async () => {
          const p1 = await node1Page.evaluate(() => {
            const dbSync = (window as any)._dbSyncForTest;
            return dbSync?.getState()?.products?.find((p: any) => p.id === 'prod-widget');
          });
          const p2 = await node2Page.evaluate(() => {
            const dbSync = (window as any)._dbSyncForTest;
            return dbSync?.getState()?.products?.find((p: any) => p.id === 'prod-widget');
          });
          return p1?.quantity === 20 && p1?.price === 75 && p2?.quantity === 20 && p2?.price === 75;
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await node1Context.close();
    await node2Context.close();
  });

  test('Same field concurrent edits resolve via last-timestamp-wins', async ({ browser }) => {
    const node1Context = await browser.newContext();
    const node2Context = await browser.newContext();
    addOverlayBlocker(node1Context);
    addOverlayBlocker(node2Context);

    const node1Page = await node1Context.newPage();
    const node2Page = await node2Context.newPage();

    await setupPage(node1Page);
    await setupPage(node2Page);

    await node1Page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await node2Page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(node1Page);
    await dismissModals(node2Page);

    const node1Id = await getLocalPeerId(node1Page);
    const node2Id = await getLocalPeerId(node2Page);

    for (const page of [node1Page, node2Page]) {
      await page.evaluate(() => {
        const dbSync = (window as any)._dbSyncForTest;
        if (dbSync) {
          const config = dbSync.getInventoryConfig() || {
            variantAttributes: ['Color', 'Medida'],
            fields: [],
            measureOptions: [],
            productHistoryLimit: 5,
          };
          dbSync.setInventoryConfig({
            ...config,
            autoApplyProductUpdates: true,
          });
        }
      });
    }

    await setupMeshRoles(node1Page, node2Page, node1Id, node2Id);
    await connectPeers(node1Page, node2Id);
    await waitForPeersConnectedAndLinked(node1Page, node2Id, node2Page, node1Id);

    await node1Page.evaluate((peerId) => {
      const dbSync = (window as any)._dbSyncForTest;
      dbSync?.upsertEntity('products', {
        id: 'prod-lww-qty',
        name: 'LWW Widget',
        quantity: 10,
        price: 50,
        cost: 20,
        isActive: true,
        updatedAt: new Date(Date.now() - 10000).toISOString(),
        updatedBy: peerId,
      });
    }, node1Id);

    await expectProductSync(node2Page, node1Page, 'LWW Widget');

    // Both nodes go offline
    await node1Page.evaluate((targetId) => {
      (window as any)._p2pManagerForTest?.disconnectPeer(targetId);
    }, node2Id);
    await node2Page.evaluate((targetId) => {
      (window as any)._p2pManagerForTest?.disconnectPeer(targetId);
    }, node1Id);

    await node1Page.waitForTimeout(1000);
    await node2Page.waitForTimeout(1000);

    const earlierTimestamp = new Date(Date.now() - 5000).toISOString();
    await node1Page.evaluate(
      ({ peerId, ts }) => {
        const dbSync = (window as any)._dbSyncForTest;
        const current = dbSync?.getState()?.products?.find((p: any) => p.id === 'prod-lww-qty');
        if (current) {
          dbSync.upsertEntity('products', {
            ...current,
            quantity: 30,
            updatedAt: ts,
            updatedBy: peerId,
          });
        }
      },
      { peerId: node1Id, ts: earlierTimestamp },
    );

    const laterTimestamp = new Date(Date.now()).toISOString();
    await node2Page.evaluate(
      ({ peerId, ts }) => {
        const dbSync = (window as any)._dbSyncForTest;
        const current = dbSync?.getState()?.products?.find((p: any) => p.id === 'prod-lww-qty');
        if (current) {
          dbSync.upsertEntity('products', {
            ...current,
            quantity: 40,
            updatedAt: ts,
            updatedBy: peerId,
          });
        }
      },
      { peerId: node2Id, ts: laterTimestamp },
    );

    await connectPeers(node1Page, node2Id);
    await waitForPeersConnectedAndLinked(node1Page, node2Id, node2Page, node1Id);

    await node1Page.evaluate(() => (window as any)._p2pManagerForTest?.requestFullSync?.());
    await node2Page.evaluate(() => (window as any)._p2pManagerForTest?.requestFullSync?.());

    // Both nodes should converge on qty=40 (later timestamp)
    await expect
      .poll(
        async () => {
          const p1 = await node1Page.evaluate(() => {
            const dbSync = (window as any)._dbSyncForTest;
            return dbSync?.getState()?.products?.find((p: any) => p.id === 'prod-lww-qty');
          });
          const p2 = await node2Page.evaluate(() => {
            const dbSync = (window as any)._dbSyncForTest;
            return dbSync?.getState()?.products?.find((p: any) => p.id === 'prod-lww-qty');
          });
          return p1?.quantity === 40 && p2?.quantity === 40;
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await node1Context.close();
    await node2Context.close();
  });

  test('Tampered envelope signature is rejected and update is dropped', async ({ browser }) => {
    const node1Context = await browser.newContext();
    const node2Context = await browser.newContext();
    addOverlayBlocker(node1Context);
    addOverlayBlocker(node2Context);

    const node1Page = await node1Context.newPage();
    const node2Page = await node2Context.newPage();

    await setupPage(node1Page);
    await setupPage(node2Page);

    await node1Page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await node2Page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(node1Page);
    await dismissModals(node2Page);

    const node1Id = await getLocalPeerId(node1Page);
    const node2Id = await getLocalPeerId(node2Page);

    await setupMeshRoles(node1Page, node2Page, node1Id, node2Id);
    await connectPeers(node1Page, node2Id);
    await waitForPeersConnectedAndLinked(node1Page, node2Id, node2Page, node1Id);

    await node2Page.evaluate((peerId) => {
      const dbSync = (window as any)._dbSyncForTest;
      dbSync?.upsertEntity('products', {
        id: 'prod-tamper-check',
        name: 'Secure Widget',
        quantity: 10,
        price: 50,
        cost: 20,
        isActive: true,
        updatedAt: new Date().toISOString(),
        updatedBy: peerId,
      });
    }, node2Id);

    const tamperedMessage = await node1Page.evaluate(
      ({ prodId, node1PeerId }) => {
        const p2p = (window as any)._p2pManagerForTest;
        const dbSync = (window as any)._dbSyncForTest;
        if (!p2p || !dbSync) return null;

        const Y = (window as any).Y || dbSync.doc?.constructor;
        if (!Y) return null;

        const doc = new Y();
        doc.getMap('products').set(prodId, {
          id: prodId,
          name: 'Secure Widget',
          quantity: 10,
          price: 999,
          cost: 20,
          isActive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: node1PeerId,
        });

        // Encode update bytes
        const updateBytes = dbSync.getLocalUpdate ? dbSync.getLocalUpdate.call({ doc }) : new Uint8Array();
        if (!updateBytes || updateBytes.length === 0) return null;

        const validSigBytes = p2p.sign(updateBytes);
        const updateHex = Array.from(updateBytes, (b: number) => b.toString(16).padStart(2, '0')).join('');
        const validSigHex = Array.from(validSigBytes, (b: number) => b.toString(16).padStart(2, '0')).join('');

        const tamperedSig = validSigHex.slice(0, -1) + (validSigHex.endsWith('0') ? '1' : '0');

        return {
          type: 'YJS_UPDATE',
          payload: {
            update: updateHex,
            signature: tamperedSig,
            signerPeerId: node1PeerId,
            timestamp: Date.now(),
          },
        };
      },
      { prodId: 'prod-tamper-check', node1PeerId: node1Id },
    );

    expect(tamperedMessage).toBeTruthy();

    await node1Page.evaluate(
      ({ targetPeerId, msg }) => {
        const p2p = (window as any)._p2pManagerForTest;
        p2p?.sendTo(targetPeerId, msg);
      },
      { targetPeerId: node2Id, msg: tamperedMessage },
    );

    await node2Page.waitForTimeout(1000);

    const priceOnNode2 = await node2Page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      return dbSync?.getState()?.products?.find((p: any) => p.id === 'prod-tamper-check')?.price;
    });

    expect(priceOnNode2).toBe(50);

    await node1Context.close();
    await node2Context.close();
  });
});
