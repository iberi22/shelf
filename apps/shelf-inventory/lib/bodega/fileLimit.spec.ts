import { describe, expect, it } from 'vitest';

import { BODEGA_MAX_FILE_BYTES, isBodegaFileTooLarge } from './fileLimit';

describe('bodega imported file-size limit', () => {
  it('caps the imported snapshot at 5 MB', () => {
    expect(BODEGA_MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
  });

  it('accepts files at or below the limit and rejects anything larger', () => {
    expect(isBodegaFileTooLarge(0)).toBe(false);
    expect(isBodegaFileTooLarge(BODEGA_MAX_FILE_BYTES - 1)).toBe(false);
    // exactly at the limit is allowed
    expect(isBodegaFileTooLarge(BODEGA_MAX_FILE_BYTES)).toBe(false);
    // one byte over is rejected
    expect(isBodegaFileTooLarge(BODEGA_MAX_FILE_BYTES + 1)).toBe(true);
  });
});
