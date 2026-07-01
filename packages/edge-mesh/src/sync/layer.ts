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
	ackTimeout?: number;
	maxRetries?: number;
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
	'operation:failed': (event: {
		envelope: CrdtSyncEnvelope;
		error: Error;
	}) => void;
	send: (envelope: CrdtSyncEnvelope) => void;
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
	private ackTimeout: number;
	private maxRetries: number;
	private pendingOps = new Map<
		string,
		{
			envelope: CrdtSyncEnvelope;
			retries: number;
			timer: ReturnType<typeof setTimeout>;
		}
	>();

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
		this.ackTimeout = options.ackTimeout || 5000;
		this.maxRetries = options.maxRetries || 3;
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

		if (envelope.type === 'sync:ack') {
			this.handleAck(envelope);
			return null;
		}

		const isDuplicate =
			this.dedupe.isDuplicate(envelope.id) || this.opLog.has(envelope.opId);

		if (isDuplicate) {
			// If it's a duplicate update/snapshot, we should still return an ACK
			// to the sender to stop their retries.
			if (
				envelope.type === 'sync:update' ||
				envelope.type === 'sync:snapshot'
			) {
				return this.createAckEnvelope(envelope);
			}
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

		if (envelope.update && envelope.update.length > 0) {
			Y.applyUpdate(this.doc, envelope.update, {
				type: 'remote',
				peerId: envelope.sourcePeerId,
				namespace: envelope.namespace,
			});
		}

		this.opLog.append({
			opId: envelope.opId,
			namespace: envelope.namespace,
			timestamp: envelope.timestamp,
			data: envelope,
		});
		this.emit('synced', {
			namespace: envelope.namespace,
			sourcePeerId: envelope.sourcePeerId,
			opId: envelope.opId,
		});

		if (envelope.type === 'sync:update' || envelope.type === 'sync:snapshot') {
			return this.createAckEnvelope(envelope);
		}

		return null;
	}

	public send(envelope: CrdtSyncEnvelope): void {
		const needsAck =
			(envelope.type === 'sync:update' || envelope.type === 'sync:snapshot') &&
			envelope.targetPeerId;

		if (needsAck && !this.pendingOps.has(envelope.opId)) {
			this.scheduleRetry(envelope, 0);
		}

		this.emit('send', envelope);
	}

	private handleAck(envelope: CrdtSyncEnvelope): void {
		if (!envelope.ackId) return;
		const pending = this.pendingOps.get(envelope.ackId);
		if (pending) {
			clearTimeout(pending.timer);
			this.pendingOps.delete(envelope.ackId);
		}
	}

	private scheduleRetry(envelope: CrdtSyncEnvelope, retries: number): void {
		if (this.pendingOps.has(envelope.opId)) {
			const existing = this.pendingOps.get(envelope.opId);
			if (existing) clearTimeout(existing.timer);
		}

		const timer = setTimeout(() => {
			const pending = this.pendingOps.get(envelope.opId);
			if (!pending) return;

			if (pending.retries < this.maxRetries) {
				const nextRetry = pending.retries + 1;
				this.emit('send', envelope);
				this.scheduleRetry(envelope, nextRetry);
			} else {
				this.pendingOps.delete(envelope.opId);
				this.emit('operation:failed', {
					envelope: pending.envelope,
					error: new Error(
						`Operation timed out after ${this.maxRetries} retries`,
					),
				});
			}
		}, this.ackTimeout * 2 ** retries);

		this.pendingOps.set(envelope.opId, { envelope, retries, timer });
	}

	private createAckEnvelope(envelope: CrdtSyncEnvelope): CrdtSyncEnvelope {
		return this.createEnvelope('sync:ack', {
			targetPeerId: envelope.sourcePeerId,
			ackId: envelope.opId,
			action: 'read', // ACK doesn't need special capability
		});
	}

	private createEnvelope(
		type: CrdtSyncEnvelope['type'],
		input: {
			targetPeerId?: string;
			ackId?: string;
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
			ackId: input.ackId,
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
			envelope.type !== 'sync:request' &&
			envelope.type !== 'sync:ack'
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
			ackId: envelope.ackId,
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
