import { type IDBPDatabase, openDB } from 'idb';
import * as Y from 'yjs';
import type { MeshStorage } from '../types';

export class StorageManager {
	private dbName: string;
	private dbPromise: Promise<IDBPDatabase>;

	constructor(dbName = 'edge-mesh-db') {
		this.dbName = dbName;
		this.dbPromise = openDB(this.dbName, 1, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('updates')) {
					db.createObjectStore('updates', { autoIncrement: true });
				}
				if (!db.objectStoreNames.contains('snapshots')) {
					db.createObjectStore('snapshots');
				}
			},
		});
	}

	public async saveUpdate(update: Uint8Array) {
		const db = await this.dbPromise;
		await db.add('updates', update);
	}

	public async loadUpdates(): Promise<Uint8Array[]> {
		const db = await this.dbPromise;
		return await db.getAll('updates');
	}

	public async saveSnapshot(name: string, snapshot: Uint8Array) {
		const db = await this.dbPromise;
		await db.put('snapshots', snapshot, name);
	}

	public async loadSnapshot(name: string): Promise<Uint8Array | undefined> {
		const db = await this.dbPromise;
		return await db.get('snapshots', name);
	}

	public async clearUpdates() {
		const db = await this.dbPromise;
		await db.clear('updates');
	}

	public async persistDoc(doc: Y.Doc) {
		const update = Y.encodeStateAsUpdate(doc);
		await this.saveSnapshot('main', update);
		await this.clearUpdates();
	}

	public async loadIntoDoc(doc: Y.Doc) {
		const snapshot = await this.loadSnapshot('main');
		if (snapshot) {
			Y.applyUpdate(doc, snapshot);
		}
		const updates = await this.loadUpdates();
		for (const update of updates) {
			Y.applyUpdate(doc, update);
		}
	}
}

export class InMemoryStorage implements MeshStorage {
	private data = new Map<string, unknown>();

	async get<T = unknown>(key: string): Promise<T> {
		return this.data.get(key) as T;
	}

	async set<T = unknown>(key: string, value: T): Promise<void> {
		this.data.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.data.delete(key);
	}

	async clear(): Promise<void> {
		this.data.clear();
	}
}
