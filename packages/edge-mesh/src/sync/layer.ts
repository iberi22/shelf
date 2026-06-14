import { EventEmitter } from 'events';
import * as Y from 'yjs';
import { type OpLog, createOpLog } from '../op-log';
import { MessageDeduplicator } from '../protocol';
import { type SnapshotManager, createSnapshotManager } from '../snapshot';
import type {
	CrdtSyncEnvelope,
	MeshStorage,
	NamespaceAction,
	NamespaceAuthorizer,
} from '../types';

export interface SyncIdentity {
	peerId: string;
	sign?(message: Uint8Array): Uint8Array;
	verify?(
		signature: Uint8Array,
		message: Uint8Array,
		sourcePeerId: string,
	): boolean;
}

export interface CrdtSyncLayerOptions {
	namespace: string;
	doc?: Y.Doc;
	storage?: MeshStorage;
	identity: SyncIdentity;
	authorizer?: NamespaceAuthorizer;
	now?: () => number;
	idFactory?: () => string;
	opLog?: OpLog;
	snapshots?: SnapshotManager;
}

export interface CrdtSyncLayerEvents {
	ready: () => void;
	synced: (event: {
		namespace: string;
		sourcePeerId: string;
		opId: string;
	}) => void;
	lag: (event: {
		namespace: string;
		targetPeerId?: string;
		stateVector: Uint8Array;
	}) => void;
	'operation:rejected': (event: {
		envelope: CrdtSyncEnvelope;
		reason: string;
	}) => void;
	error: (error: Error) => void;
}

const bytesToStorage = (bytes: Uint8Array) => Array.from(bytes);
const bytesFromStorage = (value: unknown): Uint8Array | null => {
	if (value instanceof Uint8Array) return value;
	if (Array.isArray(value)) return new Uint8Array(value);
	return null;
};

export class CrdtSyncLayer extends EventEmitter {
	public readonly doc: Y.Doc;
	public readonly namespace: string;
	public readonly opLog: OpLog;
	public readonly snapshots: SnapshotManager;
	private storage?: MeshStorage;
	private identity: SyncIdentity;
	private authorizer?: NamespaceAuthorizer;
	private now: () => number;
	private idFactory: () => string;
	private dedupe = new MessageDeduplicator();
	private ready = false;

	constructor(options: CrdtSyncLayerOptions) {
		super();
		this.namespace = options.namespace;
		this.doc = options.doc || new Y.Doc();
		this.storage = options.storage;
		this.identity = options.identity;
		this.authorizer = options.authorizer;
		this.now = options.now || (() => Date.now());
		this.idFactory =
			options.idFactory ||
			(() => {
				if (globalThis.crypto?.randomUUID)
					return globalThis.crypto.randomUUID();
				return `sync-${this.now()}-${Math.random().toString(36).slice(2)}`;
			});
		this.opLog = options.opLog || createOpLog();
		this.snapshots =
			options.snapshots || createSnapshotManager({ now: this.now });
	}

	isReady(): boolean {
		return this.ready;
	}

	async load(): Promise<void> {
		if (!this.storage) {
			this.ready = true;
			this.emit('ready');
			return;
		}

		const snapshot = bytesFromStorage(
			await this.storage.get(`sync:${this.namespace}:snapshot`),
		);
		if (snapshot) {
			Y.applyUpdate(this.doc, snapshot, {
				type: 'storage',
				namespace: this.namespace,
			});
		}

		this.ready = true;
		this.emit('ready');
	}

	async persistSnapshot(): Promise<void> {
		const snapshot = this.snapshots.create(this.namespace, this.doc);
		await this.storage?.set(
			`sync:${this.namespace}:snapshot`,
			bytesToStorage(snapshot.update),
		);
	}

	getStateVector(): Uint8Array {
		this.requireReady();
		return Y.encodeStateVector(this.doc);
	}

	getDiff(remoteStateVector: Uint8Array): Uint8Array {
		this.requireReady();
		return Y.encodeStateAsUpdate(this.doc, remoteStateVector);
	}

	createSyncRequest(targetPeerId?: string): CrdtSyncEnvelope {
		return this.createEnvelope('sync:request', {
			targetPeerId,
			stateVector: this.getStateVector(),
			action: 'read',
		});
	}

	createUpdateForPeer(
		remoteStateVector: Uint8Array,
		targetPeerId?: string,
	): CrdtSyncEnvelope {
		return this.createEnvelope('sync:update', {
			targetPeerId,
			update: this.getDiff(remoteStateVector),
			action: 'write',
		});
	}

