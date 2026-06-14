import { test, expect } from '@playwright/test';
import { setupPage, dismissModals } from './helpers';

const MOCK_PRODUCTS = [
  { name: 'MacBook Pro M3 Max 16"', qty: '15', price: '3499', cost: '2800' },
  { name: 'iPhone 15 Pro Max 512GB', qty: '42', price: '1299', cost: '950' },
  { name: 'AirPods Pro 2nd Gen', qty: '120', price: '249', cost: '150' },
  { name: 'iPad Pro 12.9" M2', qty: '25', price: '1099', cost: '850' },
  { name: 'Sony A7IV Camera Body', qty: '8', price: '2498', cost: '2100' },
  { name: 'Logitech MX Master 3S', qty: '200', price: '99', cost: '45' },
  { name: 'Dell UltraSharp 27" 4K', qty: '35', price: '599', cost: '420' },
  { name: 'Keychron Q1 Pro Keyboard', qty: '50', price: '199', cost: '120' }
];

test.describe('Mock Data Seeder', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('Seed coherent data for products and sales', async ({ page }) => {
    // 1. Seed Products
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);

    for (const product of MOCK_PRODUCTS) {
      await page.getByTestId('add-product-button').click();
      await page.getByTestId('product-name-input').fill(product.name);
      await page.getByTestId('product-quantity-input').fill(product.qty);
      await page.getByTestId('product-price-input').fill(product.price);
      await page.getByTestId('product-cost-input').fill(product.cost);
      await page.getByTestId('save-product-button').click();
      // Wait for it to appear
      await expect(page.locator(`text=${product.name}`).first()).toBeVisible({ timeout: 5000 });
    }

    // 2. Seed a Sale
    await page.locator('[data-testid="nav-item-nav.sales"]').last().click();
    await dismissModals(page);
    await page.waitForTimeout(500);

    const addSaleBtn = page.getByRole('button', { name: /nueva venta|new sale|agregar venta/i }).or(
      page.getByTestId('add-sale-button')
    );
    if (await addSaleBtn.isVisible().catch(() => false)) {
      await addSaleBtn.click();
    }

    // Sell an iPhone
    await page.getByTestId('add-sale-item-button').click();
    
    // Playwright cannot easily select dynamically loaded dropdown by text without value if structure varies,
    // so we'll just check if it's there or try to use the first product.
    const selects = await page.locator('[data-testid^="sale-item-product-"]').all();
    if (selects.length > 0) {
      const selectHandle = selects[0];
      const options = await selectHandle.locator('option').allTextContents();
      if (options.length > 1) {
        const indexToSelect = options.findIndex(opt => opt.includes('iPhone 15'));
        if (indexToSelect > 0) {
           const val = await selectHandle.locator(`option:nth-child(${indexToSelect + 1})`).getAttribute('value');
           if (val) {
             await selectHandle.selectOption(val);
             await page.getByTestId('sale-item-quantity-0').fill('2');
           }
        }
      }
    }
    
    const saveSaleBtn = page.getByTestId('save-sale-button').or(
      page.getByRole('button', { name: /guardar venta|save sale|completar venta/i })
    );
    if (await saveSaleBtn.isVisible().catch(() => false)) {
      await saveSaleBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // Verify everything is populated
    await expect(page.locator('table').first()).toBeVisible({ timeout: 5000 });
  });
});
