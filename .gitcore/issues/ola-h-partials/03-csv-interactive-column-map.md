# [Ola H · 03] CSV interactive column mapping (SRC-FUN-014)

> Wave: **Ola H — Close Partial Features**.  
> SSOT gap: SRC-FUN-014 ~82% — `HEADER_ALIASES` auto-map exists; **no interactive remapping UI** when headers are unknown.  
> Prefer PR base: **`develop`**.

## Web Research Required

1. Search: `"CSV import column mapping UI React"` patterns (select per column).
2. Keep UX mobile-friendly (Shelf already uses min-h-[44px] touch targets).

## Exact Technical Context

### Parser (`apps/shelf-inventory/lib/csvProductImport.ts` ~160 lines)

- Canonical headers: `name, sku, quantity, price, cost, imageUrl` (`CANONICAL_CSV_HEADERS`)
- `mapHeaders(rawHeaders)` ~83–91 returns `{ mapping: (CanonicalCsvHeader|null)[], missing }`
- `parseProductCsv(text)` ~97+ always auto-maps via aliases only

### Modal (`apps/shelf-inventory/components/ImportCSVModal.tsx` ~169 lines)

- Reads file → `parseProductCsv(text)` → dispatch `IMPORT_PRODUCTS`
- Testids: `import-csv-modal`, `import-csv-file-input`, `import-csv-strategy-skip|update`

### Existing tests

- `apps/shelf-inventory/tests/csv-import.spec.ts`

## Problem

If a CSV uses non-aliased headers (e.g. `Product Title`, `Unit Cost`), import fails or mis-maps. Users need a **one-time mapping step** before import.

## Design (keep small — under ~80 lines net logic)

### 1. Extend library API

```ts
export function parseProductCsv(
  text: string,
  options?: { columnMapping?: (CanonicalCsvHeader | null)[] }
): CsvProductParseResult
```

- If `columnMapping` provided and length matches raw header count, use it instead of `mapHeaders` auto result.
- Export helper:

```ts
export function previewCsvHeaders(text: string): {
  rawHeaders: string[];
  suggestedMapping: (CanonicalCsvHeader | null)[];
  missingRequired: CanonicalCsvHeader[];
} 
```

### 2. UI flow in ImportCSVModal

1. User selects file → read text → `previewCsvHeaders`
2. Show a mapping table:
   - Row: raw header → `<select data-testid="csv-map-{index}">` with options: (ignore) + all `CANONICAL_CSV_HEADERS`
   - Preselect suggested mapping from aliases
3. Require at least `name` mapped before Enable Import button
4. On Import: `parseProductCsv(text, { columnMapping: userMapping })`

Styling: reuse existing dark theme classes (`bg-[#121212] border border-[#F5F5DC]/30`).

### 3. Tests

- Unit: `mapHeaders` / `parseProductCsv` with explicit mapping for weird headers
- Optionally extend Playwright `csv-import.spec.ts` with a fixture string (no need for full visual redesign)

## Acceptance Criteria

- [ ] User can remap columns after selecting a CSV
- [ ] `name` required before import enabled
- [ ] Auto-suggested aliases still pre-fill selects
- [ ] `parseProductCsv` accepts optional explicit mapping
- [ ] Existing template.csv import path still works with zero user changes
- [ ] `data-testid`s for mapping selects and confirm import
- [ ] `pnpm --dir apps/shelf-inventory exec tsc --noEmit` clean for touched files
- [ ] Update/add test coverage in `tests/csv-import.spec.ts` or unit section of same file

## Files to Modify

| File | Change |
|------|--------|
| `apps/shelf-inventory/lib/csvProductImport.ts` | preview + optional mapping |
| `apps/shelf-inventory/components/ImportCSVModal.tsx` | mapping UI step |
| `apps/shelf-inventory/tests/csv-import.spec.ts` | coverage |
| locales en/es (optional keys for "Map columns") | i18n strings with English fallbacks OK |

**DO NOT touch:** P2P crypto, InviteMemberModal, SubscriptionModal, packages/edge-mesh.

**NEVER create `.patch` / root dump files.**

## Verification

```bash
pnpm --dir apps/shelf-inventory exec tsc --noEmit
# Prefer targeted playwright if environment allows:
# pnpm --dir apps/shelf-inventory exec playwright test tests/csv-import.spec.ts
```

## Dependencies and Merge Order

- **Depends on:** nothing
- **Can run in parallel with:** 01, 02, 04
- **SRC-ID:** SRC-FUN-014
