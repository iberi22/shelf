import { expect, test } from '@playwright/test';
import { setupPage } from './helpers';

test.describe('Settings mobile layout', () => {
  test('Settings cards stay within the mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const now = new Date().toISOString();
      localStorage.setItem(
        'shelfState',
        JSON.stringify({
          products: [],
          sales: [],
          clients: [],
          suppliers: [],
          purchaseOrders: [],
          peers: [],
          teamMembers: [],
          localPeerId: 'peer_mobile_layout_host_with_a_very_long_identifier_1234567890',
          role: 'admin',
          arqueoSessions: [],
          ocrResults: [],
          pendingEdits: [],
          productChangeHistory: [],
          auditLogs: [
            {
              id: 'mobile-log-1',
              timestamp: now,
              peerId: 'peer_mobile_layout_collaborator_with_a_very_long_identifier_abcdefghijk',
              peerRole: 'collaborator',
              action: 'BATCH_UPDATE_PRODUCTS',
              entityId: 'product_with_a_very_long_identifier_1234567890',
              entityType: 'product',
              details: {
                payload: {
                  toAdd: [{ id: 'product-new', name: 'Producto de prueba responsive' }],
                  toUpdate: [{ id: 'product-old', name: 'Producto existente responsive' }],
                },
              },
            },
          ],
        }),
      );
    });
    await setupPage(page);

    // Some mobile devices might not have the bottom nav items visible or clickable
    // if the viewport is too small or if they are behind other elements.
    // Try bottom nav first, if fails use the side menu.
    try {
      const bottomNavItem = page.locator('[data-testid="mobile-nav-item-nav.settings"]');
      await bottomNavItem.waitFor({ state: 'visible', timeout: 5000 });
      await bottomNavItem.click();
    } catch (_e) {
      const menuButton = page.locator('button[aria-label="Abrir menú"]');
      await expect(menuButton).toBeVisible({ timeout: 5000 });
      await menuButton.click();
      const sideNavItem = page.locator('[data-testid="nav-item-nav.settings"]');
      await sideNavItem.click();
    }

    await page.waitForTimeout(800);

    await expect(page.getByRole('heading', { name: /Configuración|Settings/, level: 2 })).toBeVisible();
    await expect(page.getByText(/Aplicar actualizaciones automáticamente/i)).toBeVisible();

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

    const p2pHeading = page.getByRole('heading', { name: /Secure P2P Sync/i }).first();
    const p2pCard = p2pHeading.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    const box = await p2pCard.boundingBox();

    expect(box).not.toBeNull();
    expect(box?.x ?? 0).toBeGreaterThanOrEqual(0);
    expect(box?.width ?? 0).toBeLessThanOrEqual(390);

    const firstPanel = page.locator('main > div:last-child > div > div').first();
    const firstPanelBox = await firstPanel.boundingBox();
    expect(firstPanelBox).not.toBeNull();

    const panelBoxes = await page.locator('main > div:last-child > div > div').evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            width: Math.round(rect.width),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            text: element.textContent || '',
          };
        })
        .filter((item) => item.width > 0 && item.text.trim().length > 0),
    );

    const expectedWidth = Math.round(firstPanelBox?.width ?? 0);
    for (const panel of panelBoxes) {
      expect(panel.left).toBeGreaterThanOrEqual(0);
      expect(panel.right).toBeLessThanOrEqual(390);
      expect(Math.abs(panel.width - expectedWidth)).toBeLessThanOrEqual(1);
    }

    await expect(page.getByRole('heading', { name: /Audit Logs/i })).toBeVisible();
    await expect(page.locator('.responsive-table td[data-label="Peer ID"]').first()).toBeVisible();

    const logMetrics = await page.evaluate(() => {
      const auditPanel = Array.from(document.querySelectorAll('main div')).find((element) =>
        element.textContent?.includes('Audit Logs'),
      );
      const table = document.querySelector('.responsive-table');
      const row = document.querySelector('.responsive-table tbody tr');
      const panelRect = auditPanel?.getBoundingClientRect();
      const tableRect = table?.getBoundingClientRect();
      const rowRect = row?.getBoundingClientRect();
      return {
        bodyScrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        panelRight: panelRect?.right ?? 0,
        tableRight: tableRect?.right ?? 0,
        rowRight: rowRect?.right ?? 0,
      };
    });

    expect(logMetrics.bodyScrollWidth).toBeLessThanOrEqual(logMetrics.clientWidth);
    expect(logMetrics.panelRight).toBeLessThanOrEqual(390);
    expect(logMetrics.tableRight).toBeLessThanOrEqual(390);
    expect(logMetrics.rowRight).toBeLessThanOrEqual(390);
  });
});
