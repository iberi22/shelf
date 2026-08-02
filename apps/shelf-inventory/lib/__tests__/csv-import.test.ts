import { describe, expect, it } from 'vitest';
import { parseProductCsv, parseProductCsvAtomic } from '../csvProductImport';

describe('CSV import all-or-nothing rollback (#360)', () => {
  const header = 'name,sku,quantity,price,cost,imageUrl';

  it('imports nothing when a middle row is invalid', () => {
    const csv = `${header}
Valid One,SKU-001,10,25,12,
,SKU-002,5,10,5,
Valid Two,SKU-003,8,15,7,`;
    const atomic = parseProductCsvAtomic(csv);
    expect(atomic.ok).toBe(false);
    expect(atomic.products).toHaveLength(0);
    expect(atomic.errors.length).toBeGreaterThan(0);
    expect(atomic.abortReason).toMatch(/aborted|Nothing was imported/i);
    const partial = parseProductCsv(csv);
    expect(partial.products.length).toBeGreaterThan(0);
    expect(partial.errors.length).toBeGreaterThan(0);
  });

  it('imports all rows when every row is valid', () => {
    const csv = `${header}
A,SKU-A,1,1,1,
B,SKU-B,2,2,2,`;
    const atomic = parseProductCsvAtomic(csv);
    expect(atomic.ok).toBe(true);
    expect(atomic.products).toHaveLength(2);
  });

  it('aborts on invalid quantity mid-file', () => {
    const csv = `${header}
Good,G-1,10,5,2,
Bad,B-1,not-a-number,5,2,
AlsoGood,G-2,3,3,1,`;
    const atomic = parseProductCsvAtomic(csv);
    expect(atomic.ok).toBe(false);
    expect(atomic.products).toEqual([]);
  });
});
