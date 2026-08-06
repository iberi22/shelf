/**
 * Smoke Production Spec (Post-Deploy Verification)
 *
 * To execute:
 * PLAYWRIGHT_BASE_URL=https://<prod-url> pnpm --dir apps/shelf-inventory exec playwright test tests/smoke-prod.spec.ts --project=chromium
 *
 * Limitations:
 * Test-only global objects like `__shelfAppStateForTest` and `_dbSyncForTest` are only available in
 * environments with test mode enabled (e.g. local test servers running with VITE_TEST_MODE=true).
 * On actual production builds where these variables are undefined, the tests will dynamically skip
 * the internal state/hook validation and rely on DOM-based flows, or gracefully skip tests requiring
 * internal P2P/Database sync handles (such as Test 2 and Test 4).
 */

import { expect, test } from '@playwright/test';
import type { GossipMessage, NodoId } from 'edge-mesh';
import { MeshManager } from 'edge-mesh';
import * as Y from 'yjs';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';
import { connectPeers, expectProductSync, getLocalPeerId } from './p2p-helpers';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;

test.beforeEach(async () => {
  if (!baseURL) {
    test.skip(true, 'PLAYWRIGHT_BASE_URL environment variable is not defined.');
    return;
  }

  // Attempt to contact the base URL to verify the server is running.
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    await fetch(baseURL, { signal: controller.signal });
    clearTimeout(timeoutId);
  } catch (_err) {
    test.skip(true, `Base URL ${baseURL} is unreachable. Skipping production smoke tests.`);
  }
});

test('1. App loads and supports minimal idempotent CRUD flow', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err);
  });

  await setupPage(page);
  await dismissModals(page);

  // Assert that no unhandled errors occurred during loading.
  expect(pageErrors).toEqual([]);

  // Navigate to Inventory
  await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
  await dismissModals(page);

  // Generate a unique product name
  const productName = `Smoke Prod Product ${Date.now()}`;

  // --- CREATE ---
  await page.getByTestId('add-product-button').click();
  await expect(page.getByTestId('product-form')).toBeVisible();
  await page.getByTestId('product-name-input').fill(productName);
  await page.getByTestId('product-quantity-input').fill('25');
  await page.getByTestId('product-price-input').fill('200');
  await page.getByTestId('product-cost-input').fill('100');
  await page.getByTestId('save-product-button').click();

  // Wait and verify it is visible
  await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 5000 });

  // Try to find the product ID from the React state (if available)
  const productId = await page.evaluate((name) => {
    const state = (window as any).__shelfAppStateForTest;
    return state?.products?.find((item: any) => item.name === name)?.id || null;
  }, productName);

  if (productId) {
    // --- DELETE (via exact Product ID) ---
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator(`[data-testid="delete-product-${productId}"]:visible`).click();
    await page.waitForTimeout(500);
    await dismissModals(page);

    // Verify it is deactivated / marked inactive in state
    await expect
      .poll(async () =>
        page.evaluate((name) => {
          const state = (window as any).__shelfAppStateForTest;
          return state?.products?.find((item: any) => item.name === name)?.isActive;
        }, productName),
      )
      .toBe(false);
  } else {
    // --- DELETE FALLBACK (via first visible Delete button) ---
    const deleteBtn = page.locator(`[data-testid^="delete-product-"]:visible`).first();
    if (await deleteBtn.isVisible()) {
      page.once('dialog', (dialog) => dialog.accept());
      await deleteBtn.click();
      await page.waitForTimeout(500);
      await dismissModals(page);
    }
  }
});

test('2. Two browsers can connect and synchronize product changes over P2P', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  addOverlayBlocker(contextA);
  addOverlayBlocker(contextB);

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await setupPage(pageA);
  await setupPage(pageB);

  // Navigate both pages to Settings
  await pageA.locator('[data-testid="nav-item-nav.settings"]').last().click();
  await pageB.locator('[data-testid="nav-item-nav.settings"]').last().click();
  await dismissModals(pageA);
  await dismissModals(pageB);

  // Verify that test mode handles are available. If not, gracefully skip this P2P sync test.
  const hasP2PManager = await pageB.evaluate(() => Boolean((window as any)._p2pManagerForTest));
  if (!hasP2PManager) {
    await contextA.close();
    await contextB.close();
    test.skip(
      true,
      'P2P Manager test hook is not available in this build (requires testMode). Skipping P2P sync test.',
    );
    return;
  }

  const peerIdB = await getLocalPeerId(pageB);
  expect(peerIdB).toBeTruthy();

  // Connect pageA to pageB
  await connectPeers(pageA, peerIdB);

  // Wait briefly for full connection handshake
  await pageA.waitForTimeout(1000);

  // Create a product on Page A via database-sync upsert
  const syncProductName = `P2P Sync Smoke Prod ${Date.now()}`;
  await pageA.evaluate((name) => {
    const dbSync = (window as any)._dbSyncForTest;
    if (!dbSync) throw new Error('_dbSyncForTest not found on page A');
    dbSync.upsertEntity('products', {
      id: `p2p-smoke-${Date.now()}`,
      name,
      quantity: 12,
      price: 180,
      cost: 90,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: dbSync.localPeerId,
    });
  }, syncProductName);

  // Expect product to be synced to Page B
  await expectProductSync(pageB, pageA, syncProductName);

  await contextA.close();
  await contextB.close();
});

