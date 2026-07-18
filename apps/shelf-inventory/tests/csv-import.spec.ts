import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parseProductCsv, previewCsvHeaders } from '../lib/csvProductImport';
import { dismissModals, setupPage } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('CSV product import (SRC-FUN-014)', () => {
  test('parseProductCsv accepts template and Spanish aliases', () => {
    const canonical = `name,sku,quantity,price,cost,imageUrl
"Example T-Shirt","TSHIRT-RED-L",50,19.99,5.50,""
"Coffee Mug","MUG-WHITE",120,9.95,2.10,""
`;
    const a = parseProductCsv(canonical);
    expect(a.errors).toHaveLength(0);
    expect(a.products).toHaveLength(2);
    expect(a.products[0].name).toBe('Example T-Shirt');
    expect(a.products[0].quantity).toBe(50);
    expect(a.products[1].sku).toBe('MUG-WHITE');

    const es = `nombre,codigo,cantidad,precio,costo
"Camisa","C-1",10,20,5
`;
    const b = parseProductCsv(es);
    expect(b.products).toHaveLength(1);
    expect(b.products[0].name).toBe('Camisa');
    expect(b.products[0].sku).toBe('C-1');
    expect(b.products[0].quantity).toBe(10);

    const bad = parseProductCsv('foo,bar\n1,2');
    expect(bad.products).toHaveLength(0);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  test('parseProductCsv accepts options with columnMapping and previewCsvHeaders returns correct mappings', () => {
    const csvContent = `Product Title,Weird SKU,Total Stock,Unit Cost
"Interactive Product","INT-001",35,12.50
`;
    // previewCsvHeaders check
    const { rawHeaders, suggestedMapping, missingRequired } = previewCsvHeaders(csvContent);
    expect(rawHeaders).toEqual(['Product Title', 'Weird SKU', 'Total Stock', 'Unit Cost']);
    // Since none of these are exact aliases, they should map to null
    expect(suggestedMapping).toEqual([null, null, null, null]);
    expect(missingRequired).toContain('name');

    // Parse with custom column mapping
    const customMapping: any[] = ['name', 'sku', 'quantity', 'cost'];
    const parsed = parseProductCsv(csvContent, { columnMapping: customMapping });
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.products).toHaveLength(1);
    expect(parsed.products[0].name).toBe('Interactive Product');
    expect(parsed.products[0].sku).toBe('INT-001');
    expect(parsed.products[0].quantity).toBe(35);
    expect(parsed.products[0].cost).toBe(12.5);
  });

  test('UI import from template.csv adds products to inventory', async ({ page }) => {
    await setupPage(page);
    await dismissModals(page);

    await page.getByTestId('nav-item-nav.settings').last().click();
    await expect(page.getByTestId('settings-data-card')).toBeVisible({ timeout: 15000 });

    // Expand collapsible data card if the import button is not yet interactable
    const openBtn = page.getByTestId('open-import-csv-button');
    try {
      await openBtn.click({ timeout: 3000 });
    } catch {
      await page.getByTestId('settings-data-card').locator('button').first().click();
      await openBtn.click();
    }

    await expect(page.getByTestId('import-csv-modal')).toBeVisible();

    const templatePath = path.resolve(__dirname, '../public/template.csv');
    await page.getByTestId('import-csv-file-input').setInputFiles(templatePath);
    await expect(page.getByTestId('import-csv-file-name')).toContainText('template.csv');

    await page.getByTestId('import-csv-submit').click();
    await expect(page.getByTestId('import-csv-modal')).toBeHidden({ timeout: 10000 });

    // Navigate to inventory and assert products
    await page.getByTestId('nav-item-nav.inventory').first().click();
    await expect(page.getByText('Example T-Shirt').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Coffee Mug').first()).toBeVisible({ timeout: 10000 });
  });

  test('UI import with non-aliased/weird headers allows manual remapping', async ({ page }) => {
    const weirdCsvPath = path.resolve(__dirname, '../public/weird_headers_temp.csv');
    fs.writeFileSync(
      weirdCsvPath,
      'Product Title,Weird SKU,Total Stock,Unit Cost\n"Interactive Product","INT-001",35,12.50\n',
    );

    try {
      await setupPage(page);
      await dismissModals(page);

      await page.getByTestId('nav-item-nav.settings').last().click();
      await expect(page.getByTestId('settings-data-card')).toBeVisible({ timeout: 15000 });

      // Expand collapsible data card if the import button is not yet interactable
      const openBtn = page.getByTestId('open-import-csv-button');
      try {
        await openBtn.click({ timeout: 3000 });
      } catch {
        await page.getByTestId('settings-data-card').locator('button').first().click();
        await openBtn.click();
      }

      await expect(page.getByTestId('import-csv-modal')).toBeVisible();

      // Upload file with unknown headers
      await page.getByTestId('import-csv-file-input').setInputFiles(weirdCsvPath);
      await expect(page.getByTestId('import-csv-file-name')).toContainText('weird_headers_temp.csv');

      // Check that the import button is disabled initially because 'name' is not mapped yet
      const submitBtn = page.getByTestId('import-csv-submit');
      await expect(submitBtn).toBeDisabled();

      // Remap columns
      // "Product Title" (index 0) -> "name"
      await page.getByTestId('csv-map-0').selectOption('name');

      // Now "name" is mapped, import button should be enabled!
      await expect(submitBtn).toBeEnabled();

      // "Weird SKU" (index 1) -> "sku"
      await page.getByTestId('csv-map-1').selectOption('sku');

      // "Total Stock" (index 2) -> "quantity"
      await page.getByTestId('csv-map-2').selectOption('quantity');

      // "Unit Cost" (index 3) -> "cost"
      await page.getByTestId('csv-map-3').selectOption('cost');

      // Perform import
      await submitBtn.click();
      await expect(page.getByTestId('import-csv-modal')).toBeHidden({ timeout: 10000 });

      // Navigate to inventory and verify
      await page.getByTestId('nav-item-nav.inventory').first().click();
      await expect(page.getByText('Interactive Product').first()).toBeVisible({ timeout: 15000 });
    } finally {
      if (fs.existsSync(weirdCsvPath)) {
        fs.unlinkSync(weirdCsvPath);
      }
    }
  });
});
