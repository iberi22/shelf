const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Go to the app
  await page.goto('http://localhost:3000');

  // Wait for app to load and go to Settings
  await page.click('[data-testid="nav-item-nav.settings"]');

  // Inject mock proposal via window._dbSyncForTest if available, or try to access dbSync
  await page.evaluate(() => {
    const dbSync = (window)._dbSyncForTest;
    if (dbSync && dbSync.doc) {
      const proposalsMap = dbSync.doc.getMap('proposals');
      proposalsMap.set('test-proposal', {
        id: 'test-proposal',
        targetPeerId: 'mock-peer-id',
        proposedRole: 'admin',
        createdBy: 'mock-peer-id',
        createdAt: Date.now(),
        expiresAt: Date.now() + 300000,
        status: 'active',
        votes: {}
      });
    }
  });

  // Wait a bit for UI to react
  await page.waitForTimeout(2000);

  // Scroll to the election section
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Elección de Admin'));
    if (el) el.scrollIntoView();
  });

  await page.screenshot({ path: 'admin_election_visible.png', fullPage: true });

  await browser.close();
})();
