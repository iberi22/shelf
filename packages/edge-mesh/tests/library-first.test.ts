import { describe, expect, it } from 'vitest';
import {
	InMemoryStorage,
	createCrdtSyncLayer,
	createGovernanceManager,
	createNamespaceAuthorizer,
	createNamespacePartitionManager,
	createPresenceTimeline,
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
});