	createSnapshotEnvelope(targetPeerId?: string): CrdtSyncEnvelope {
		return this.createEnvelope('sync:snapshot', {
			targetPeerId,
			update: Y.encodeStateAsUpdate(this.doc),
			stateVector: this.getStateVector(),
			action: 'write',
		});
	}

	applyLocalChange(mutator: (doc: Y.Doc) => void): CrdtSyncEnvelope {
		this.requireReady();
		this.doc.transact(() => mutator(this.doc), {
			type: 'local',
			peerId: this.identity.peerId,
		});
		return this.createSnapshotEnvelope();
	}

	applyEnvelope(envelope: CrdtSyncEnvelope): CrdtSyncEnvelope | null {
		this.requireReady();
		if (this.dedupe.isDuplicate(envelope.id) || this.opLog.has(envelope.opId)) {
			return null;
		}

		const rejection = this.validateEnvelope(envelope);
		if (rejection) {
			this.emit('operation:rejected', { envelope, reason: rejection });
			return null;
		}

		if (envelope.type === 'sync:request') {
			this.emit('lag', {
				namespace: envelope.namespace,
				targetPeerId: envelope.sourcePeerId,
				stateVector: envelope.stateVector || new Uint8Array(),
			});
			return this.createUpdateForPeer(
				envelope.stateVector || new Uint8Array(),
				envelope.sourcePeerId,
			);
		}

		if (envelope.update) {
			Y.applyUpdate(this.doc, envelope.update, {
				type: 'remote',
				peerId: envelope.sourcePeerId,
				namespace: envelope.namespace,
			});
		}

		this.opLog.append(envelope);
		this.emit('synced', {
			namespace: envelope.namespace,
			sourcePeerId: envelope.sourcePeerId,
			opId: envelope.opId,
		});
		return null;
	}

	private createEnvelope(
		type: CrdtSyncEnvelope['type'],
		input: {
			targetPeerId?: string;
			stateVector?: Uint8Array;
			update?: Uint8Array;
			action: NamespaceAction;
		},
	): CrdtSyncEnvelope {
		const envelope: CrdtSyncEnvelope = {
			id: this.idFactory(),
			opId: this.idFactory(),
			type,
			namespace: this.namespace,
			sourcePeerId: this.identity.peerId,
			targetPeerId: input.targetPeerId,
			timestamp: this.now(),
			stateVector: input.stateVector,
			update: input.update,
			capability: `${this.namespace}:${input.action}`,
		};
		if (this.identity.sign) {
			envelope.signature = this.identity.sign(this.bytesForSignature(envelope));
		}
		return envelope;
	}

	private validateEnvelope(envelope: CrdtSyncEnvelope): string | null {
		if (envelope.namespace !== this.namespace) return 'namespace mismatch';
		if (
			envelope.targetPeerId &&
			envelope.targetPeerId !== this.identity.peerId
		) {
			return 'wrong target peer';
		}
		if (
			this.authorizer &&
			!this.authorizer.can(
				envelope.sourcePeerId,
				envelope.namespace,
				'write',
			) &&
			envelope.type !== 'sync:request'
		) {
			return 'missing namespace write capability';
		}
		if (
			envelope.signature &&
			this.identity.verify &&
			!this.identity.verify(
				envelope.signature,
				this.bytesForSignature(envelope),
				envelope.sourcePeerId,
			)
		) {
			return 'invalid signature';
		}
		if (!envelope.signature && this.identity.verify) return 'missing signature';
		return null;
	}

	private bytesForSignature(envelope: CrdtSyncEnvelope): Uint8Array {
		const payload = {
			id: envelope.id,
			opId: envelope.opId,
			type: envelope.type,
			namespace: envelope.namespace,
			sourcePeerId: envelope.sourcePeerId,
			targetPeerId: envelope.targetPeerId,
			timestamp: envelope.timestamp,
			capability: envelope.capability,
			stateVector: envelope.stateVector
				? bytesToStorage(envelope.stateVector)
				: undefined,
			update: envelope.update ? bytesToStorage(envelope.update) : undefined,
		};
		return new TextEncoder().encode(JSON.stringify(payload));
	}

	private requireReady(): void {
		if (!this.ready) {
			throw new Error('CRDT sync layer is not ready. Call load() before sync.');
		}
	}
}

export const createCrdtSyncLayer = (options: CrdtSyncLayerOptions) =>
	new CrdtSyncLayer(options);
