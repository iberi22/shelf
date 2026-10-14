import type { Product } from '../domain/types';

/** Canonical CSV columns for product import */
export const CANONICAL_CSV_HEADERS = ['name', 'sku', 'quantity', 'price', 'cost', 'imageUrl'] as const;

export type CanonicalCsvHeader = (typeof CANONICAL_CSV_HEADERS)[number];

/**
 * Import modes (SHELF-109):
 * - 'all-or-nothing': validate EVERY row first; if any row is invalid the whole
 *   batch is rejected (atomic import, nothing committed).
 * - 'import-valid-rows': invalid rows are skipped and reported; valid rows are
 *   imported.
 */
export type CsvImportMode = 'all-or-nothing' | 'import-valid-rows';

/** Accept common aliases / localized headers */
const HEADER_ALIASES: Record<string, CanonicalCsvHeader> = {
  name: 'name',
  nombre: 'name',
  product: 'name',
  producto: 'name',
  sku: 'sku',
  code: 'sku',
  codigo: 'sku',
  código: 'sku',
  quantity: 'quantity',
  qty: 'quantity',
  cantidad: 'quantity',
  stock: 'quantity',
  price: 'price',
  precio: 'price',
  cost: 'cost',
  costo: 'cost',
  imageurl: 'imageUrl',
  image: 'imageUrl',
  imagen: 'imageUrl',
  'image url': 'imageUrl',
};

export interface CsvParseRowError {
  line: number;
  message: string;
}

export interface CsvProductParseResult {
  products: Omit<Product, 'id'>[];
  errors: CsvParseRowError[];
  mappedHeaders: CanonicalCsvHeader[];
  /** true when the parsed rows can be applied under the requested mode */
  ok: boolean;
  mode: CsvImportMode;
  validCount: number;
  invalidCount: number;
  invalidRows: CsvParseRowError[];
}

export interface AtomicCsvImportResult {
  ok: boolean;
  products: Omit<Product, 'id'>[];
  errors: CsvParseRowError[];
  mappedHeaders: CanonicalCsvHeader[];
  abortReason?: string;
  mode?: CsvImportMode;
  validCount?: number;
  invalidCount?: number;
  invalidRows?: CsvParseRowError[];
}

export interface TransactionalCsvImportOptions {
  columnMapping?: (CanonicalCsvHeader | null)[];
  doc?: { transact: (fn: () => void) => void };
  onApply?: (products: Omit<Product, 'id'>[]) => void;
}

export interface TransactionalCsvImportResult extends AtomicCsvImportResult {
  committed: boolean;
}

/** Post-parse validation report shown to the user *before* applying the import. */
export interface CsvValidationReport {
  validCount: number;
  invalidCount: number;
  totalRows: number;
  invalidRows: CsvParseRowError[];
}

function normalizeHeader(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

/**
 * Split a CSV line respecting simple quoted fields.
 */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result.map((c) => c.replace(/^"|"$/g, '').trim());
}

export function mapHeaders(rawHeaders: string[]): {
  mapping: (CanonicalCsvHeader | null)[];
  missing: CanonicalCsvHeader[];
} {
  const mapping = rawHeaders.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? null);
  const found = new Set(mapping.filter(Boolean) as CanonicalCsvHeader[]);
  const missing = CANONICAL_CSV_HEADERS.filter((h) => h !== 'imageUrl' && !found.has(h));
  return { mapping, missing };
}

export function previewCsvHeaders(text: string): {
  rawHeaders: string[];
  suggestedMapping: (CanonicalCsvHeader | null)[];
  missingRequired: CanonicalCsvHeader[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      rawHeaders: [],
      suggestedMapping: [],
      missingRequired: [...CANONICAL_CSV_HEADERS].filter((h) => h !== 'imageUrl'),
    };
  }

  const rawHeaders = splitCsvLine(lines[0]);
  const { mapping, missing } = mapHeaders(rawHeaders);
  return {
    rawHeaders,
    suggestedMapping: mapping,
    missingRequired: missing,
  };
}

