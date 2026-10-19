/**
 * Single source of truth for the maximum size of an imported Bodega snapshot file.
 *
 * The Bodega screen reads an external inventory snapshot into memory and renders it
 * read-only, so a bound on the imported file size protects the device from accidentally
 * loading an unbounded payload. Keep this constant referenced everywhere the limit is
 * enforced so it can never silently drift.
 */
export const BODEGA_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/** True when a file of `sizeInBytes` exceeds the allowed import size. */
export function isBodegaFileTooLarge(sizeInBytes: number): boolean {
  return sizeInBytes > BODEGA_MAX_FILE_BYTES;
}
