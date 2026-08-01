import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
    launchOptions: {
      executablePath: '/run/current-system/sw/bin/chromium',
      args: ['--no-sandbox', '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*(?:responsive-devices|mobile-touch-scroll|mobile-pagination|settings-mobile-layout)\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm run dev:test',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: true,
      env: { VITE_SKIP_LANDING: 'true', VITE_TEST_MODE: 'true' },
    },
    {
      command: 'pnpm -w run peer-server',
      url: 'http://127.0.0.1:9000',
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
