import { type DataConnection, Peer } from 'peerjs';
import { BaseTransport } from '../transport';
import type { MeshMessageEnvelope } from '../types';

export interface PeerJSTransportOptions {
	host?: string;
	port?: number;
	path?: string;
	secure?: boolean;
	debug?: number;
}

export class PeerJSTransport extends BaseTransport {
	private peer: Peer | null = null;
	private connections: Map<string, DataConnection> = new Map();
	private options: PeerJSTransportOptions;

	constructor(options: PeerJSTransportOptions = {}) {
		super();
		this.options = options;
	}

	async start(peerId: string): Promise<void> {
		return new Promise((resolve, reject) => {
			this.peer = new Peer(peerId, {
				host: this.options.host,
				port: this.options.port,
				path: this.options.path,
				secure: this.options.secure,
				debug: this.options.debug ?? 1,
			});

			this.peer.on('open', (id) => {
				console.log(`PeerJSTransport opened with ID: ${id}`);
				resolve();
			});

			this.peer.on('connection', (conn) => {
				this.handleConnection(conn);
			});

			this.peer.on('error', (err) => {
				this.emit('error', err);
				reject(err);
			});
		});
	}

	async stop(): Promise<void> {
		for (const conn of this.connections.values()) {
			conn.close();
		}
		this.connections.clear();
		this.peer?.destroy();
		this.peer = null;
	}

	async connect(remotePeerId: string): Promise<void> {
		if (!this.peer || this.connections.has(remotePeerId)) return;
		const conn = this.peer.connect(remotePeerId);
		this.handleConnection(conn);
	}

	async disconnect(remotePeerId: string): Promise<void> {
		const conn = this.connections.get(remotePeerId);
		if (conn) {
			conn.close();
			this.connections.delete(remotePeerId);
		}
	}

	async send(
		targetPeerId: string,
		envelope: MeshMessageEnvelope,
	): Promise<void> {
		const conn = this.connections.get(targetPeerId);
		if (conn?.open) {
			conn.send(envelope);
		} else {
			throw new Error(`Connection to ${targetPeerId} is not open`);
		}
	}

	async broadcast(envelope: MeshMessageEnvelope): Promise<void> {
		for (const conn of this.connections.values()) {
			if (conn.open) {
				conn.send(envelope);
			}
		}
	}

	private handleConnection(conn: DataConnection) {
		conn.on('open', () => {
			this.connections.set(conn.peer, conn);
			this.emit('peer:connected', conn.peer);
		});

		conn.on('data', (data) => {
			this.emit('message', data as MeshMessageEnvelope);
		});

		conn.on('close', () => {
			this.connections.delete(conn.peer);
			this.emit('peer:disconnected', conn.peer);
		});

		conn.on('error', (err) => {
			this.emit('error', err);
		});
	}
}
