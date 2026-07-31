import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*(?:responsive-devices|mobile-touch-scroll|mobile-pagination|settings-mobile-layout)\.spec\.ts/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: /.*(?:responsive-devices|mobile-touch-scroll|mobile-pagination|settings-mobile-layout)\.spec\.ts/,
    },
    {
      name: 'tablet',
      use: {
        viewport: { width: 768, height: 1024 },
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /.*(?:responsive-devices|settings-mobile-layout)\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm run dev --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dlx peer --port 9000 --path /',
      url: 'http://127.0.0.1:9000',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
