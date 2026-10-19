import { describe, expect, it, vi } from 'vitest';
import { BODEGA_MAX_FILE_BYTES } from './fileLimit';
import { type BodegaFileInput, loadBodegaFile } from './loadFile';

describe('loadBodegaFile', () => {
  const sampleValidSnapshot = JSON.stringify({
    format: 'swal-inventory-export/v1',
    source: {
      appId: 'shelf',
      instanceId: 'inst-1',
      schemaVersion: 1,
      exportedAt: '2026-10-19T12:00:00Z',
    },
    currency: 'USD',
    locations: [{ id: 'loc-1', name: 'Principal', type: 'bodega' }],
    items: [
      {
        id: 'item-1',
        name: 'Item A',
        quantity: 10,
        minStock: 2,
        cost: 5,
        price: 10,
        locationId: 'loc-1',
      },
    ],
    movements: [],
  });

  describe('file size bounding (protects device memory)', () => {
    it('does NOT call file.text() if file size exceeds 5 MB (e.g. 5MB + 1 byte)', async () => {
      const textSpy = vi.fn().mockResolvedValue(sampleValidSnapshot);
      const file: BodegaFileInput = {
        size: BODEGA_MAX_FILE_BYTES + 1,
        text: textSpy,
      };

      const result = await loadBodegaFile(file);

      expect(textSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('demasiado_grande');
      }
    });

    it('rejects a 10 MB payload without calling file.text()', async () => {
      const textSpy = vi.fn().mockResolvedValue(sampleValidSnapshot);
      const file: BodegaFileInput = {
        size: 10 * 1024 * 1024,
        text: textSpy,
      };

      const result = await loadBodegaFile(file);

      expect(textSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('demasiado_grande');
      }
    });

    it('allows a file exactly at the 5 MB boundary and invokes file.text()', async () => {
      const textSpy = vi.fn().mockResolvedValue(sampleValidSnapshot);
      const file: BodegaFileInput = {
        size: BODEGA_MAX_FILE_BYTES,
        text: textSpy,
      };

      const result = await loadBodegaFile(file);

      expect(textSpy).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
    });
  });

  describe('error code mapping', () => {
    it('maps malformed / invalid format JSON to code "formato"', async () => {
      const file: BodegaFileInput = {
        size: 100,
        text: vi.fn().mockResolvedValue('not-valid-json'),
      };

      const result = await loadBodegaFile(file);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('formato');
      }
    });

    it('maps encrypted file without passphrase to code "clave"', async () => {
      const encryptedStub = JSON.stringify({
        format: 'swal-inventory-export-enc/v1',
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 },
        salt: 'c2FsdA==',
        iv: 'aXY=',
        ciphertext: 'Y2lwaGVy',
      });
      const file: BodegaFileInput = {
        size: 200,
        text: vi.fn().mockResolvedValue(encryptedStub),
      };

      const result = await loadBodegaFile(file, '');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('clave');
      }
    });

    it('maps generic reading/decoding failure to code "inesperado"', async () => {
      const file: BodegaFileInput = {
        size: 100,
        text: vi.fn().mockRejectedValue(new Error('I/O read error')),
      };

      const result = await loadBodegaFile(file);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('inesperado');
        expect(result.message).toContain('I/O read error');
      }
    });
  });

  describe('successful reading and transformation', () => {
    it('produces a valid BodegaReadModel when snapshot is valid', async () => {
      const file: BodegaFileInput = {
        size: sampleValidSnapshot.length,
        text: vi.fn().mockResolvedValue(sampleValidSnapshot),
      };

      const result = await loadBodegaFile(file);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.model.source.appId).toBe('shelf');
        expect(result.model.products).toHaveLength(1);
        expect(result.model.products[0].name).toBe('Item A');
        expect(result.model.currency).toBe('USD');
      }
    });
  });
});
