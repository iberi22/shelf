import { expect, test } from '@playwright/test';
import config from '../../playwright.config';

// Regression: E2E job was cancelled by the 40min job timeout (217 tests, 1 worker,
// retries 2, 45s timeout). Run with CI=true; keeps CI worst-case bounded.
test('playwright config keeps CI runtime under the job timeout', () => {
  test.skip(!process.env.CI, 'CI-only budget check');
  expect(config.retries).toBeLessThanOrEqual(1);
  expect(config.workers).toBeGreaterThanOrEqual(2);
  expect(config.globalTimeout).toBeGreaterThan(0);
  expect(config.globalTimeout).toBeLessThanOrEqual(30 * 60_000);
});
