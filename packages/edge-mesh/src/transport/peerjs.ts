import { type DataConnection, Peer } from 'peerjs';
import type { ITransport } from './types';

export class PeerJSTransport implements ITransport {
	private peer: Peer;
	private connections: Map<string, DataConnection> = new Map();
	private onMessageCb?: (peerId: string, data: Uint8Array) => void;
	private onConnectCb?: (peerId: string) => void;
	private onDisconnectCb?: (peerId: string) => void;

	constructor(peerId?: string, options?: any) {
		this.peer = peerId ? new Peer(peerId, options) : new Peer(options);
		this.peer.on('connection', (conn) => this.handleConnection(conn));
	}

	private handleConnection(conn: DataConnection) {
		conn.on('open', () => {
			this.connections.set(conn.peer, conn);
			this.onConnectCb?.(conn.peer);
		});

		conn.on('data', (data) => {
			if (data instanceof Uint8Array) {
				this.onMessageCb?.(conn.peer, data);
			}
		});

		conn.on('close', () => {
			this.connections.delete(conn.peer);
			this.onDisconnectCb?.(conn.peer);
		});
	}

	public async send(peerId: string, data: Uint8Array): Promise<void> {
		const conn = this.connections.get(peerId);
		if (conn?.open) {
			conn.send(data);
		}
	}

	public async broadcast(data: Uint8Array): Promise<void> {
		for (const conn of this.connections.values()) {
			if (conn.open) {
				conn.send(data);
			}
		}
	}

	public onMessage(callback: (peerId: string, data: Uint8Array) => void): void {
		this.onMessageCb = callback;
	}

	public onConnect(callback: (peerId: string) => void): void {
		this.onConnectCb = callback;
	}

	public onDisconnect(callback: (peerId: string) => void): void {
		this.onDisconnectCb = callback;
	}

	public async connect(peerId: string): Promise<void> {
		if (this.connections.has(peerId)) return;
		const conn = this.peer.connect(peerId);
		this.handleConnection(conn);
	}

	public async disconnect(): Promise<void> {
		for (const conn of this.connections.values()) {
			conn.close();
		}
		this.connections.clear();
		this.peer.destroy();
	}

	public get id(): string {
		return this.peer.id;
	}
}
