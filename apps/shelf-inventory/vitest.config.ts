import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Dedicated Vitest config for shelf-inventory unit + coverage gates (closes #363).
 * Playwright E2E lives under tests/ and is excluded here.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test-setup.ts'],
    include: [
      'lib/**/*.{spec,test}.{ts,tsx}',
      'api/**/*.{spec,test}.{ts,tsx}',
      'utils/**/*.{spec,test}.{ts,tsx}',
      'context/**/*.{spec,test}.{ts,tsx}',
      'hooks/**/*.{spec,test}.{ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/tests/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts', 'api/**/*.ts', 'utils/**/*.ts'],
      exclude: ['**/*.{spec,test}.{ts,tsx}', '**/*.d.ts', '**/node_modules/**', 'lib/cloudSync.ts'],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 50,
      },
    },
  },
});
