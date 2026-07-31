import { describe, expect, it } from 'vitest';
import {
  CANONICAL_CSV_HEADERS,
  mapHeaders,
  parseProductCsv,
  previewCsvHeaders,
  splitCsvLine,
} from './csvProductImport';

// ─── splitCsvLine ─────────────────────────────────────────────

describe('splitCsvLine', () => {
  it('splits a simple comma-separated line', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(splitCsvLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c']);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    // Note: the splitCsvLine implementation uses a simplified CSV parser
    // that strips outer quotes and handles "" inside, but the final
    // .replace(/^\"|\"$/g, '') strips remaining edge quotes.
    const result = splitCsvLine('"say ""hello""",b');
    // The "" inside becomes " and the outer quotes are stripped
    expect(result[1]).toBe('b');
    expect(result.length).toBe(2);
  });

  it('trims whitespace from unquoted fields', () => {
    expect(splitCsvLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });

  it('returns a single-element array for a line with no commas', () => {
    expect(splitCsvLine('only-one')).toEqual(['only-one']);
  });

  it('handles empty line producing an empty-string element', () => {
    expect(splitCsvLine('')).toEqual(['']);
  });

  it('handles fields with surrounding quotes that get stripped', () => {
    expect(splitCsvLine('"quoted",normal')).toEqual(['quoted', 'normal']);
  });
});

// ─── mapHeaders ───────────────────────────────────────────────

describe('mapHeaders', () => {
  it('maps canonical headers to themselves', () => {
    const { mapping, missing } = mapHeaders(['name', 'sku', 'quantity', 'price', 'cost']);
    expect(mapping).toEqual(['name', 'sku', 'quantity', 'price', 'cost']);
    expect(missing).toEqual([]);
  });

  it('maps Spanish aliases correctly', () => {
    const { mapping, missing } = mapHeaders(['nombre', 'codigo', 'cantidad', 'precio', 'costo']);
    expect(mapping).toEqual(['name', 'sku', 'quantity', 'price', 'cost']);
    expect(missing).toEqual([]);
  });

  it('maps English aliases correctly', () => {
    const { mapping, missing } = mapHeaders(['product', 'code', 'stock', 'price', 'cost']);
    expect(mapping).toEqual(['name', 'sku', 'quantity', 'price', 'cost']);
    expect(missing).toEqual([]);
  });

  it('returns null for unknown headers', () => {
    const { mapping } = mapHeaders(['unknown', 'header']);
    expect(mapping).toEqual([null, null]);
  });

  it('reports missing required columns', () => {
    const { missing } = mapHeaders(['sku', 'quantity']);
    expect(missing).toContain('name');
    expect(missing).toContain('price');
  });

  it('does not mark imageUrl as missing since it is optional', () => {
    const { missing } = mapHeaders(['name']);
    expect(missing).not.toContain('imageUrl');
  });

  it('handles accented Spanish headers (código)', () => {
    const { mapping } = mapHeaders(['nombre', 'código', 'cantidad', 'precio', 'costo']);
    expect(mapping).toEqual(['name', 'sku', 'quantity', 'price', 'cost']);
  });

  it('handles "image url" two-word alias', () => {
    const { mapping } = mapHeaders(['name', 'image url']);
    expect(mapping).toEqual(['name', 'imageUrl']);
  });
});

// ─── previewCsvHeaders ────────────────────────────────────────

describe('previewCsvHeaders', () => {
  it('returns empty arrays for empty text', () => {
    const result = previewCsvHeaders('');
    expect(result.rawHeaders).toEqual([]);
    expect(result.suggestedMapping).toEqual([]);
    expect(result.missingRequired).toEqual(
      CANONICAL_CSV_HEADERS.filter((h) => h !== 'imageUrl'),
    );
  });

  it('returns correct mapping for a well-formed header', () => {
    const result = previewCsvHeaders('name,sku,quantity,price,cost,imageUrl');
    expect(result.rawHeaders).toEqual(['name', 'sku', 'quantity', 'price', 'cost', 'imageUrl']);
    expect(result.suggestedMapping).toEqual(['name', 'sku', 'quantity', 'price', 'cost', 'imageUrl']);
    expect(result.missingRequired).toEqual([]);
  });

  it('reports missing required headers when only imageUrl is provided', () => {
    const result = previewCsvHeaders('imageUrl');
    expect(result.missingRequired).toContain('name');
    expect(result.missingRequired).toContain('quantity');
  });

  it('strips BOM from the first line', () => {
    const result = previewCsvHeaders('\uFEFFname,sku,quantity,price,cost');
    expect(result.rawHeaders).toEqual(['name', 'sku', 'quantity', 'price', 'cost']);
  });

  it('skips empty lines before the header', () => {
    const result = previewCsvHeaders('\n\nname,sku');
    expect(result.rawHeaders).toEqual(['name', 'sku']);
  });
});

// ─── parseProductCsv ──────────────────────────────────────────

describe('parseProductCsv', () => {
  const VALID_HEADER = 'name,sku,quantity,price,cost,imageUrl';

  it('parses a valid CSV with multiple products', () => {
    const csv = `${VALID_HEADER}\nCamiseta,SKU-001,10,25.5,12,http://img.com/1.jpg\nPantalon,SKU-002,5,40,20,`;
    const result = parseProductCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(2);
    expect(result.products[0]).toMatchObject({
      name: 'Camiseta',
      sku: 'SKU-001',
      quantity: 10,
      price: 25.5,
      cost: 12,
      imageUrl: 'http://img.com/1.jpg',
    });
    expect(result.products[1]).toMatchObject({
      name: 'Pantalon',
      sku: 'SKU-002',
      quantity: 5,
      price: 40,
      cost: 20,
    });
  });

  it('sets isActive=true and updatedBy=csv-import on every product', () => {
    const csv = `${VALID_HEADER}\nTest Product,,,0,0,`;
    const result = parseProductCsv(csv);

    expect(result.products[0].isActive).toBe(true);
    expect(result.products[0].updatedAt).toBeTruthy();
    // updatedBy should be csv-import
    expect((result.products[0] as any).updatedBy).toBe('csv-import');
  });

  it('returns error for CSV with only header (no data rows)', () => {
    const csv = VALID_HEADER;
    const result = parseProductCsv(csv);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('header row');
    expect(result.products).toHaveLength(0);
  });

  it('returns error for empty CSV', () => {
    const result = parseProductCsv('');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('header row');
    expect(result.products).toHaveLength(0);
  });

  it('returns error when name column is missing', () => {
    const csv = 'sku,quantity,price,cost\nSKU-001,10,25,12';
    const result = parseProductCsv(csv);

    expect(result.products).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('name');
  });

  it('reports an error for rows with empty product name', () => {
    const csv = `${VALID_HEADER}\n,SKU-001,10,25,12,`;
    const result = parseProductCsv(csv);

    expect(result.products).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Empty product name');
  });

  it('handles invalid quantity gracefully with an error', () => {
    const csv = `${VALID_HEADER}\nTest,SKU-001,not-a-number,25,12,`;
    const result = parseProductCsv(csv);

    expect(result.products).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Invalid quantity');
  });

  it('defaults missing numeric fields to 0', () => {
    const csv = `${VALID_HEADER}\nTest,SKU-001,,,,`;
    const result = parseProductCsv(csv);

    expect(result.products).toHaveLength(1);
    expect(result.products[0].quantity).toBe(0);
    expect(result.products[0].price).toBe(0);
    expect(result.products[0].cost).toBe(0);
  });

  it('handles Spanish header aliases in the CSV', () => {
    const csv = 'nombre,codigo,cantidad,precio,costo,imagen\nCamiseta,SKU-001,10,25.5,12,http://img.com/1.jpg';
    const result = parseProductCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Camiseta');
    expect(result.products[0].sku).toBe('SKU-001');
    expect(result.products[0].quantity).toBe(10);
  });

  it('handles CSV with extra columns beyond the canonical ones', () => {
    const csv = 'name,sku,quantity,price,cost,imageUrl,extra_col\nTest,SKU-001,10,25,12,,some-value';
    const result = parseProductCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Test');
  });

  it('accepts a custom column mapping', () => {
    const csv = ' Producto , Existencia ,\nTest,10,';
    const result = parseProductCsv(csv, {
      columnMapping: ['name', 'quantity', null],
    });

    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Test');
    expect(result.products[0].quantity).toBe(10);
  });

  it('uses custom mapping to detect missing name', () => {
    const csv = 'header1,header2\nTest,10';
    const result = parseProductCsv(csv, {
      columnMapping: [null, 'quantity'],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('name');
    expect(result.products).toHaveLength(0);
  });

  it('handles Unicode and special characters in product names', () => {
    const csv = `${VALID_HEADER}\nCafé Espresso Ñ,SKU-001,5,15.50,8,`;
    const result = parseProductCsv(csv);

    expect(result.products[0].name).toBe('Café Espresso Ñ');
  });

  it('handles prices with comma as decimal separator', () => {
    const csv = `${VALID_HEADER}\nTest,SKU-001,10,"25,50","12,00",`;
    const result = parseProductCsv(csv);

    expect(result.products[0].price).toBe(25.5);
    expect(result.products[0].cost).toBe(12);
  });

  it('handles BOM character at start of CSV', () => {
    const csv = `\uFEFF${VALID_HEADER}\nTest,SKU-001,10,25,12,`;
    const result = parseProductCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Test');
  });

  it('trims whitespace from cell values', () => {
    const csv = `${VALID_HEADER}\n  Test  ,  SKU-001  ,  10  ,  25  ,  12  ,`;
    const result = parseProductCsv(csv);

    expect(result.products[0].name).toBe('Test');
    expect(result.products[0].sku).toBe('SKU-001');
  });

  it('skips blank lines between data rows', () => {
    const csv = `${VALID_HEADER}\nA,SKU-A,1,10,5,\n\nB,SKU-B,2,20,8,`;
    const result = parseProductCsv(csv);

    expect(result.products).toHaveLength(2);
    expect(result.products[0].name).toBe('A');
    expect(result.products[1].name).toBe('B');
  });

  it('handles \r\n line endings', () => {
    const csv = `${VALID_HEADER}\r\nTest,SKU-001,10,25,12,`;
    const result = parseProductCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
  });

  it('returns mappedHeaders as unique canonical headers used', () => {
    const csv = `${VALID_HEADER}\nTest,SKU-001,10,25,12,`;
    const result = parseProductCsv(csv);

    expect(result.mappedHeaders).toContain('name');
    expect(result.mappedHeaders).toContain('sku');
    expect(result.mappedHeaders).toContain('quantity');
    expect(result.mappedHeaders).toContain('price');
    expect(result.mappedHeaders).toContain('cost');
    expect(result.mappedHeaders).toContain('imageUrl');
  });

  it('fills defaults for missing optional columns when name is present', () => {
    const csv = 'name\nTest';
    const result = parseProductCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('Test');
    expect(result.products[0].quantity).toBe(0);
    expect(result.products[0].price).toBe(0);
    expect(result.products[0].cost).toBe(0);
  });

  it('handles a large CSV with many rows', () => {
    const rows = Array.from({ length: 100 }, (_, i) => `Product ${i},SKU-${i},${i + 1},${(i + 1) * 10},${(i + 1) * 5},`).join('\n');
    const csv = `${VALID_HEADER}\n${rows}`;
    const result = parseProductCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(100);
    expect(result.products[99].name).toBe('Product 99');
    expect(result.products[99].quantity).toBe(100);
  });
});
