import type { AppState } from '../../../packages/p2p-mesh-core/src';
import * as p2pMeshCore from '../../../packages/p2p-mesh-core/src'; // Need to be able to mock correctly

// Mirrors IDB configuration from usePersistedReducer
const DB_NAME = 'ShelfStorage';
const DB_VERSION = 2;
const STORE_NAME = 'keyval';
const STORAGE_KEY = 'shelfState';

/**
 * Returns a promise that resolves to the AppState if successful, or null.
 * Replicates the decryption logic from usePersistedReducer.
 */
export async function readDecryptedState(): Promise<AppState | null> {
  const getDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      request.onerror = () => reject(request.error);
    });
  };

  try {
    const db = await getDB();
    const stored: string | null = await new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(STORE_NAME, 'readonly');
      let request: IDBRequest<any>;
      if (tx.objectStore(STORE_NAME).get) {
        request = tx.objectStore(STORE_NAME).get(STORAGE_KEY);
      } else {
        request = tx.objectStore(STORE_NAME).getAll(); // The idb mock only implements getAll
      }
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    if (!stored) {
      return null;
    }

    // If we used getAll from mock, it returns an array of values, so we just take the last one or only one.
    const payloadToDecrypt = Array.isArray(stored) ? stored[stored.length - 1] : stored;

    const key = await p2pMeshCore.getSessionKey();
    let parsed: unknown;
    try {
      const decryptedStr = await p2pMeshCore.decryptData(payloadToDecrypt, key);
      parsed = JSON.parse(decryptedStr);
    } catch (decryptError) {
      // Support legacy unencrypted state (like usePersistedReducer)
      try {
        parsed = JSON.parse(payloadToDecrypt);
      } catch (_legacyParseError) {
        throw decryptError;
      }
    }

    if (parsed && typeof parsed === 'object') {
      if ('state' in parsed) {
        return (parsed as { state: AppState }).state;
      }
      return parsed as AppState;
    }
    return null;
  } catch (error) {
    console.error('Failed to read/decrypt state', error);
    return null;
  }
}

export function buildStateJson(state: AppState): string {
  const payload = {
    format: 'shelf-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(payload, null, 2);
}

function escapeSqlString(str: string): string {
  if (str == null) return 'NULL';
  // Double single quotes for SQLite
  return `'${str.replace(/'/g, "''")}'`;
}

function validateIdentifier(id: string): void {
  if (!/^[A-Za-z0-9_]+$/.test(id)) {
    throw new Error(`Invalid identifier: ${id}`);
  }
}

export function buildSqlDump(state: AppState): string {
  const lines: string[] = [];
  lines.push('PRAGMA foreign_keys=OFF;');
  lines.push('BEGIN;');

  lines.push('CREATE TABLE IF NOT EXISTS "_export_meta" (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  lines.push(`INSERT INTO "_export_meta" (key, value) VALUES ('format', 'shelf-export');`);
  lines.push(`INSERT INTO "_export_meta" (key, value) VALUES ('app_id', 'shelf-inventory');`);
  lines.push(
    `INSERT INTO "_export_meta" (key, value) VALUES ('exported_at', ${escapeSqlString(new Date().toISOString())});`,
  );
  lines.push(`INSERT INTO "_export_meta" (key, value) VALUES ('schema_version', '1');`);

  lines.push('CREATE TABLE IF NOT EXISTS "_settings" (key TEXT PRIMARY KEY, value TEXT NOT NULL);');

  for (const [key, value] of Object.entries(state)) {
    if (Array.isArray(value)) {
      validateIdentifier(key);
      lines.push(
        `CREATE TABLE IF NOT EXISTS "${key}" (id TEXT PRIMARY KEY, instance_id TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, data TEXT NOT NULL${value.length > 0 && !('id' in value[0] || value[0]?.id) ? ', idx INTEGER' : ''});`,
      );

      value.forEach((record: any, index: number) => {
        const idVal = record?.id ? escapeSqlString(String(record.id)) : `'idx_${index}'`;
        const instanceIdVal = record?.instanceId ? escapeSqlString(String(record.instanceId)) : 'NULL';
        const createdAtVal = record?.createdAt ? escapeSqlString(String(record.createdAt)) : 'NULL';
        const updatedAtVal = record?.updatedAt ? escapeSqlString(String(record.updatedAt)) : 'NULL';
        const deletedAtVal = record?.deletedAt ? escapeSqlString(String(record.deletedAt)) : 'NULL';
        const dataVal = escapeSqlString(JSON.stringify(record) || '');

        let cols = 'id, instance_id, created_at, updated_at, deleted_at, data';
        let vals = `${idVal}, ${instanceIdVal}, ${createdAtVal}, ${updatedAtVal}, ${deletedAtVal}, ${dataVal}`;

        if (!record?.id) {
          cols += ', idx';
          vals += `, ${index}`;
        }

        lines.push(`INSERT INTO "${key}" (${cols}) VALUES (${vals});`);
      });
    } else {
      const dataVal = escapeSqlString(JSON.stringify(value) || '');
      lines.push(`INSERT INTO "_settings" (key, value) VALUES (${escapeSqlString(key)}, ${dataVal});`);
    }
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}

export async function downloadMyData(kind: 'json' | 'sql', currentState?: AppState): Promise<void> {
  let state = currentState;
  if (!state) {
    state = (await readDecryptedState()) || undefined;
  }

  if (!state) {
    throw new Error('No state could be extracted for export.');
  }

  let content: string;
  let filename: string;
  let mimeType: string;

  if (kind === 'json') {
    content = buildStateJson(state);
    filename = `shelf-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    mimeType = 'application/json';
  } else {
    content = buildSqlDump(state);
    filename = `shelf-export-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
    mimeType = 'application/sql';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
