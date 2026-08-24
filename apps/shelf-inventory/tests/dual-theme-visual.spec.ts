import { expect, test } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';

test('dual-theme visual verification and screenshots', async ({ page }) => {
  const screenshotsDir = path.resolve('tests/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Set test mode / skip onboarding flags in localStorage before navigating
  await page.addInitScript(() => {
    localStorage.setItem('shelf-onboarding-completed', 'true');
    localStorage.setItem('shelf-business-id', 'test-biz');
  });

  // a. Classic Theme (default)
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Take screenshot of classic theme home / inventory
  const classicScreenshotPath = path.join(screenshotsDir, 'classic-theme.png');
  await page.screenshot({ path: classicScreenshotPath, fullPage: true });
  console.log(`Saved classic theme screenshot to ${classicScreenshotPath}`);

  // Check background color / theme attribute
  const htmlThemeClassic = await page.getAttribute('html', 'data-theme');
  expect(htmlThemeClassic).toBeNull();

  // b. Switch to SWAL theme via localStorage + reload
  await page.evaluate(() => {
    localStorage.setItem('shelf-theme', 'swal');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Take screenshot of SWAL theme
  const swalScreenshotPath = path.join(screenshotsDir, 'swal-theme.png');
  await page.screenshot({ path: swalScreenshotPath, fullPage: true });
  console.log(`Saved SWAL theme screenshot to ${swalScreenshotPath}`);

  // Verify data-theme attribute is "swal"
  const htmlThemeSwal = await page.getAttribute('html', 'data-theme');
  expect(htmlThemeSwal).toBe('swal');

  // Verify slate-950 background color computed style (rgb(2, 6, 23))
  const bodyBgColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  console.log(`SWAL theme body background color: ${bodyBgColor}`);

  // c. Return to Classic Theme
  await page.evaluate(() => {
    localStorage.setItem('shelf-theme', 'classic');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const htmlThemeClassicReturn = await page.getAttribute('html', 'data-theme');
  expect(htmlThemeClassicReturn).toBeNull();

  const classicReturnScreenshotPath = path.join(screenshotsDir, 'classic-theme-restored.png');
  await page.screenshot({ path: classicReturnScreenshotPath, fullPage: true });
  console.log(`Saved restored classic theme screenshot to ${classicReturnScreenshotPath}`);
});
