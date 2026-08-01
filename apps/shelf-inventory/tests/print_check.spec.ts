import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test('PDF Export should use iframe with srcdoc', async ({ page, context }) => {
  await setupPage(page);

  // Navigate to Catalog
  await page.locator('[data-testid="nav-item-nav.catalog"]').last().click();
  await dismissModals(page);
  await page.waitForTimeout(1000);

  // We want to verify that clicking the PDF button opens a new window
  // and that new window contains an iframe with srcdoc.

  // Capture new page (window.open)
  const [newPage] = await Promise.all([context.waitForEvent('page'), page.getByTestId('catalog-export-pdf').click()]);

  // Wait for the new page to fully load before checking for iframes
  await newPage.waitForLoadState('load', { timeout: 15000 }).catch(() => {});

  // Verify that there is an iframe in the new page
  await expect
    .poll(
      async () => {
        try {
          return await newPage.evaluate(() => document.querySelectorAll('iframe').length);
        } catch (_e) {
          return 0; // page might be navigating
        }
      },
      { timeout: 10000 },
    )
    .toBe(1);

  // Verify the iframe has srcdoc
  const srcdoc = await newPage.locator('iframe').getAttribute('srcdoc');
  expect(srcdoc).toBeTruthy();
  expect(srcdoc).toContain('<!DOCTYPE html>');
  expect(srcdoc).toContain('Catálogo');
});
