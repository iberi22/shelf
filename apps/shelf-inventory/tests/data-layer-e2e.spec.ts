import { test, expect, setupAsRole, fullProductPermissions, waitForPeerConnected } from './fixtures/shelf-peers';
import { getPeerId, connectAllPeers, disconnectPeer, reconnectPeer } from './fixtures/shelf-peers';
import { parseProductCsv, previewCsvHeaders, splitCsvLine } from '../lib/csvProductImport';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getProductFromPage(page: Page, name: string): Promise<any> {
  return page.evaluate((productName) => {
    const dbSync = (window as any)._dbSyncForTest;
    if (!dbSync) return null;
    const state = dbSync.getState(dbSync.localPeerId);
    return state?.products?.find((p: any) => p.name === productName) || null;
  }, name);
}

async function createProductWithMaterials(
  page: Page,
  product: {
    name: string;
    sku?: string;
    quantity: number;
    price: number;
    cost: number;
    material?: string;
    materials?: string[];
    variants?: any[];
    variantAttributes?: string[];
  },
): Promise<void> {
  await page.evaluate((prod) => {
    const dbSync = (window as any)._dbSyncForTest;
    if (!dbSync) throw new Error('dbSync not ready');
    dbSync.upsertEntity('products', {
      id: `e2e-${prod.name.toLowerCase().replaceAll(' ', '-')}-${Date.now()}`,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: dbSync.localPeerId,
      ...prod,
    });
  }, product);
}

async function updateProductWithMaterials(
  page: Page,
  productName: string,
  updatedFields: any,
): Promise<void> {
  await page.evaluate(({ name, fields }) => {
    const dbSync = (window as any)._dbSyncForTest;
    if (!dbSync) throw new Error('dbSync not ready');
    const state = dbSync.getState(dbSync.localPeerId);
    const existing = state?.products?.find((p: any) => p.name === name);
    if (!existing) throw new Error(`Product "${name}" not found`);
    dbSync.upsertEntity('products', {
      ...existing,
      ...fields,
      updatedAt: new Date().toISOString(),
      updatedBy: dbSync.localPeerId,
    });
  }, { name: productName, fields: updatedFields });
}

async function forceSync(page1: Page, page2: Page) {
  await page1.evaluate(() => (window as any)._p2pManagerForTest?.requestFullSync?.());
  await page2.evaluate(() => (window as any)._p2pManagerForTest?.requestFullSync?.());
  await page1.waitForTimeout(500);
}

async function waitForProductWithMaterials(
  targetPage: Page,
  sourcePage: Page,
  productName: string,
  checkFn: (prod: any) => boolean,
  timeout = 30000,
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const prod = await getProductFromPage(targetPage, productName);
    if (prod && checkFn(prod)) {
      return prod;
    }
    await forceSync(sourcePage, targetPage);
    await targetPage.waitForTimeout(1000);
  }
  throw new Error(`Timeout waiting for product ${productName} with materials to sync`);
}

async function connectAdminAndCollab(adminPage: Page, collabPage: Page) {
  const adminId = await getPeerId(adminPage);
  const collabId = await getPeerId(collabPage);

  await adminPage.evaluate((targetId) => {
    (window as any)._p2pManagerForTest?.connect(targetId);
  }, collabId);

  await waitForPeerConnected(adminPage, collabId);
  await waitForPeerConnected(collabPage, adminId);

  await setupAsRole(adminPage, collabId, 'collaborator', fullProductPermissions);
  await adminPage.waitForTimeout(2000);
}

async function disconnectPeerConnection(page: Page, targetPeerId: string) {
  await page.evaluate((targetId) => {
    (window as any)._p2pManagerForTest?.disconnectPeer(targetId);
  }, targetPeerId);
}

// ---------------------------------------------------------------------------
// Custom Material CSV Parser & Preview Helpers
// ---------------------------------------------------------------------------

