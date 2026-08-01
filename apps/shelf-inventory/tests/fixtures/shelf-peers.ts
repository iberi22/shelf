import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { addOverlayBlocker, dismissModals } from '../helpers';
import { getLocalPeerId } from '../p2p-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PeerPermissions = {
  canViewProducts: boolean;
  canEditProducts: boolean;
  canViewSales: boolean;
  canEditSales: boolean;
  canViewClients: boolean;
  canEditClients: boolean;
  canViewSuppliers: boolean;
  canEditSuppliers: boolean;
  canViewPurchaseOrders: boolean;
  canEditPurchaseOrders: boolean;
  canViewReports: boolean;
  canViewArqueo: boolean;
  canViewDashboard: boolean;
};

// ---------------------------------------------------------------------------
// Permission presets
// ---------------------------------------------------------------------------

export const fullProductPermissions: PeerPermissions = {
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

export const readOnlyProductPermissions: PeerPermissions = {
  canViewProducts: true,
  canEditProducts: false,
  canViewSales: false,
  canEditSales: false,
  canViewClients: false,
  canEditClients: false,
  canViewSuppliers: false,
  canEditSuppliers: false,
  canViewPurchaseOrders: false,
  canEditPurchaseOrders: false,
  canViewReports: false,
  canViewArqueo: false,
  canViewDashboard: false,
};

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Wait for `_p2pManagerForTest` to be available on the page.
 */
export async function waitForPeerReady(page: Page, timeout = 30_000): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => Boolean((window as any)._p2pManagerForTest)),
      { timeout },
    )
    .toBe(true);
}

/**
 * Get the local peer ID from `_dbSyncForTest.localPeerId`.
 */
export async function getPeerId(page: Page): Promise<string> {
  const peerId = await getLocalPeerId(page);
  expect(peerId).toBeTruthy();
  return peerId;
}

/**
 * Connect all three peers in a full-mesh topology.
 * The adminPage is the authority — it initiates outgoing connections
 * to both collabPage and viewerPage.
 */
export async function connectAllPeers(
  adminPage: Page,
  collabPage: Page,
  viewerPage: Page,
): Promise<void> {
  const adminId = await getPeerId(adminPage);
  const collabId = await getPeerId(collabPage);
  const viewerId = await getPeerId(viewerPage);

  // Admin -> Collab
  await connectOneWay(adminPage, collabId);
  // Admin -> Viewer
  await connectOneWay(adminPage, viewerId);
  // Collab -> Viewer (full mesh)
  await connectOneWay(collabPage, viewerId);

  // Wait for bidirectional visibility on all sides
  await waitForPeerConnected(adminPage, collabId);
  await waitForPeerConnected(adminPage, viewerId);
  await waitForPeerConnected(collabPage, adminId);
  await waitForPeerConnected(collabPage, viewerId);
  await waitForPeerConnected(viewerPage, adminId);
  await waitForPeerConnected(viewerPage, collabId);
}

/**
 * Connect one peer to another (one-directional connect call + wait).
 */
