import type * as Y from 'yjs';
import { AuthzManager } from '../authz';
import { IdentityManager } from '../identity';
import { StorageManager } from '../storage';
import { SyncEngine } from '../sync/engine';
import { PeerJSTransport } from '../transport/peerjs';

export class ShelfEdgeMeshAdapter {
	public sync: SyncEngine;
	public transport: PeerJSTransport;
	public identity: IdentityManager;
	public storage: StorageManager;
	public authz: AuthzManager;

	constructor(peerId?: string, peerOptions?: any) {
		this.sync = new SyncEngine();
		this.transport = new PeerJSTransport(peerId, peerOptions);
		this.identity = new IdentityManager();
		this.storage = new StorageManager('shelf-edge-mesh-db');
		this.authz = new AuthzManager();

		this.setupSync();
	}

	private setupSync() {
		// Sync CRDT updates over transport
		this.sync.doc.on('update', (update, origin) => {
			if (origin === 'local') {
				this.transport.broadcast(update);
				this.storage.saveUpdate(update);
			}
		});

		this.transport.onMessage((peerId, data) => {
			// Heuristic to distinguish between a state vector and an update
			// In a more robust protocol, we would use message envelopes with types
			if (data.length > 0 && data[0] === 0) {
				// Likely a state vector (Yjs state vectors usually start with 0)
				const diff = this.sync.getDiff(data);
				if (diff.length > 0) {
					this.transport.send(peerId, diff);
				}
			} else {
				// Likely a document update
				this.sync.applyUpdate(data, peerId);
				this.storage.saveUpdate(data);
			}
		});

		this.transport.onConnect((peerId) => {
			// Exchange state vectors for efficient sync on connect
			const sv = this.sync.getStateVector();
			this.transport.send(peerId, sv);
		});
	}

	public async init() {
		await this.storage.loadIntoDoc(this.sync.doc);
	}

	// Map legacy AppState collections to Y.Doc
	public getCollection(name: string): Y.Map<any> {
		return this.sync.doc.getMap(name);
	}
}
