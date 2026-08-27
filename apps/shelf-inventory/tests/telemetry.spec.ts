import { expect, type Page, test } from '@playwright/test';
import { setupPage } from './helpers';

/**
 * E2E coverage for the GA4 offline-first telemetry pipeline, running against
 * the real app: events are queued in IndexedDB and flushed to the GA4
 * Measurement Protocol endpoint (intercepted via page.route) when online.
 *
 * The dev:test server runs with fake GA4 credentials
 * (VITE_GA4_MEASUREMENT_ID=G-TEST / VITE_GA4_API_SECRET=test-secret) so the
 * provider is configured and actually POSTs — see playwright.config.ts.
 */

const GA_URL_GLOB = '**/mp/collect*';

type GAPayload = {
  client_id: string;
  user_id?: string;
  events: Array<{ name: string; timestamp_micros: number }>;
};

/** Reads the telemetry event queue straight from IndexedDB in the page. */
async function readQueuedEvents(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('shelf-telemetry', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('events', 'readonly');
    const request = tx.objectStore('events').getAll();
    return await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
      request.onerror = () => reject(request.error);
    });
  });
}

test.describe('GA4 offline-first telemetry', () => {
  test.setTimeout(60_000);

  test('flushes tracked events to the Measurement Protocol endpoint when online', async ({ page }) => {
    const gaRequests: GAPayload[] = [];
    await page.route(GA_URL_GLOB, async (route) => {
      const body = (route.request().postDataJSON() ?? {}) as GAPayload;
      if (body.events) gaRequests.push(body);
      await route.fulfill({ status: 204, body: '' });
    });

    await setupPage(page);

    // The app tracks app_init on mount; the provider flushes it promptly.
    await expect.poll(() => gaRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);

    const appInit = gaRequests.find((request) => request.events.some((event) => event.name === 'app_init'));
    expect(appInit).toBeTruthy();
    expect(appInit?.client_id).toBeTruthy();
    expect(appInit?.events[0]?.timestamp_micros).toBeGreaterThan(0);

    // Successful flushes drain the IndexedDB queue.
    await expect.poll(async () => readQueuedEvents(page), { timeout: 10_000 }).toEqual([]);
  });

  test('queues events in IndexedDB while offline and flushes them when connectivity returns', async ({ page }) => {
    const context = page.context();
    const gaRequests: GAPayload[] = [];
    await page.route(GA_URL_GLOB, async (route) => {
      const body = (route.request().postDataJSON() ?? {}) as GAPayload;
      if (body.events) gaRequests.push(body);
      await route.fulfill({ status: 204, body: '' });
    });

    // 1. Load the app online, then take the whole context offline.
    await setupPage(page);
    await context.setOffline(true);

    // 2. Track an event while offline (test-only hook, see lib/telemetry.ts).
    await page.evaluate(() => {
      (window as any)._telemetryForTest?.trackEvent('offline_cart_view', {
        items: 2,
        source: 'e2e',
      });
    });

    // 3. Event is persisted in IndexedDB and NOT sent yet.
    await expect.poll(async () => readQueuedEvents(page), { timeout: 10_000 }).not.toEqual([]);
    const queuedBefore = await readQueuedEvents(page);
    expect(queuedBefore.some((event) => event.name === 'offline_cart_view')).toBe(true);
    expect(gaRequests.some((request) => request.events.some((event) => event.name === 'offline_cart_view'))).toBe(
      false,
    );

    // 4. Going back online triggers the flush (online event listener).
    await context.setOffline(false);
    await expect
      .poll(() => gaRequests.some((request) => request.events.some((event) => event.name === 'offline_cart_view')), {
        timeout: 15_000,
      })
      .toBe(true);

    // 5. The queue is drained after a successful send.
    await expect.poll(async () => readQueuedEvents(page), { timeout: 10_000 }).toEqual([]);
  });
});