async function connectOneWay(sourcePage: Page, targetPeerId: string): Promise<void> {
  await sourcePage.evaluate((targetId) => {
    (window as any)._p2pManagerForTest?.connect(targetId);
  }, targetPeerId);

  await expect
    .poll(
      async () =>
        sourcePage.evaluate((id) =>
          Boolean((window as any)._p2pManagerForTest?.isPeerConnected(id)),
        targetPeerId),
      { timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * Wait until a specific peer is connected on the given page.
 */
export async function waitForPeerConnected(page: Page, peerId: string, timeout = 30_000): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate((id) =>
          Boolean((window as any)._p2pManagerForTest?.isPeerConnected(id)),
        peerId),
      { timeout },
    )
    .toBe(true);
}

/**
 * Set a peer's role and permissions from the admin page.
 * The adminPage must be the master peer.
 */
export async function setupAsRole(
  adminPage: Page,
  targetPeerId: string,
  role: 'collaborator' | 'viewer' | 'custom',
  permissions: PeerPermissions,
): Promise<void> {
  await adminPage.evaluate(
    ({ targetPeerId, role, permissions }) => {
      const p2p = (window as any)._p2pManagerForTest;
      const dbSync = (window as any)._dbSyncForTest;
      if (!p2p || !dbSync) {
        throw new Error('P2P test hooks are unavailable');
      }
      const localPeerId = dbSync.localPeerId;
      if (!localPeerId) {
        throw new Error('Local peer id is not ready');
      }
      dbSync.setMasterPeerId(localPeerId);
      dbSync.updateLinkedNode(localPeerId, { role: 'admin', isMaster: true }, localPeerId);
      dbSync.updatePeerConfig(targetPeerId, role, permissions, localPeerId);
      dbSync.updateLinkedNode(targetPeerId, { role, permissions }, localPeerId);
      p2p.sendTo(targetPeerId, {
        type: 'CHANGE_ROLE',
        payload: { targetPeerId, role, permissions },
      });
      p2p.sendTo(targetPeerId, {
        type: 'UPDATE_PEER_PERMISSIONS',
        payload: { targetPeerId, role, permissions },
      });
    },
    { targetPeerId, role, permissions },
  );
}

/**
 * Create a product via dbSync.upsertEntity on the given page.
 */
export async function createProductViaDb(
  page: Page,
  product: { name: string; price: number; cost: number; quantity: number },
): Promise<void> {
  await page.evaluate(({ name, price, cost, quantity }) => {
    const dbSync = (window as any)._dbSyncForTest;
    if (!dbSync?.upsertEntity || !dbSync?.localPeerId) {
      throw new Error('P2P test hooks are unavailable');
    }
    dbSync.upsertEntity('products', {
      id: `e2e-${name.toLowerCase().replaceAll(' ', '-')}-${Date.now()}`,
      name,
      quantity,
      price,
      cost,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: dbSync.localPeerId,
    });
  }, product);
}

/**
 * Delete a product by name via dbSync on the given page.
 */
export async function deleteProductViaDb(page: Page, productName: string): Promise<void> {
  await page.evaluate((name) => {
    const dbSync = (window as any)._dbSyncForTest;
    if (!dbSync) throw new Error('dbSync not available');
    const state = dbSync.getState(dbSync.localPeerId);
    const product = (state?.products as any[])?.find((p: any) => p.name === name);
    if (!product) throw new Error(`Product "${name}" not found in local state`);
    dbSync.remove('products', product.id);
  }, productName);
}

/**
 * Edit a product's price via dbSync on the given page.
 */
export async function editProductPriceViaDb(
  page: Page,
  productName: string,
  newPrice: number,
): Promise<void> {
  await page.evaluate(({ name, price }) => {
    const dbSync = (window as any)._dbSyncForTest;
    if (!dbSync?.upsertEntity || !dbSync?.localPeerId) {
      throw new Error('P2P test hooks are unavailable');
    }
    const state = dbSync.getState(dbSync.localPeerId);
    const product = (state?.products as any[])?.find((p: any) => p.name === name);
    if (!product) throw new Error(`Product "${name}" not found in local state`);
    dbSync.upsertEntity('products', {
      ...product,
      price,
      updatedAt: new Date().toISOString(),
      updatedBy: dbSync.localPeerId,
    });
  }, { name: productName, price: newPrice });
}

/**
 * Get the count of products from dbSync state.
 */
export async function getProductCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    try {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync) return 0;
      const state = dbSync.getState(dbSync.localPeerId);
      return (state?.products as any[])?.length ?? 0;
    } catch {
      return 0;
    }
  });
}

/**
 * Disconnect a peer's P2P connection entirely.
 */
export async function disconnectPeer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const p2p = (window as any)._p2pManagerForTest;
    if (p2p?.disconnect) p2p.disconnect();
    else if (p2p?.destroy) p2p.destroy();
  });
}

/**
 * Reconnect a peer to a specific peer ID.
 */
export async function reconnectPeer(page: Page, targetPeerId: string): Promise<void> {
  await page.evaluate((id) => {
    (window as any)._p2pManagerForTest?.connect(id);
  }, targetPeerId);
}

// ---------------------------------------------------------------------------
// Playwright custom fixture
// ---------------------------------------------------------------------------

type ShelfPeersFixtures = {
  adminPage: Page;
  collabPage: Page;
  viewerPage: Page;
  adminContext: BrowserContext;
  collabContext: BrowserContext;
  viewerContext: BrowserContext;
};

export const test = base.extend<ShelfPeersFixtures>({
  adminContext: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    addOverlayBlocker(ctx);
    await use(ctx);
    await ctx.close();
  },

  collabContext: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    addOverlayBlocker(ctx);
    await use(ctx);
    await ctx.close();
  },

  viewerContext: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    addOverlayBlocker(ctx);
    await use(ctx);
    await ctx.close();
  },

  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage();
    await page.goto('/?testMode=true');
    await page.waitForTimeout(500);
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);
    await waitForPeerReady(page);
    await use(page);
  },

  collabPage: async ({ collabContext }, use) => {
    const page = await collabContext.newPage();
    await page.goto('/?testMode=true');
    await page.waitForTimeout(500);
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);
    await waitForPeerReady(page);
    await use(page);
  },

  viewerPage: async ({ viewerContext }, use) => {
    const page = await viewerContext.newPage();
    await page.goto('/?testMode=true');
    await page.waitForTimeout(500);
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);
    await waitForPeerReady(page);
    await use(page);
  },
});

export { expect };
