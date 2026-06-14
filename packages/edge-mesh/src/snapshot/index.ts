import * as Y from 'yjs';

export interface SnapshotRecord {
	namespace: string;
	update: Uint8Array;
	stateVector: Uint8Array;
	createdAt: number;
}

export class SnapshotManager {
	private snapshots = new Map<string, SnapshotRecord>();
	private now: () => number;

	constructor(options: { now?: () => number } = {}) {
		this.now = options.now || (() => Date.now());
	}

	create(namespace: string, doc: Y.Doc): SnapshotRecord {
		const snapshot: SnapshotRecord = {
			namespace,
			update: Y.encodeStateAsUpdate(doc),
			stateVector: Y.encodeStateVector(doc),
			createdAt: this.now(),
		};
		this.snapshots.set(namespace, snapshot);
		return snapshot;
	}

	get(namespace: string): SnapshotRecord | undefined {
		return this.snapshots.get(namespace);
	}

	apply(doc: Y.Doc, snapshot: SnapshotRecord, origin?: unknown): void {
		Y.applyUpdate(doc, snapshot.update, origin);
	}
}

export const createSnapshotManager = (options: { now?: () => number } = {}) =>
	new SnapshotManager(options);
