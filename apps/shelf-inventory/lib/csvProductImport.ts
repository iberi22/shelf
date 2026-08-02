import type { Product } from 'p2p-mesh-core';

/** Canonical CSV columns for product import */
export const CANONICAL_CSV_HEADERS = ['name', 'sku', 'quantity', 'price', 'cost', 'imageUrl'] as const;

export type CanonicalCsvHeader = (typeof CANONICAL_CSV_HEADERS)[number];

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
}

export interface AtomicCsvImportResult {
  ok: boolean;
  products: Omit<Product, 'id'>[];
  errors: CsvParseRowError[];
  mappedHeaders: CanonicalCsvHeader[];
  abortReason?: string;
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

/**
 * Parse product CSV text into product drafts + per-row errors.
 * Requires name + at least one of quantity/price/cost columns (name is mandatory).
 */
export function parseProductCsv(
  text: string,
  options?: { columnMapping?: (CanonicalCsvHeader | null)[] },
): CsvProductParseResult {
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
    return {
      products: [],
      errors: [
        {
          line: 1,
          message: `Missing required column "name" (aliases: nombre, product). Got: ${rawHeaders.join(', ')}`,
        },
      ],
      mappedHeaders: [],
    };
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

  return { products, errors, mappedHeaders };
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
  const parsed = parseProductCsv(text, options);
  if (parsed.errors.length > 0) {
    return {
      ok: false,
      products: [],
      errors: parsed.errors,
      mappedHeaders: parsed.mappedHeaders,
      abortReason: `CSV import aborted: ${parsed.errors.length} invalid row(s). Nothing was imported.`,
    };
  }
  if (parsed.products.length === 0) {
    return {
      ok: false,
      products: [],
      errors: parsed.errors.length ? parsed.errors : [{ line: 1, message: 'No valid products found in CSV' }],
      mappedHeaders: parsed.mappedHeaders,
      abortReason: 'CSV import aborted: no valid products found. Nothing was imported.',
    };
  }
  return { ok: true, products: parsed.products, errors: [], mappedHeaders: parsed.mappedHeaders };
}
