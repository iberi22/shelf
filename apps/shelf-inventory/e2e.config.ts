import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

export default {
  tests: ['e2e-ta/**/*.e2e.ts', '!e2e-ta/findings/**'],
  targets: [
    {
      name: 'local',
      engine: web(),
      app: {
        url: 'http://127.0.0.1:5174',
        command: {
          executable: 'pnpm',
          args: ['run', 'dev:test'],
          log: '.e2e/logs/app.log',
          startupTimeout: 120000,
        },
      },
    },
  ],
} satisfies E2EConfig;
