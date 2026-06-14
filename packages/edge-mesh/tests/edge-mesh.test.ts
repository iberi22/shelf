import { describe, expect, it } from 'vitest';
import { EdgeMesh } from '../src/edge-mesh';
import type { Transport } from '../src/types';

class MemoryTransport implements Transport {
	private peerId: string;
	private peers = new Map<string, MemoryTransport>();
	private messageCallback?: (from: string, data: Uint8Array) => void;
	private connectCallback?: (peerId: string) => void;
	private disconnectCallback?: (peerId: string) => void;

	constructor(peerId: string) {
		this.peerId = peerId;
	}

	link(peer: MemoryTransport) {
		this.peers.set(peer.peerId, peer);
		this.connectCallback?.(peer.peerId);
	}

	send(to: string, data: Uint8Array): void {
		this.peers.get(to)?.messageCallback?.(this.peerId, data);
	}

	broadcast(data: Uint8Array): void {
		for (const peer of this.peers.values()) {
			peer.messageCallback?.(this.peerId, data);
		}
	}

	onMessage(callback: (from: string, data: Uint8Array) => void): void {
		this.messageCallback = callback;
	}

	onPeerConnect(callback: (peerId: string) => void): void {
		this.connectCallback = callback;
	}

	onPeerDisconnect(callback: (peerId: string) => void): void {
		this.disconnectCallback = callback;
	}

	disconnect(peerId: string) {
		this.peers.delete(peerId);
		this.disconnectCallback?.(peerId);
	}
}

describe('EdgeMesh', () => {
	it('replicates Yjs updates between peers by namespace', () => {
		const transportA = new MemoryTransport('node-a');
		const transportB = new MemoryTransport('node-b');
		const meshA = new EdgeMesh({
			localPeerId: 'node-a',
			transport: transportA,
		});
		const meshB = new EdgeMesh({
			localPeerId: 'node-b',
			transport: transportB,
		});

		meshA.getNamespace('shelf');
		meshB.getNamespace('shelf');
		transportA.link(transportB);
		transportB.link(transportA);

		const productsA = meshA.getNamespace('shelf').doc.getMap('products');
		productsA.set('sku-1', { id: 'sku-1', name: 'Coffee' });

		const productsB = meshB.getNamespace('shelf').doc.getMap('products');
		expect(productsB.get('sku-1')).toEqual({ id: 'sku-1', name: 'Coffee' });
	});
});
