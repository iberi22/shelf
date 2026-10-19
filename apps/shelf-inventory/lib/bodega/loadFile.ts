import { BodegaFormatError } from './contract';
import { isBodegaFileTooLarge } from './fileLimit';
import { openBodegaSnapshot } from './readSnapshot';
import { type BodegaReadModel, toReadModel } from './toProducts';

export type BodegaLoadErrorCode = 'demasiado_grande' | 'formato' | 'clave' | 'alterado' | 'inesperado';

export interface BodegaFileLoadFailure {
  ok: false;
  code: BodegaLoadErrorCode;
  message?: string;
}

export interface BodegaFileLoadSuccess {
  ok: true;
  model: BodegaReadModel;
}

export type LoadBodegaFileResult = BodegaFileLoadSuccess | BodegaFileLoadFailure;

export interface BodegaFileInput {
  size: number;
  text: () => Promise<string>;
}

/**
 * Pure loader for external Bodega inventory snapshots.
 *
 * Checks file size BEFORE calling `file.text()` to protect memory.
 * Reads and decrypts snapshot, converts to read model, and maps errors.
 */
export async function loadBodegaFile(file: BodegaFileInput, passphrase = ''): Promise<LoadBodegaFileResult> {
  if (isBodegaFileTooLarge(file.size)) {
    return {
      ok: false,
      code: 'demasiado_grande',
      message: 'El archivo supera el tamaño máximo permitido (5 MB).',
    };
  }

  try {
    const text = await file.text();
    const snapshot = await openBodegaSnapshot(text, passphrase);
    const model = toReadModel(snapshot);
    return { ok: true, model };
  } catch (err: unknown) {
    if (err instanceof BodegaFormatError) {
      return { ok: false, code: err.code, message: err.message };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'inesperado', message };
  }
}
