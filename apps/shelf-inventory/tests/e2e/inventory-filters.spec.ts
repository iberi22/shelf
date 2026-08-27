import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from '../helpers';

test.describe('E2E: Inventory multi-facet filters UI', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await page.locator('[data-testid="nav-item-nav.inventory"]').last().click();
    await dismissModals(page);
  });

  test('should filter products by category and update URL search params', async ({ page }) => {
    // Add two products with categories via _dbSyncForTest
    await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (dbSync) {
        dbSync.upsertEntity('products', {
          id: 'prod-cat-1',
          name: 'Laptop Gamer',
          quantity: 10,
          price: 1500,
          cost: 1000,
          customFields: { category: 'Electrónica' },
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
        dbSync.upsertEntity('products', {
          id: 'prod-cat-2',
          name: 'Silla de Escritorio',
          quantity: 5,
          price: 200,
          cost: 120,
          customFields: { category: 'Hogar' },
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    // Both products should be visible initially
    await expect(page.locator('text=Laptop Gamer').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Silla de Escritorio').first()).toBeVisible({ timeout: 10000 });

    // Select category filter "Electrónica"
    const categorySelect = page.getByTestId('inventory-filter-category');
    await categorySelect.selectOption('Electrónica');

    // Verify URL contains category query parameter
    expect(page.url()).toContain('category=');

    // Verify only "Laptop Gamer" is displayed and "Silla de Escritorio" is filtered out
    await expect(page.locator('text=Laptop Gamer').first()).toBeVisible();
    await expect(page.locator('text=Silla de Escritorio')).toHaveCount(0);

    // Verify filter chip is shown
    await expect(page.getByTestId('inventory-filter-chips')).toBeVisible();
    await expect(page.getByTestId('inventory-filter-remove-category')).toBeVisible();
  });

  test('should combine 2 filters (AND logic) and display removable chips', async ({ page }) => {
    // Product 1: Category "Electrónica", Stock = 15 (In stock)
    // Product 2: Category "Electrónica", Stock = 2 (Low stock)
    // Product 3: Category "Hogar", Stock = 2 (Low stock)
    await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (dbSync) {
        dbSync.upsertEntity('products', {
          id: 'prod-comb-1',
          name: 'Smartphone X',
          quantity: 15,
          price: 800,
          cost: 500,
          customFields: { category: 'Electrónica' },
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
        dbSync.upsertEntity('products', {
          id: 'prod-comb-2',
          name: 'Cargador Rápido',
          quantity: 2,
          price: 25,
          cost: 10,
          customFields: { category: 'Electrónica' },
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
        dbSync.upsertEntity('products', {
          id: 'prod-comb-3',
          name: 'Lámpara LED',
          quantity: 2,
          price: 30,
          cost: 15,
          customFields: { category: 'Hogar' },
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    await expect(page.locator('text=Smartphone X').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Cargador Rápido').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Lámpara LED').first()).toBeVisible({ timeout: 10000 });

    // Combine 2 filters: Category = "Electrónica" AND Status = "low"
    await page.getByTestId('inventory-filter-category').selectOption('Electrónica');
    await page.getByTestId('inventory-filter-status').selectOption('low');

    // URL should contain both query parameters
    expect(page.url()).toContain('category=');
    expect(page.url()).toContain('status=low');

    // Only Product 2 ("Cargador Rápido") matches both filters
    await expect(page.locator('text=Cargador Rápido').first()).toBeVisible();
    await expect(page.locator('text=Smartphone X')).toHaveCount(0);
    await expect(page.locator('text=Lámpara LED')).toHaveCount(0);

    // Verify 2 chips are displayed
    await expect(page.getByTestId('inventory-filter-remove-category')).toBeVisible();
    await expect(page.getByTestId('inventory-filter-remove-status')).toBeVisible();

    // Remove category filter chip
    await page.getByTestId('inventory-filter-remove-category').click();

    // Now all "low" stock items should be shown ("Cargador Rápido" & "Lámpara LED")
    await expect(page.locator('text=Cargador Rápido').first()).toBeVisible();
    await expect(page.locator('text=Lámpara LED').first()).toBeVisible();
    await expect(page.locator('text=Smartphone X')).toHaveCount(0);
  });

  test('should reset all filters when clicking clear-all button', async ({ page }) => {
    // Add product
    await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (dbSync) {
        dbSync.upsertEntity('products', {
          id: 'prod-clear-1',
          name: 'Taladro Inalámbrico',
          quantity: 10,
          price: 150,
          cost: 90,
          customFields: { category: 'Herramientas' },
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    await expect(page.locator('text=Taladro Inalámbrico').first()).toBeVisible({ timeout: 10000 });

    // Apply min price filter and category filter
    await page.getByTestId('inventory-filter-category').selectOption('Herramientas');
    await page.getByTestId('inventory-filter-min-price').fill('100');

    // Verify active filter chips and clear all button exist
    await expect(page.getByTestId('inventory-filter-chips')).toBeVisible();
    await expect(page.getByTestId('inventory-filter-clear-all')).toBeVisible();
    expect(page.url()).toContain('category=Herramientas');
    expect(page.url()).toContain('minPrice=100');

    // Click "Clear all"
    await page.getByTestId('inventory-filter-clear-all').click();

    // Chips bar should disappear and URL query params cleared
    await expect(page.getByTestId('inventory-filter-chips')).toHaveCount(0);
    expect(page.url()).not.toContain('category=');
    expect(page.url()).not.toContain('minPrice=');

    // Inputs should reset
    await expect(page.getByTestId('inventory-filter-category')).toHaveValue('');
    await expect(page.getByTestId('inventory-filter-min-price')).toHaveValue('');
  });
});
