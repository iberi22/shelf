import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', '**/*.e2e.spec.ts'],
  },
  resolve: {
    alias: {
      // Tests corren contra el source de edge-mesh (no contra dist staled).
      'edge-mesh': fileURLToPath(new URL('../edge-mesh/src/index.ts', import.meta.url)),
    },
  },
});
