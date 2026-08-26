import { expect, type Page, test } from '@playwright/test';

/**
 * E2E tests for lib/errorTracking.ts (Sentry error tracking with an
 * offline-first IndexedDB queue).
 *
 * The module is loaded in-page through a dynamic import served by the Vite
 * dev server so IndexedDB, navigator.onLine and the window online/offline
 * events are the real browser implementations.
 *
 * The app is never booted: tests run against a bare HTML document on the same
 * origin as the dev server, keeping them fast and isolated.
 */

// Typed as a plain `string` (not a literal) so TypeScript treats the dynamic
// import as `Promise<any>` — the specifier only exists at runtime, served by
// the Vite dev server. Always passed explicitly to page.evaluate as its arg
// (Playwright does not capture outer-scope variables inside callbacks).
const MODULE_SPECIFIER: string = '/lib/errorTracking.ts';
const EMPTY_PAGE = '<!doctype html><html><body><p>errorTracking spec</p></body></html>';

async function routeEmptyPage(page: Page): Promise<void> {
  await page.route('**/error-tracking-test.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: EMPTY_PAGE }),
  );
}

test.describe('Sentry error tracking', () => {
  test('persists error payloads in the IndexedDB queue while offline', async ({ page, context }) => {
    await routeEmptyPage(page);
    await page.goto('/error-tracking-test.html');

    // Prefetch + cache the module in the browser module map while online, so
    // the offline capture below only touches indexDB and never the network.
    await page.evaluate(async (specifier: string) => {
      await import(specifier);
    }, MODULE_SPECIFIER);

    // Simulate the device going offline before the error is thrown.
    await context.setOffline(true);

    const result = await page.evaluate(async (specifier: string) => {
      const module: any = await import(specifier);
      const outcome = await module.captureError(new Error('offline-queue-e2e'), { source: 'errorTracking.spec' });
      const queued = await module.offlineQueue.count();
      const payload = (await module.offlineQueue.peekAll())[0] ?? null;
      return { outcome, queued, payload };
    }, MODULE_SPECIFIER);

    expect(result.outcome).toBe('queued');
    expect(result.queued).toBe(1);
    expect(result.payload.message).toBe('offline-queue-e2e');
    expect(result.payload.context.source).toBe('errorTracking.spec');
  });

  test('replays queued errors when the network comes back', async ({ page, context }) => {
    await routeEmptyPage(page);
    await page.goto('/error-tracking-test.html');

    // Initialise first (no DSN → graceful degradation) so the window
    // online/offline listeners that trigger the replay are registered.
    const initialized = await page.evaluate(async (specifier: string) => {
      const module: any = await import(specifier);
      return module.initErrorTracking('');
    }, MODULE_SPECIFIER);
    expect(initialized).toBe(false);

    await context.setOffline(true);

    const queued = await page.evaluate(async (specifier: string) => {
      const module: any = await import(specifier);
      await module.captureError(new Error('replay-after-reconnect'), { scenario: 'reconnect' });
      return module.offlineQueue.count();
    }, MODULE_SPECIFIER);
    expect(queued).toBe(1);

    // Bringing the network back fires the `online` event → queue is drained.
    await context.setOffline(false);

    await expect
      .poll(
        async () =>
          page.evaluate(async (specifier: string) => {
            const module: any = await import(specifier);
            return {
              count: await module.offlineQueue.count(),
              messages: module.getBreadcrumbs().map((crumb: { message?: string }) => crumb.message),
            };
          }, MODULE_SPECIFIER),
        { timeout: 15_000 },
      )
      .toEqual(
        expect.objectContaining({
          count: 0,
          messages: expect.arrayContaining(['Network is back online']),
        }),
      );
  });

  test('degrades gracefully when no DSN is configured', async ({ page }) => {
    await routeEmptyPage(page);
    await page.goto('/error-tracking-test.html');

    const result = await page.evaluate(async (specifier: string) => {
      const module: any = await import(specifier);
      let initThrew = false;
      let initialized: boolean;
      try {
        initialized = module.initErrorTracking('');
      } catch {
        initThrew = true;
        initialized = false;
      }
      let captureThrew = false;
      let outcome = 'n/a';
      try {
        outcome = await module.captureError(new Error('no-dsn-error'), { zone: 'graceful' });
      } catch {
        captureThrew = true;
      }
      return {
        initialized,
        initThrew,
        enabled: module.isErrorTrackingEnabled(),
        captureThrew,
        outcome,
        queueCount: await module.offlineQueue.count(),
      };
    }, MODULE_SPECIFIER);

    expect(result.initialized).toBe(false);
    expect(result.initThrew).toBe(false);
    expect(result.enabled).toBe(false);
    expect(result.captureThrew).toBe(false);
    expect(result.outcome).toBe('ignored');
    expect(result.queueCount).toBe(0);
  });

  test('records P2P breadcrumbs and attaches them to offline-queued errors', async ({ page, context }) => {
    await routeEmptyPage(page);
    await page.goto('/error-tracking-test.html');

    const crumbs = await page.evaluate(async (specifier: string) => {
      const module: any = await import(specifier);
      module.clearBreadcrumbs();
      module.addP2PBreadcrumb('peer_connected', 'Peer connected', { data: { peerId: 'peer-01' } });
      module.addP2PBreadcrumb('peer_sync_applied', 'Delta applied', { level: 'warning', data: { bytes: 42 } });
      return module.getBreadcrumbs().map((crumb: Record<string, unknown>) => ({
        category: crumb.category,
        type: crumb.type,
        level: crumb.level,
        message: crumb.message,
      }));
    }, MODULE_SPECIFIER);

    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]).toMatchObject({
      category: 'p2p',
      type: 'peer_connected',
      level: 'info',
      message: 'Peer connected',
    });
    expect(crumbs[1]).toMatchObject({
      category: 'p2p',
      type: 'peer_sync_applied',
      level: 'warning',
      message: 'Delta applied',
    });

    // An error captured while offline must carry the breadcrumb context along
    // so the replay preserves the P2P trail.
    await context.setOffline(true);
    const attached = await page.evaluate(async (specifier: string) => {
      const module: any = await import(specifier);
      await module.captureError(new Error('p2p-with-breadcrumbs'));
      const items = await module.offlineQueue.peekAll();
      return items[0]
        ? items[0].breadcrumbs.map((crumb: { type?: string; category?: string }) => crumb.type ?? crumb.category)
        : [];
    }, MODULE_SPECIFIER);
    expect(attached).toContain('peer_connected');
    expect(attached).toContain('peer_sync_applied');
  });
});
