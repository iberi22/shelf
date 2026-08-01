import { defineConfig, devices } from '@playwright/test';

// workers: '50%' — non-P2P tests run in parallel.
// P2P tests MUST be serial (PeerJS can't handle parallel WebRTC connections);
// use test.describe.configure({ mode: 'serial' }) in each p2p-*.spec.ts file.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: '50%',
  retries: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5174',
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
      url: 'http://localhost:5174',
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
