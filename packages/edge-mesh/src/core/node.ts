import { EventEmitter } from 'events';
import { MessageDeduplicator, createEnvelope } from '../protocol';
import type {
	EdgeMeshNode,
	EdgeMeshNodeEvents,
	MeshStorage,
	MeshTransport,
} from '../types';

export interface NodeOptions {
	peerId: string;
	transport: MeshTransport;
	storage: MeshStorage;
}

export class DefaultEdgeMeshNode extends EventEmitter implements EdgeMeshNode {
	public readonly peerId: string;
	private transport: MeshTransport;
	private storage: MeshStorage;
	private deduplicator: MessageDeduplicator;
	private started = false;

	constructor(options: NodeOptions) {
		super();
		this.peerId = options.peerId;
		this.transport = options.transport;
		this.storage = options.storage;
		this.deduplicator = new MessageDeduplicator();

		this.setupTransportListeners();
	}

	private setupTransportListeners() {
		this.transport.on('message', (envelope) => {
			if (this.deduplicator.isDuplicate(envelope.id)) {
				return;
			}

			// If it's a broadcast or targeted at us
			if (!envelope.targetPeerId || envelope.targetPeerId === this.peerId) {
				this.emit('message', {
					type: envelope.type,
					payload: envelope.payload,
					sourcePeerId: envelope.sourcePeerId,
				});
			}
		});

		this.transport.on('peer:connected', (peerId) => {
			this.emit('peer:connected', peerId);
		});

		this.transport.on('peer:disconnected', (peerId) => {
			this.emit('peer:disconnected', peerId);
		});

		this.transport.on('error', (error) => {
			this.emit('error', error);
		});
	}

	async start(): Promise<void> {
		if (this.started) return;
		await this.transport.start(this.peerId);
		this.started = true;
		this.emit('started');
	}

	async stop(): Promise<void> {
		if (!this.started) return;
		await this.transport.stop();
		this.started = false;
		this.emit('stopped');
	}

	async connect(remotePeerId: string): Promise<void> {
		await this.transport.connect(remotePeerId);
	}

	async broadcast(message: { type: string; payload: any }): Promise<void> {
		const envelope = createEnvelope(this.peerId, message.type, message.payload);
		await this.transport.broadcast(envelope);
	}

	async send(
		targetPeerId: string,
		message: { type: string; payload: any },
	): Promise<void> {
		const envelope = createEnvelope(
			this.peerId,
			message.type,
			message.payload,
			targetPeerId,
		);
		await this.transport.send(targetPeerId, envelope);
	}

	on<K extends keyof EdgeMeshNodeEvents>(
		event: K,
		listener: EdgeMeshNodeEvents[K],
	): this {
		return super.on(event, listener);
	}

	off<K extends keyof EdgeMeshNodeEvents>(
		event: K,
		listener: EdgeMeshNodeEvents[K],
	): this {
		return super.off(event, listener);
	}
}

export async function createEdgeMeshNode(
	options: NodeOptions,
): Promise<EdgeMeshNode> {
	return new DefaultEdgeMeshNode(options);
}
