import * as Y from 'yjs';
import {
	type CrdtAdapter,
	type EdgeMeshConfig,
	type Transport,
	isEdgeMeshRemoteOrigin,
} from './types';

export class YjsAdapter implements CrdtAdapter {
	public doc: Y.Doc;

	constructor(doc?: Y.Doc) {
		this.doc = doc || new Y.Doc();
	}

	applyUpdate(update: Uint8Array, origin?: any): void {
		Y.applyUpdate(this.doc, update, origin);
	}

	getUpdate(): Uint8Array {
		return Y.encodeStateAsUpdate(this.doc);
	}

	getStateVector(): Uint8Array {
		return Y.encodeStateVector(this.doc);
	}

	getDiff(remoteStateVector: Uint8Array): Uint8Array {
		return Y.encodeStateAsUpdate(this.doc, remoteStateVector);
	}

	onChange(callback: (update: Uint8Array, origin: any) => void): void {
		this.doc.on('update', callback);
	}
}

export class EdgeMesh {
	private transport: Transport;
	private localPeerId: string;
	private namespaces: Map<string, YjsAdapter> = new Map();

	constructor(config: EdgeMeshConfig) {
		this.transport = config.transport;
		this.localPeerId = config.localPeerId;

		this.transport.onMessage((from, data) => {
			this.handleMessage(from, data);
		});

		this.transport.onPeerConnect((peerId) => {
			// Sync all namespaces on connect
			for (const [name, adapter] of this.namespaces) {
				this.syncNamespace(peerId, name, adapter);
			}
		});
	}

	public getNamespace(name: string): YjsAdapter {
		let adapter = this.namespaces.get(name);
		if (!adapter) {
			adapter = new YjsAdapter();
			this.namespaces.set(name, adapter);

			adapter.onChange((update, origin) => {
				if (!isEdgeMeshRemoteOrigin(origin)) {
					this.broadcastUpdate(name, update);
				}
			});
		}
		return adapter;
	}

	private broadcastUpdate(namespace: string, update: Uint8Array) {
		const message = this.encodeMessage(namespace, update);
		this.transport.broadcast(message);
	}

	private syncNamespace(
		peerId: string,
		namespace: string,
		adapter: YjsAdapter,
	) {
		const update = adapter.getUpdate();
		const message = this.encodeMessage(namespace, update);
		this.transport.send(peerId, message);
	}

	private handleMessage(from: string, data: Uint8Array) {
		try {
			const { namespace, update } = this.decodeMessage(data);
			const adapter = this.namespaces.get(namespace);
			if (adapter) {
				adapter.applyUpdate(update, { type: 'remote', peerId: from });
			}
		} catch (e) {
			console.error('Failed to handle EdgeMesh message', e);
		}
	}

	private encodeMessage(namespace: string, update: Uint8Array): Uint8Array {
		const nsBytes = new TextEncoder().encode(namespace);
		const nsLength = nsBytes.length;
		const message = new Uint8Array(1 + nsLength + update.length);
		message[0] = nsLength;
		message.set(nsBytes, 1);
		message.set(update, 1 + nsLength);
		return message;
	}

	private decodeMessage(data: Uint8Array): {
		namespace: string;
		update: Uint8Array;
	} {
		const nsLength = data[0];
		const namespace = new TextDecoder().decode(data.slice(1, 1 + nsLength));
		const update = data.slice(1 + nsLength);
		return { namespace, update };
	}
}
