import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const chromePath =
  process.env.PLAYWRIGHT_CHROME_PATH ||
  (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '/run/current-system/sw/bin/chromium');

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // Hard cap so a hang fails (with report) instead of the 40min job cancel.
  globalTimeout: process.env.CI ? 30 * 60_000 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5174',
    locale: 'es-ES',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: chromePath,
          args: [
            '--allow-loopback-in-peer-connection',
            '--disable-features=WebRtcHideLocalIpsWithMdns',
            '--no-sandbox',
            '--js-flags=--expose-gc',
          ],
        },
      },
      testIgnore:
        /.*(?:responsive-devices|mobile-touch-scroll|mobile-pagination|settings-mobile-layout|mobile-landing-e2e)\.spec\.ts/,
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        launchOptions: {
          executablePath: chromePath,
          args: [
            '--allow-loopback-in-peer-connection',
            '--disable-features=WebRtcHideLocalIpsWithMdns',
            '--no-sandbox',
          ],
        },
      },
      testMatch:
        /.*(?:responsive-devices|mobile-touch-scroll|mobile-pagination|settings-mobile-layout|mobile-landing-e2e)\.spec\.ts/,
    },
    {
      name: 'tablet',
      use: {
        viewport: { width: 768, height: 1024 },
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        isMobile: true,
        hasTouch: true,
        // Use system Chromium on NixOS (bundled headless_shell lacks libnspr4)
        launchOptions: {
          executablePath: chromePath,
          args: [
            '--allow-loopback-in-peer-connection',
            '--disable-features=WebRtcHideLocalIpsWithMdns',
            '--no-sandbox',
          ],
        },
      },
      testMatch: /.*(?:responsive-devices|settings-mobile-layout|mobile-landing-e2e)\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm run dev:test',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SKIP_LANDING: 'true',
        VITE_TEST_MODE: 'true',
        // Telemetry E2E: fake GA4 credentials so the app POSTs to the
        // Measurement Protocol endpoint, which tests intercept via page.route.
        VITE_GA4_MEASUREMENT_ID: 'G-TEST',
        VITE_GA4_API_SECRET: 'test-secret',
      },
    },
    {
      command: 'pnpm run dev:test:2',
      url: 'http://127.0.0.1:5175',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SKIP_LANDING: 'true',
        VITE_TEST_MODE: 'true',
      },
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 5176 --strictPort',
      url: 'http://127.0.0.1:5176',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SKIP_LANDING: 'false',
        VITE_TEST_MODE: 'false',
      },
    },
    {
      command: 'pnpm -w run peer-server',
      url: 'http://127.0.0.1:9000',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