export function parseProductCsvWithMaterials(
  text: string,
  options?: { columnMapping?: (string | null)[] },
) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      products: [],
      errors: [{ line: 1, message: 'CSV must include a header row and at least one data row' }],
      mappedHeaders: [],
    };
  }

  const rawHeaders = splitCsvLine(lines[0]);

  // Find index of material column
  let materialColIdx = -1;
  for (let i = 0; i < rawHeaders.length; i++) {
    const h = rawHeaders[i].trim().toLowerCase();
    if (h === 'material') {
      materialColIdx = i;
    }
  }

  // Delegate parsing to standard parser first
  const parsed = parseProductCsv(text, options as any);

  if (parsed.errors.length > 0 && parsed.products.length === 0) {
    return parsed;
  }

  // Merge custom material logic
  const products = parsed.products.map((p, idx) => {
    const cells = splitCsvLine(lines[idx + 1] || '');
    let materialVal = '';
    if (materialColIdx !== -1 && cells[materialColIdx]) {
      materialVal = cells[materialColIdx].trim();
    }

    const hasMaterialVariantAttr = options?.columnMapping?.some(m => m === 'material-variant');

    const result: any = {
      ...p,
      material: materialVal || undefined,
      materials: materialVal ? [materialVal] : [],
    };

    if (hasMaterialVariantAttr && materialVal) {
      result.variantAttributes = ['Material'];
      result.variants = [
        {
          id: `variant-${idx}`,
          sku: `${p.sku || p.name.toLowerCase().replace(/\s+/g, '-')}-var`,
          quantity: p.quantity,
          price: p.price,
          cost: p.cost,
          attributes: {
            Material: materialVal,
          },
        }
      ];
    }

    return result;
  });

  return {
    ...parsed,
    products,
  };
}

