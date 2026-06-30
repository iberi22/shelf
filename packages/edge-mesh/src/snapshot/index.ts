import * as Y from 'yjs';
import type { MeshStorage } from '../types';

export interface Snapshot {
	id: string;
	timestamp: number;
	stateVector: Uint8Array;
	data: Uint8Array; // serialized Y.Doc update
}

export interface SnapshotManagerOptions {
	storage?: MeshStorage;
	now?: () => number;
	idFactory?: () => string;
}

export class SnapshotManager {
	private storage?: MeshStorage;
	private now: () => number;
	private idFactory: () => string;
	private memorySnapshots = new Map<string, Snapshot>();

	constructor(options: SnapshotManagerOptions = {}) {
		this.storage = options.storage;
		this.now = options.now || (() => Date.now());
		this.idFactory =
			options.idFactory ||
			(() => {
				if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
				return `snap-${this.now()}-${Math.random().toString(36).slice(2)}`;
			});
	}

	async create(doc: Y.Doc): Promise<Snapshot> {
		const snapshot: Snapshot = {
			id: this.idFactory(),
			timestamp: this.now(),
			stateVector: Y.encodeStateVector(doc),
			data: Y.encodeStateAsUpdate(doc),
		};

		this.memorySnapshots.set(snapshot.id, snapshot);

		if (this.storage) {
			await this.storage.set(`snapshot:${snapshot.id}`, snapshot);
		}

		return snapshot;
	}

	async get(id: string): Promise<Snapshot | null> {
		const memory = this.memorySnapshots.get(id);
		if (memory) return memory;

		if (this.storage) {
			const persisted = await this.storage.get(`snapshot:${id}`);
			if (persisted) {
				return persisted as Snapshot;
			}
		}

		return null;
	}

	async recover(doc: Y.Doc, snapshot: Snapshot): Promise<void> {
		Y.applyUpdate(doc, snapshot.data, 'snapshot-recovery');
	}
}

export const createSnapshotManager = (options: SnapshotManagerOptions = {}) =>
	new SnapshotManager(options);
