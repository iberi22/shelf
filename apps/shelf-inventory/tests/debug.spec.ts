import { test } from '@playwright/test';
import { setupPage } from './helpers';

test('debug nav-items', async ({ page }) => {
  await setupPage(page);
  await page.waitForTimeout(1000);

  const html = await page.evaluate(() => {
    // Check localStorage
    const ls = { hasVisited: localStorage.getItem('hasVisited'), shelfWelcomeSeen: localStorage.getItem('shelfWelcomeSeen') };
    
    // Check all data-testid attributes
    const testIds = Array.from(document.querySelectorAll('[data-testid]')).map(el => el.getAttribute('data-testid'));
    
    // Check for nav items
    const navItems = Array.from(document.querySelectorAll('[data-testid^="nav-item"]')).map(el => ({
      testid: el.getAttribute('data-testid'),
      visible: (el as HTMLElement).offsetParent !== null,
      rect: el.getBoundingClientRect(),
    }));

    // Check for sidebar
    const sidebarHTML = document.querySelector('[class*="sidebar"]')?.innerHTML?.substring(0, 500);

    return JSON.stringify({ ls, testIds, navItems, sidebarHTML }, null, 2);
  });

  console.log('DEBUG:', html);
});
