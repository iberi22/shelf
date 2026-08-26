/**
 * Backwards-compatible entry point for `generateId` / `generateSecureId`.
 *
 * The canonical implementation lives in `lib/id.ts` (SHELF-107): a single
 * `crypto.getRandomValues()`-backed UUID v4 generator with no non-secure PRNG
 * in any ID-generation path. This module only re-exports it so existing
 * importers of `utils/id` keep working unchanged.
 */
export { generateId, generateSecureId } from '../lib/id';
