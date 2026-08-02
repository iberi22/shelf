import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

/**
 * AI Chat E2E — SRC-FUN-007 / closes #358
 * Uses mocked /api/ai/chat so CI does not need WebLLM or live providers.
 */
test.describe('AI Chat E2E', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      (window as unknown as { __E2E_TEST__: boolean }).__E2E_TEST__ = true;
      localStorage.setItem('hasVisited', 'true');
      localStorage.setItem('shelfWelcomeSeen', 'true');
      localStorage.setItem('aiEngine', JSON.stringify('cloud'));
    });
    await setupPage(page);
    await page.locator('[data-testid="nav-item-nav.reports"]').last().click();
    await dismissModals(page);
    await expect(page.getByTestId('ai-chat-panel')).toBeVisible();
  });

  test('opens AI chat panel on Reports', async ({ page }) => {
    await expect(page.getByTestId('ai-chat-input')).toBeVisible();
    await expect(page.getByTestId('ai-chat-send')).toBeVisible();
    await expect(page.getByTestId('ai-engine-select')).toHaveValue('cloud');
  });

  test('sends message and receives mocked provider response', async ({ page }) => {
    await page.route('**/api/ai/chat', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Mocked AI inventory summary: 3 low-stock SKUs.' }),
      });
    });

    const input = page.getByTestId('ai-chat-input');
    await input.fill('What products are low on stock?');
    await page.getByTestId('ai-chat-send').click();

    await expect(page.getByText('What products are low on stock?').last()).toBeVisible();
    await expect(page.getByText('Mocked AI inventory summary: 3 low-stock SKUs.').last()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('conversation persists in the panel across multiple turns', async ({ page }) => {
    let call = 0;
    await page.route('**/api/ai/chat', async (route) => {
      call += 1;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          text: call === 1 ? 'First mock reply about stock.' : 'Second mock reply about sales.',
        }),
      });
    });

    const input = page.getByTestId('ai-chat-input');

    await input.fill('First question about inventory');
    await page.getByTestId('ai-chat-send').click();
    await expect(page.getByText('First mock reply about stock.').last()).toBeVisible({ timeout: 15_000 });

    await input.fill('Second question about sales');
    await page.getByTestId('ai-chat-send').click();
    await expect(page.getByText('Second mock reply about sales.').last()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('First question about inventory').last()).toBeVisible();
    await expect(page.getByText('First mock reply about stock.').last()).toBeVisible();
    await expect(page.getByText('Second question about sales').last()).toBeVisible();
  });

  test('empty input keeps send disabled', async ({ page }) => {
    const input = page.getByTestId('ai-chat-input');
    await input.fill('   ');
    await expect(page.getByTestId('ai-chat-send')).toBeDisabled();
  });

  test('shows thinking state while provider is pending', async ({ page }) => {
    await page.route('**/api/ai/chat', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Delayed mock reply' }),
      });
    });

    const input = page.getByTestId('ai-chat-input');
    await input.fill('Slow provider question');
    await page.getByTestId('ai-chat-send').click();

    await expect(input).toBeDisabled();
    await expect(page.getByText(/thinking|pensando/i).first()).toBeVisible();
    await expect(page.getByText('Delayed mock reply').last()).toBeVisible({ timeout: 15_000 });
  });
});
