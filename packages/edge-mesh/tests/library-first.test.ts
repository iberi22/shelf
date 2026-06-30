import * as Y from 'yjs';
import { describe, expect, it, vi } from 'vitest';
import {
	InMemoryStorage,
	createCrdtSyncLayer,
	createGovernanceManager,
	createNamespaceAuthorizer,
	createNamespacePartitionManager,
	createPeerHealthMonitor,
	createPresenceTimeline,
	getReconnectDelay,
} from '../src';

const identity = (peerId: string) => ({
	peerId,
	sign: (message: Uint8Array) => message,
	verify: (signature: Uint8Array, message: Uint8Array) =>
		signature.length === message.length &&
		signature.every((byte, index) => byte === message[index]),
});

describe('library-first edge mesh APIs', () => {
	it('requires the CRDT sync layer to load before applying updates', async () => {
		const layer = createCrdtSyncLayer({
			namespace: 'shelf',
			identity: identity('node-a'),
			storage: new InMemoryStorage(),
		});

		expect(() => layer.createSyncRequest()).toThrow(/not ready/i);
		await layer.load();
		expect(layer.isReady()).toBe(true);
		expect(layer.createSyncRequest().stateVector).toBeInstanceOf(Uint8Array);
	});

	it('syncs by state vector and rejects unauthorized namespace writes', async () => {
		const authorizer = createNamespaceAuthorizer({
			authorityPeerId: 'node-a',
			grants: [{ subject: 'node-b', namespace: 'shelf', action: 'write' }],
		});
		const nodeA = createCrdtSyncLayer({
			namespace: 'shelf',
			identity: identity('node-a'),
			authorizer,
		});
		const nodeB = createCrdtSyncLayer({
			namespace: 'shelf',
			identity: identity('node-b'),
			authorizer,
		});
		const nodeC = createCrdtSyncLayer({
			namespace: 'shelf',
			identity: identity('node-c'),
			authorizer,
		});
		await Promise.all([nodeA.load(), nodeB.load(), nodeC.load()]);

		nodeA.applyLocalChange((doc) => {
			doc.getMap('products').set('sku-1', { id: 'sku-1', name: 'Coffee' });
		});
		const request = nodeB.createSyncRequest('node-a');
		const response = nodeA.applyEnvelope(request);
		expect(response).not.toBeNull();
		if (!response) {
			throw new Error('Expected sync response');
		}
		nodeB.applyEnvelope(response);
		expect(nodeB.doc.getMap('products').get('sku-1')).toEqual({
			id: 'sku-1',
			name: 'Coffee',
		});

		const rejected: string[] = [];
		nodeA.on('operation:rejected', ({ reason }) => rejected.push(reason));
		const malicious = nodeC.applyLocalChange((doc) => {
			doc.getMap('products').set('sku-2', { id: 'sku-2', name: 'Tea' });
		});
		nodeA.applyEnvelope(malicious);
		expect(rejected).toContain('missing namespace write capability');
		expect(nodeA.doc.getMap('products').get('sku-2')).toBeUndefined();
	});

	it('resolves admin governance with active unanimous votes', () => {
		const governance = createGovernanceManager({
			now: () => 1000,
			activePeerIds: () => ['node-a', 'node-b'],
		});
		const proposal = governance.createProposal({
			targetPeerId: 'node-c',
			proposedRole: 'admin',
			createdBy: 'node-a',
		});

		expect(() =>
			governance.createProposal({
				targetPeerId: 'node-a',
				proposedRole: 'admin',
				createdBy: 'node-a',
			}),
		).toThrow(/cannot promote itself/i);

		expect(governance.vote(proposal.id, 'node-a', 'approve').status).toBe(
			'active',
		);
		expect(governance.vote(proposal.id, 'node-b', 'approve').status).toBe(
			'approved',
		);
	});

	it('records presence timeline and proposes deterministic failover', () => {
		let now = 1000;
		const timeline = createPresenceTimeline({ now: () => now });
		timeline.record('host', 'verified');
		now = 1500;
		timeline.record('node-b', 'verified');
		now = 2000;
		timeline.record('node-c', 'connected');
		now = 10_000;
		timeline.record('host', 'offline');

		const candidate = timeline.proposeFailover({
			authorityPeerId: 'host',
			staleAfterMs: 1000,
			verifiedOnly: true,
		});

		expect(candidate?.peerId).toBe('node-b');
		expect(timeline.getEvents('host').map((event) => event.status)).toEqual([
			'verified',
			'offline',
		]);
	});

	it('creates branch and warehouse scoped namespaces without Shelf-specific logic', () => {
		const partitions = createNamespacePartitionManager();
		partitions.upsert({
			id: 'branch-north',
			namespace: 'shelf',
			label: 'Sucursal Norte',
			kind: 'branch',
		});
		partitions.upsert({
			id: 'warehouse-main',
			namespace: 'shelf',
			label: 'Bodega Central',
			kind: 'warehouse',
		});

		expect(partitions.list('shelf')).toHaveLength(2);
		expect(partitions.resolveScopedNamespace('shelf', 'branch-north')).toBe(
			'shelf/branch-north',
		);
	});

	it('computes capped reconnect backoff and emits generic peer health events', () => {
		expect(getReconnectDelay(0)).toBe(1000);
		expect(getReconnectDelay(3)).toBe(8000);
		expect(getReconnectDelay(20)).toBe(30000);

		let now = 1000;
		const health = createPeerHealthMonitor({
			now: () => now,
			staleAfterMs: 5000,
			offlineAfterMs: 10000,
		});
		const events: string[] = [];
		health.on('peer:healthy', ({ peerId }) => events.push(`healthy:${peerId}`));
		health.on('peer:stale', ({ peerId }) => events.push(`stale:${peerId}`));
		health.on('peer:offline', ({ peerId }) => events.push(`offline:${peerId}`));

		health.markConnected('node-b');
		now = 7000;
		health.sweep();
		now = 12000;
		health.sweep();

		expect(events).toEqual([
			'healthy:node-b',
			'stale:node-b',
			'offline:node-b',
		]);
		expect(health.get('node-b')?.status).toBe('offline');
	});

	it('requires namespace gc capability for generic cleanup authority', () => {
		const authorizer = createNamespaceAuthorizer({
			authorityPeerId: 'host',
			grants: [
				{ subject: 'node-b', namespace: 'shelf/auditLogs', action: 'read' },
			],
		});

		expect(authorizer.can('node-b', 'shelf/auditLogs', 'gc')).toBe(false);
		expect(() => authorizer.require('node-b', 'shelf/auditLogs', 'gc')).toThrow(
			/Missing capability/,
		);

		authorizer.grant({
			subject: 'node-b',
			namespace: 'shelf/auditLogs',
			action: 'gc',
		});
		expect(authorizer.can('node-b', 'shelf/auditLogs', 'gc')).toBe(true);
	});

	it('implements formal ack/retry for reliable delivery', async () => {
		vi.useFakeTimers();
		const nodeA = createCrdtSyncLayer({
			namespace: 'shelf',
			identity: identity('node-a'),
			ackTimeout: 100,
			maxRetries: 2,
		});
		const nodeB = createCrdtSyncLayer({
			namespace: 'shelf',
			identity: identity('node-b'),
		});
		await Promise.all([nodeA.load(), nodeB.load()]);

		const sent: any[] = [];
		nodeA.on('send', (envelope) => sent.push(envelope));

		// node-a applies local change and generates update for node-b
		nodeA.applyLocalChange((doc) => {
			doc.getMap('products').set('sku-ack', { id: 'sku-ack', name: 'Ack' });
		});
		const update = nodeA.createUpdateForPeer(Y.encodeStateVector(new Y.Doc()), 'node-b');
		nodeA.send(update);

		expect(sent).toHaveLength(1);
		expect(sent[0].type).toBe('sync:update');

		// 1st retry
		vi.advanceTimersByTime(100);
		expect(sent).toHaveLength(2);
		expect(sent[1].opId).toBe(update.opId);

		// 2nd retry
		vi.advanceTimersByTime(200);
		expect(sent).toHaveLength(3);

		// Fail after max retries
		const failed: any[] = [];
		nodeA.on('operation:failed', (e) => failed.push(e));
		vi.advanceTimersByTime(400);
		expect(failed).toHaveLength(1);
		expect(failed[0].envelope.opId).toBe(update.opId);
		expect(failed[0].error.message).toMatch(/timed out after 2 retries/i);

		// Verify success with ACK
		sent.length = 0;
		const update2 = nodeA.createUpdateForPeer(Y.encodeStateVector(new Y.Doc()), 'node-b');
		nodeA.send(update2);
		expect(sent).toHaveLength(1);

		const ack = nodeB.applyEnvelope(update2);
		expect(ack?.type).toBe('sync:ack');
		expect(ack?.ackId).toBe(update2.opId);

		nodeA.applyEnvelope(ack!);
		vi.advanceTimersByTime(1000);
		expect(sent).toHaveLength(1); // No more retries

		vi.useRealTimers();
	});
});
