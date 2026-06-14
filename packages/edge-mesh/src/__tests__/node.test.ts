import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEdgeMeshNode } from '../core/node';
import { InMemoryStorage } from '../storage';
import { BaseTransport } from '../transport';
import type { MeshMessageEnvelope } from '../types';

class MockTransport extends BaseTransport {
	async start(peerId: string): Promise<void> {
		return;
	}
	async stop(): Promise<void> {
		return;
	}
	async connect(peerId: string): Promise<void> {
		this.emit('peer:connected', peerId);
	}
	async disconnect(peerId: string): Promise<void> {
		this.emit('peer:disconnected', peerId);
	}
	async send(
		targetPeerId: string,
		envelope: MeshMessageEnvelope,
	): Promise<void> {
		return;
	}
	async broadcast(envelope: MeshMessageEnvelope): Promise<void> {
		return;
	}

	// Helper for testing
	simulateIncomingMessage(envelope: MeshMessageEnvelope) {
		this.emit('message', envelope);
	}
}

describe('EdgeMeshNode', () => {
	let transport: MockTransport;
	let storage: InMemoryStorage;
	let node: any;

	beforeEach(() => {
		transport = new MockTransport();
		storage = new InMemoryStorage();
		node = createEdgeMeshNode({
			peerId: 'test-node',
			transport,
			storage,
		});
	});

	it('should have the correct peerId', async () => {
		const n = await node;
		expect(n.peerId).toBe('test-node');
	});

	it('should emit started event when started', async () => {
		const n = await node;
		const startedSpy = vi.fn();
		n.on('started', startedSpy);
		await n.start();
		expect(startedSpy).toHaveBeenCalled();
	});

	it('should handle incoming messages', async () => {
		const n = await node;
		const messageSpy = vi.fn();
		n.on('message', messageSpy);
		await n.start();

		transport.simulateIncomingMessage({
			id: 'msg-1',
			version: '1.0.0',
			sourcePeerId: 'other-peer',
			timestamp: Date.now(),
			type: 'test-type',
			payload: { hello: 'world' },
		});

		expect(messageSpy).toHaveBeenCalledWith({
			type: 'test-type',
			payload: { hello: 'world' },
			sourcePeerId: 'other-peer',
		});
	});

	it('should deduplicate messages', async () => {
		const n = await node;
		const messageSpy = vi.fn();
		n.on('message', messageSpy);
		await n.start();

		const envelope = {
			id: 'duplicate-id',
			version: '1.0.0',
			sourcePeerId: 'other-peer',
			timestamp: Date.now(),
			type: 'test-type',
			payload: { hello: 'world' },
		};

		transport.simulateIncomingMessage(envelope);
		transport.simulateIncomingMessage(envelope);

		expect(messageSpy).toHaveBeenCalledTimes(1);
	});
});
