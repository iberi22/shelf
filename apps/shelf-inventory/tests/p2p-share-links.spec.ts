import { expect, test } from '@playwright/test';
import { addOverlayBlocker, dismissModals, setupPage } from './helpers';

test.describe('P2P share links', () => {
  test.describe.configure({ mode: 'serial' });

  test('Exposes a PWA install link and a node invite link with the current peer id', async ({ page }) => {
    // Add overlay blocker to the page's context
    addOverlayBlocker(page.context());
    await setupPage(page);

    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);

    const peerIdLocator = page.locator('span.font-mono.text-yellow-400, code.font-mono.text-yellow-400').first();
    await peerIdLocator.waitFor({ state: 'visible' });
    await expect
      .poll(async () => page.evaluate(() => (window as any)._dbSyncForTest?.localPeerId || null), { timeout: 30000 })
      .toBeTruthy();
    const peerId = (await peerIdLocator.innerText()).split('\n')[0].trim();
    expect(peerId.length).toBeGreaterThan(0);

    const pwaLink = page.locator('[data-testid="p2p-pwa-link"]');
    const inviteLink = page.locator('[data-testid="p2p-invite-link"]');

    await expect(pwaLink).toBeAttached();
    // invite link is hidden (display:none) — verify it exists in DOM with correct href
    await expect(inviteLink).toBeAttached();

    const pwaHref = await pwaLink.getAttribute('href');
    const inviteHref = await inviteLink.getAttribute('href');

    if (!pwaHref || !inviteHref) {
      throw new Error('Missing share links');
    }

    const pwaUrl = new URL(pwaHref, page.url());
    const inviteUrl = new URL(inviteHref, page.url());

    expect(pwaUrl.search).toBe('');
    expect(inviteUrl.searchParams.get('invite')).toBe('true');
    expect(inviteUrl.searchParams.get('peerId')).toBe(peerId);
  });
});
