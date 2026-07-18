import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProductCsv } from '../lib/csvProductImport';
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
});