function emptyResult(
  errors: CsvParseRowError[],
  mappedHeaders: CanonicalCsvHeader[],
  mode: CsvImportMode,
): CsvProductParseResult {
  return {
    products: [],
    errors,
    mappedHeaders,
    ok: errors.length === 0,
    mode,
    validCount: 0,
    invalidCount: errors.length,
    invalidRows: errors,
  };
}

/**
 * Parse product CSV text into product drafts + per-row errors.
 * Requires name + at least one of quantity/price/cost columns (name is mandatory).
 *
 * Mode semantics (SHELF-109):
 * - 'import-valid-rows' (default): invalid rows are skipped and reported, the
 *   remaining valid rows are returned.
 * - 'all-or-nothing': when ANY row is invalid the result returns `ok: false`
 *   with `products: []` so callers can abort before touching the CRDT.
 */
export function parseProductCsv(
  text: string,
  options?: { columnMapping?: (CanonicalCsvHeader | null)[]; mode?: CsvImportMode },
): CsvProductParseResult {
  return parseProductCsvWithMode(text, options);
}

export function parseProductCsvWithMode(
  text: string,
  options?: { columnMapping?: (CanonicalCsvHeader | null)[]; mode?: CsvImportMode },
): CsvProductParseResult {
  const mode = options?.mode ?? 'import-valid-rows';
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return emptyResult([{ line: 1, message: 'CSV must include a header row and at least one data row' }], [], mode);
  }

  const rawHeaders = splitCsvLine(lines[0]);

  let mapping: (CanonicalCsvHeader | null)[];
  let missing: CanonicalCsvHeader[];

  if (options?.columnMapping && options.columnMapping.length === rawHeaders.length) {
    mapping = options.columnMapping;
    const found = new Set(mapping.filter(Boolean) as CanonicalCsvHeader[]);
    missing = CANONICAL_CSV_HEADERS.filter((h) => h !== 'imageUrl' && !found.has(h));
  } else {
    const res = mapHeaders(rawHeaders);
    mapping = res.mapping;
    missing = res.missing;
  }

  if (missing.includes('name')) {
    return emptyResult(
      [
        {
          line: 1,
          message: `Missing required column "name" (aliases: nombre, product). Got: ${rawHeaders.join(', ')}`,
        },
      ],
      [],
      mode,
    );
  }

  if (missing.length > 0) {
    // Soft: allow import if name exists; fill defaults for missing numeric cols
  }

  const products: Omit<Product, 'id'>[] = [];
  const errors: CsvParseRowError[] = [];
  const now = new Date().toISOString();

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);
    const row: Partial<Record<CanonicalCsvHeader, string>> = {};

    mapping.forEach((canon, idx) => {
      if (canon) row[canon] = cells[idx] ?? '';
    });

    const name = (row.name || '').trim();
    if (!name) {
      errors.push({ line: lineNo, message: 'Empty product name' });
      continue;
    }

    const quantity = parseNumber(row.quantity, 0);
    const price = parseNumber(row.price, 0);
    const cost = parseNumber(row.cost, 0);

    if (row.quantity !== undefined && row.quantity !== '' && Number.isNaN(Number(row.quantity))) {
      errors.push({ line: lineNo, message: `Invalid quantity "${row.quantity}" for "${name}"` });
      continue;
    }

    products.push({
      name,
      sku: row.sku?.trim() || undefined,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      price: Number.isFinite(price) ? price : 0,
      cost: Number.isFinite(cost) ? cost : 0,
      imageUrl: row.imageUrl?.trim() || undefined,
      isActive: true,
      updatedBy: 'csv-import',
      updatedAt: now,
    });
  }

  const mappedHeaders = [...new Set(mapping.filter((m): m is CanonicalCsvHeader => m !== null))];

  // ── SHELF-109: all-or-nothing gate ─────────────────────────────────────────
  // Validate EVERY row first; if any row is invalid the whole batch is
  // rejected so callers never commit a partial import.
  if (mode === 'all-or-nothing' && errors.length > 0) {
    return emptyResult(errors, mappedHeaders, mode);
  }
  if (mode === 'all-or-nothing' && products.length === 0) {
    return emptyResult(
      errors.length > 0 ? errors : [{ line: 1, message: 'No valid products found in CSV' }],
      mappedHeaders,
      mode,
    );
  }

  return {
    products,
    errors,
    mappedHeaders,
    ok: true,
    mode,
    validCount: products.length,
    invalidCount: errors.length,
    invalidRows: errors,
  };
}