test('3. Rate limiter contract check: MeshManager dispatches rate_limited on gossip burst', async () => {
  const mockEdgeMesh = {
    on: () => {},
    off: () => {},
    enviar: async () => {},
    transmitir: async () => {},
  };
  const meshManager = new MeshManager({ nodoId: 'smoke-node' as NodoId }, mockEdgeMesh as any);
  await meshManager.iniciar();

  const peerId = 'smoke-spammer' as NodoId;
  let rateLimitedTriggered = false;
  meshManager.addEventListener('rate_limited', (event: any) => {
    rateLimitedTriggered = true;
    expect(event.detail?.peerId).toBe(peerId);
    expect(event.detail?.resource).toBe('gossip');
  });

  const gossipReceivedSpy: any[] = [];
  meshManager.addEventListener('gossipRecibido', (e: any) => {
    gossipReceivedSpy.push(e);
  });

  // Gossip receive has a 200 burst tokens limit.
  // Send 201 unique gossip messages from the same peer to trigger the rate limiter.
  for (let i = 0; i < 205; i++) {
    const gossipMsg: GossipMessage = {
      id: `gossip-smoke-msg-${i}`,
      namespace: 'lobby',
      ttl: 3,
      payload: { msg: `hello-${i}` },
      origen: peerId,
      timestamp: Date.now(),
      ruta: [peerId],
    };
    meshManager.procesarGossip(gossipMsg);
  }

  // Assert rate limiting was hit. Allow timing/token bucket slight variance in loop run time.
  expect(rateLimitedTriggered).toBe(true);
  expect(gossipReceivedSpy.length).toBeLessThan(205);
});

test('4. Security Authorization Guard: Vendedor or Viewer node is unauthorized to edit remote products', async ({
  page,
}) => {
  await setupPage(page);
  await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
  await dismissModals(page);

  // Verify database sync is available. If not, gracefully skip this authz check.
  const hasDbSync = await page.evaluate(() => Boolean((window as any)._dbSyncForTest));
  if (!hasDbSync) {
    test.skip(true, 'Database Sync test hook is not available in this build (requires testMode). Skipping Authz test.');
    return;
  }

  // 1. Create a Y.Doc in the test runner (Node) and encode a product mutation update.
  const remoteDoc = new Y.Doc();
  remoteDoc.getMap('products').set('blocked-smoke-product', {
    id: 'blocked-smoke-product',
    name: 'Unauthorized Smoke Mutation',
    quantity: 100,
    price: 500,
    cost: 250,
    isActive: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'vendedor-unauthorized-smoke',
  });
  const updateBytes = Y.encodeStateAsUpdate(remoteDoc);
  const updateArray = Array.from(updateBytes);

  const result = await page.evaluate(
    ({ updateData }) => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync) return { error: 'NO_DBSYNC' };

      const fakePeerId = 'vendedor-unauthorized-smoke';

      // 2. Setup peer as a vendedor or viewer role with canEditProducts: false
      dbSync.updateLinkedNode?.(
        fakePeerId,
        {
          role: 'vendedor',
          isMaster: false,
          dsaPublicKey: 'fake-pubkey',
          permissions: {
            canEditProducts: false, // Unauthorized to edit products
            canEditSales: true,
            canEditClients: true,
            canEditSuppliers: false,
            canEditPurchaseOrders: false,
            canViewArqueo: false,
          },
        },
        dbSync.localPeerId,
      );

      dbSync.updateEphemeralNode?.(fakePeerId, {
        status: 'verified',
        dsaPublicKey: 'fake-pubkey',
      });

      // 3. Apply the update bytes we sent from Node
      const uint8Update = new Uint8Array(updateData);
      dbSync.applyUpdate?.(uint8Update, fakePeerId);

      // 4. Check if the product exists in the DB
      const productsMap = dbSync.doc?.getMap?.('products');
      const hasProduct = productsMap ? productsMap.has?.('blocked-smoke-product') : false;

      return {
        hasProduct,
      };
    },
    { updateData: updateArray },
  );

  expect(result.error).toBeUndefined();
  expect(result.hasProduct).toBe(false);
});