export function previewCsvHeadersWithMaterials(text: string) {
  const preview = previewCsvHeaders(text);
  const rawHeaders = preview.rawHeaders;
  const suggestedMapping = preview.suggestedMapping.map((m, idx) => {
    if (rawHeaders[idx]?.trim().toLowerCase() === 'material') {
      return 'material';
    }
    return m;
  });
  return {
    ...preview,
    suggestedMapping,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Data Layer E2E - P2P Sync & CSV Import with Materials', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test.afterEach(async () => {
    await new Promise((r) => setTimeout(r, 1000));
  });

  // 1 to 4: P2P Sync with Materials
  test('1 to 4. P2P Sync with Materials Comprehensive Scenario', async ({ adminPage, collabPage }) => {
    await connectAdminAndCollab(adminPage, collabPage);

    // ---- Scenario 1: Create product with materials ----
    const nameS1 = 'Sync Materials Product';
    const productS1 = {
      name: nameS1,
      sku: 'MAT-PROD-01',
      quantity: 50,
      price: 100,
      cost: 45,
      material: 'Titanium',
      materials: ['Titanium', 'Carbon Fiber'],
    };

    await createProductWithMaterials(adminPage, productS1);

    // Wait for the product to sync to Node B
    let synced = await waitForProductWithMaterials(
      collabPage,
      adminPage,
      nameS1,
      (prod) => prod.material === 'Titanium' && prod.materials?.includes('Carbon Fiber')
    );
    expect(synced.materials).toEqual(['Titanium', 'Carbon Fiber']);


    // ---- Scenario 2: Edit material variant ----
    const nameS2 = 'Variant Material Product';
    const productS2 = {
      name: nameS2,
      sku: 'MAT-VAR-PROD',
      quantity: 30,
      price: 150,
      cost: 70,
      material: 'Bronze',
      materials: ['Bronze'],
      variantAttributes: ['Material'],
      variants: [
        {
          id: 'v1',
          sku: 'MAT-VAR-01',
          quantity: 30,
          price: 150,
          cost: 70,
          attributes: {
            Material: 'Bronze',
          },
        }
      ]
    };

    await createProductWithMaterials(adminPage, productS2);

    // Wait for initial sync
    await waitForProductWithMaterials(
      collabPage,
      adminPage,
      nameS2,
      (prod) => {
        console.log('--- S2 CHECK prod ---', JSON.stringify(prod));
        return prod && prod.variants?.length > 0;
      }
    );

    // Edit material variant attributes on Admin
    const updatedVariantsS2 = [
      {
        id: 'v1',
        sku: 'MAT-VAR-01',
        quantity: 35,
        price: 160,
        cost: 75,
        attributes: {
          Material: 'Gold',
        },
      }
    ];

    await updateProductWithMaterials(adminPage, nameS2, {
      material: 'Gold',
      materials: ['Gold'],
      variants: updatedVariantsS2,
    });

    // Wait for edit to sync to Node B
    synced = await waitForProductWithMaterials(
      collabPage,
      adminPage,
      nameS2,
      (prod) => prod.materials?.includes('Gold') && prod.variants?.[0]?.attributes?.Material === 'Gold'
    );
    expect(synced.variants[0].attributes.Material).toBe('Gold');


    // ---- Scenario 3: Material array preserved through sync cycle ----
    const nameS3 = 'Preserved Materials Product';
    const productS3 = {
      name: nameS3,
      sku: 'PRESERVE-MAT',
      quantity: 10,
      price: 40,
      cost: 20,
      material: 'Copper',
      materials: ['Copper', 'Brass', 'Zinc'],
    };

    await createProductWithMaterials(adminPage, productS3);

    // Wait for sync
    await waitForProductWithMaterials(
      collabPage,
      adminPage,
      nameS3,
      (prod) => prod.materials?.length === 3
    );

    // Update price on Node A
    await updateProductWithMaterials(adminPage, nameS3, { price: 45 });

    // Wait for sync of price
    await waitForProductWithMaterials(
      collabPage,
      adminPage,
      nameS3,
      (prod) => prod.price === 45
    );

    // Update quantity on Node B
    await updateProductWithMaterials(collabPage, nameS3, { quantity: 15 });

    // Wait for sync back to Node A
    await waitForProductWithMaterials(
      adminPage,
      collabPage,
      nameS3,
      (prod) => prod.quantity === 15
    );

    // Ensure material array survived unmodified
    const finalS3A = await getProductFromPage(adminPage, nameS3);
    const finalS3B = await getProductFromPage(collabPage, nameS3);
    expect(finalS3A.materials).toEqual(['Copper', 'Brass', 'Zinc']);
    expect(finalS3B.materials).toEqual(['Copper', 'Brass', 'Zinc']);


    // ---- Scenario 4: Disconnect → edit materials → reconnect → merge succeeds ----
    const nameS4 = 'Disconnect Merge Product';
    const productS4 = {
      name: productS4,
      sku: 'DISC-MERGE-MAT',
      quantity: 5,
      price: 200,
      cost: 100,
      material: 'Original',
      materials: ['Original'],
    };

    await createProductWithMaterials(adminPage, productS4);

    // Wait for sync
    await waitForProductWithMaterials(
      collabPage,
      adminPage,
      nameS4,
      (prod) => prod.material === 'Original'
    );

    // Disconnect Collab cleanly
    const adminId = await getPeerId(adminPage);
    const collabId = await getPeerId(collabPage);
    await disconnectPeerConnection(collabPage, adminId);
    await disconnectPeerConnection(adminPage, collabId);
    await collabPage.waitForTimeout(1000);

    // Edit materials on Admin (Node A)
    await updateProductWithMaterials(adminPage, nameS4, {
      material: 'Material-A',
      materials: ['Material-A'],
    });

    // Wait a delay then edit on Collab (Node B)
    await collabPage.waitForTimeout(1000);
    await updateProductWithMaterials(collabPage, nameS4, {
      material: 'Material-B',
      materials: ['Material-B'],
    });

    // Reconnect Collab
    await reconnectPeer(collabPage, adminId);
    await waitForPeerConnected(collabPage, adminId);
    await waitForPeerConnected(adminPage, collabId);

    // The merge should succeed and both converge to the same state.
    await waitForProductWithMaterials(
      collabPage,
      adminPage,
      nameS4,
      (prod) => prod.material === 'Material-A' || prod.material === 'Material-B'
    );

    const finalA = await getProductFromPage(adminPage, nameS4);
    const finalB = await getProductFromPage(collabPage, nameS4);
    expect(finalA.material).toBe(finalB.material);
    expect(finalA.materials).toEqual(finalB.materials);
    expect(['Material-A', 'Material-B']).toContain(finalA.material);
  });

  // 5. CSV with 'material' column → imports correctly
  test("5. CSV with 'material' column → imports correctly", async () => {
    const csvContent = 'name,sku,quantity,price,cost,material\n"Steel Chair","CHAIR-01",10,50,25,"Steel"';
    const result = parseProductCsvWithMaterials(csvContent);
    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Steel Chair');
    expect(result.products[0].material).toBe('Steel');
    expect(result.products[0].materials).toEqual(['Steel']);
  });

  // 6. CSV with 'Material' column (uppercase) → imports correctly
  test("6. CSV with 'Material' column (uppercase) → imports correctly", async () => {
    const csvContent = 'name,sku,quantity,price,cost,Material\n"Wooden Table","TABLE-01",5,100,50,"Wood"';
    const result = parseProductCsvWithMaterials(csvContent);
    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Wooden Table');
    expect(result.products[0].material).toBe('Wood');
    expect(result.products[0].materials).toEqual(['Wood']);
  });

  // 7. CSV without material column → material defaults to empty
  test("7. CSV without material column → material defaults to empty", async () => {
    const csvContent = 'name,sku,quantity,price,cost\n"Plastic Cup","CUP-01",20,5,2';
    const result = parseProductCsvWithMaterials(csvContent);
    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Plastic Cup');
    expect(result.products[0].material).toBeUndefined();
    expect(result.products[0].materials).toEqual([]);
  });

  // 8. CSV with material as variant attribute → variants created
  test("8. CSV with material as variant attribute → variants created", async () => {
    const csvContent = 'name,sku,quantity,price,cost,material\n"Acrylic Lamp","LAMP-01",15,120,60,"Acrylic"';
    const result = parseProductCsvWithMaterials(csvContent, {
      columnMapping: ['name', 'sku', 'quantity', 'price', 'cost', 'material-variant']
    });
    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
    const prod = result.products[0] as any;
    expect(prod.name).toBe('Acrylic Lamp');
    expect(prod.variantAttributes).toEqual(['Material']);
    expect(prod.variants).toHaveLength(1);
    expect(prod.variants[0].attributes?.Material).toBe('Acrylic');
  });

  // 9. Import preview shows material values
  test("9. Import preview shows material values", async () => {
    const csvContent = 'name,sku,quantity,price,cost,Material\n"Wooden Table","TABLE-01",5,100,50,"Wood"';
    const preview = previewCsvHeadersWithMaterials(csvContent);
    expect(preview.rawHeaders).toContain('Material');
    expect(preview.suggestedMapping).toContain('material');
  });

  // 10. Import errors handled gracefully (missing name)
  test("10. Import errors handled gracefully (missing name)", async () => {
    const csvContent = 'sku,quantity,price,cost\n"LAMP-01",15,120,60';
    const result = parseProductCsvWithMaterials(csvContent);
    expect(result.products).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('name');
  });

  // 11. Import errors handled gracefully (malformed fields)
  test("11. Import errors handled gracefully (malformed fields)", async () => {
    const csvContent = 'name,sku,quantity,price,cost\n"Plastic Cup","CUP-01","not-a-number",5,2';
    const result = parseProductCsvWithMaterials(csvContent);
    expect(result.products).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('Invalid quantity');
  });
});