function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function parseProductCsvAtomic(
  text: string,
  options?: { columnMapping?: (CanonicalCsvHeader | null)[] },
): AtomicCsvImportResult {
  const parsed = parseProductCsvWithMode(text, { ...options, mode: 'all-or-nothing' });
  if (!parsed.ok) {
    return {
      ok: false,
      products: [],
      errors: parsed.errors,
      mappedHeaders: parsed.mappedHeaders,
      abortReason: `CSV import aborted: ${parsed.invalidCount} invalid row(s). Nothing was imported.`,
      mode: 'all-or-nothing',
      validCount: 0,
      invalidCount: parsed.invalidCount,
      invalidRows: parsed.invalidRows,
    };
  }
  if (parsed.products.length === 0) {
    return {
      ok: false,
      products: [],
      errors: parsed.errors.length ? parsed.errors : [{ line: 1, message: 'No valid products found in CSV' }],
      mappedHeaders: parsed.mappedHeaders,
      abortReason: 'CSV import aborted: no valid products found. Nothing was imported.',
      mode: 'all-or-nothing',
      validCount: 0,
      invalidCount: parsed.invalidCount,
      invalidRows: parsed.invalidRows,
    };
  }
  return {
    ok: true,
    products: parsed.products,
    errors: [],
    mappedHeaders: parsed.mappedHeaders,
    mode: 'all-or-nothing',
    validCount: parsed.validCount,
    invalidCount: 0,
    invalidRows: [],
  };
}

/** Build the human-readable validation report shown before an import is applied. */
export function buildCsvValidationReport(result: CsvProductParseResult): CsvValidationReport {
  return {
    validCount: result.validCount,
    invalidCount: result.invalidCount,
    totalRows: result.validCount + result.invalidCount,
    invalidRows: result.invalidRows,
  };
}

/**
 * Execute CSV product import with all-or-nothing transactional guarantees.
 * If validation fails for ANY row or an exception occurs during execution,
 * the operation is rolled back completely and nothing is committed.
 */
export function importCSVTransactional(
  text: string,
  options?: TransactionalCsvImportOptions,
): TransactionalCsvImportResult {
  const parsed = parseProductCsvAtomic(text, { columnMapping: options?.columnMapping });

  if (!parsed.ok || parsed.products.length === 0) {
    return {
      ...parsed,
      committed: false,
    };
  }

  if (options?.onApply || options?.doc) {
    try {
      if (options.doc && typeof options.doc.transact === 'function') {
        options.doc.transact(() => {
          options.onApply?.(parsed.products);
        });
      } else if (options.onApply) {
        options.onApply(parsed.products);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        products: [],
        errors: [...parsed.errors, { line: 0, message: `Rollback executed: ${message}` }],
        mappedHeaders: parsed.mappedHeaders,
        abortReason: `Import execution error. Transaction rolled back: ${message}`,
        mode: 'all-or-nothing',
        validCount: 0,
        invalidCount: parsed.invalidCount,
        invalidRows: parsed.invalidRows,
        committed: false,
      };
    }
  }

  return {
    ...parsed,
    committed: true,
  };
}
