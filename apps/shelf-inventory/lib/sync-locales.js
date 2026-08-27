#!/usr/bin/env node
/**
 * SHELF-214 — Secondary locales sync
 *
 * Audits every locale in apps/shelf-inventory/locales/ against the en.json
 * base, reports missing (and extra) keys, and auto-fills missing keys with
 * an explicit placeholder so translators can find them quickly.
 *
 * Placeholder convention: missing string values become "[MISSING: <full.key.path>]"
 * (trivially greppable: grep -rn "\[MISSING:" apps/shelf-inventory/locales/).
 * Non-string base values (arrays, numbers, booleans) are copied from en.json
 * as a type-safe fallback instead of a placeholder, so consumers (e.g. .map()
 * over a features list) never break.
 *
 * Usage:
 *   node scripts/sync-locales.js                # report + fill placeholders (writes files)
 *   node scripts/sync-locales.js --check        # report only, no writes; exit 1 if missing keys exist (CI gate)
 *   node scripts/sync-locales.js --locale fr    # only process the given locale
 *   node scripts/sync-locales.js --remove-extras# ALSO delete keys that exist in a locale but not in en.json
 *
 * Output files keep en.json's key order (verified: all locales align), 2-space
 * indent, unicode preserved, and a trailing newline — so diffs stay minimal.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.resolve(__dirname, '../apps/shelf-inventory/locales');
const BASE_LOCALE = 'en';
const PLACEHOLDER_PREFIX = '[MISSING:';

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const REMOVE_EXTRAS = args.includes('--remove-extras');
const localeFlagIndex = args.indexOf('--locale');
const ONLY_LOCALE = localeFlagIndex !== -1 ? args[localeFlagIndex + 1] : null;

if (localeFlagIndex !== -1 && !ONLY_LOCALE) {
  console.error('Error: --locale requires a value, e.g. --locale fr');
  process.exit(2);
}

// ── helpers ───────────────────────────────────────────────────────────────
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getLeafKeys(obj, prefix = '', out = []) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) getLeafKeys(value, full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Rebuild `localeObj` mirroring `baseObj` structure/key order, filling any
 * missing leaf with a placeholder. Returns { result, missing, extras }.
 *
 * When `pruneExtras` is false (default), keys present in the locale but absent
 * from the base are preserved (appended after the base-ordered keys, so all
 * locales converge on en.json's structure). When true, they are dropped.
 */
function syncObject(baseObj, localeObj, localeCode, pruneExtras, prefix = '') {
  const result = {};
  const missing = [];
  const extras = [];

  for (const [key, baseValue] of Object.entries(baseObj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (Object.prototype.hasOwnProperty.call(localeObj, key)) {
      const localeValue = localeObj[key];
      if (isPlainObject(baseValue) && isPlainObject(localeValue)) {
        const child = syncObject(
          baseValue,
          localeValue,
          localeCode,
          pruneExtras,
          full,
        );
        result[key] = child.result;
        missing.push(...child.missing);
        extras.push(...child.extras);
      } else {
        result[key] = localeValue; // keep existing translation as-is
      }
    } else if (isPlainObject(baseValue)) {
      // Whole subtree missing → recurse so every leaf gets its own placeholder.
      const child = syncObject(baseValue, {}, localeCode, pruneExtras, full);
      result[key] = child.result;
      missing.push(...child.missing);
    } else if (typeof baseValue === 'string') {
      result[key] = `${PLACEHOLDER_PREFIX} ${full}]`;
      missing.push(full);
    } else {
      // Non-string base value (array/number/boolean) → copy base as type-safe fallback.
      result[key] = baseValue;
      missing.push(full);
    }
  }

  // Extras: present in the locale but absent from the base.
  for (const key of Object.keys(localeObj)) {
    if (!Object.prototype.hasOwnProperty.call(baseObj, key)) {
      extras.push(prefix ? `${prefix}.${key}` : key);
      if (!pruneExtras) result[key] = localeObj[key];
    }
  }

  return { result, missing, extras };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf-8');
}

// ── main ──────────────────────────────────────────────────────────────────
const baseFile = path.join(LOCALES_DIR, `${BASE_LOCALE}.json`);
if (!fs.existsSync(baseFile)) {
  console.error(`Error: base locale ${baseFile} not found`);
  process.exit(1);
}
const base = readJson(baseFile);
const baseKeys = getLeafKeys(base);

const localeFiles = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.json') && f !== `${BASE_LOCALE}.json`)
  .sort();

const rows = [];
let totalMissing = 0;
let totalExtras = 0;
let filesWritten = 0;

for (const file of localeFiles) {
  const localeCode = path.basename(file, '.json');
  if (ONLY_LOCALE && localeCode !== ONLY_LOCALE) continue;

  const localeObj = readJson(path.join(LOCALES_DIR, file));
  const { result, missing, extras } = syncObject(
    base,
    localeObj,
    localeCode,
    REMOVE_EXTRAS,
  );

  const writeNeeded = missing.length > 0 || extras.length > 0;
  if (!CHECK_ONLY && writeNeeded) {
    writeJson(path.join(LOCALES_DIR, file), result);
    filesWritten += 1;
  }

  totalMissing += missing.length;
  totalExtras += extras.length;
  rows.push({ localeCode, total: getLeafKeys(localeObj).length, missing, extras });
}

// ── report ────────────────────────────────────────────────────────────────
const LINE = '─'.repeat(52);
console.log('');
console.log('=== SHELF-214 locale sync report ===');
console.log(`Base : ${BASE_LOCALE}.json (${baseKeys.length} keys)`);
console.log(`Dir  : ${LOCALES_DIR}`);
console.log(LINE);
console.log(
  'Locale'.padEnd(8) +
    'Keys'.padStart(6) +
    'Missing'.padStart(9) +
    'Extra'.padStart(7) +
    '   Missing keys (first 5)',
);
console.log(LINE);

for (const { localeCode, total, missing, extras } of rows) {
  const samples = missing.slice(0, 5).join(', ');
  console.log(
    String(localeCode).padEnd(8) +
      String(total).padStart(6) +
      String(missing.length).padStart(9) +
      String(extras.length).padStart(7) +
      `   ${samples}${missing.length > 5 ? ' …' : ''}`,
  );
}
console.log(LINE);
console.log(
  `TOTAL: ${rows.length} locale(s) · ${totalMissing} missing key(s) · ${totalExtras} extra key(s)`,
);

if (CHECK_ONLY && totalMissing > 0) {
  console.log('\n❌ Missing keys detected (--check mode, nothing was written).');
  process.exit(1);
}

if (!CHECK_ONLY) {
  if (filesWritten > 0) {
    console.log(`\n✓ Filled placeholders in ${filesWritten} file(s).`);
    if (totalMissing > 0) {
      console.log(
        `  Find them with: grep -rn "\\[MISSING:" apps/shelf-inventory/locales/`,
      );
    }
  } else {
    console.log('\n✓ All locales are in sync — no files modified.');
  }
}