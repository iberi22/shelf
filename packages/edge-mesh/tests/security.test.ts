import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { CrdtSyncLayer } from '../src/sync/layer';
import { createNamespaceAuthorizer } from '../src/authz/namespace';
import { createGovernanceManager } from '../src/governance/index';
import { IdentityManager } from '../src/identity/index';
import { CrdtSyncEnvelope } from '../src/types';

describe('EdgeMesh Security', () => {
	it('Test 1: Peer without canEditProducts capability tries to write to products namespace → REJECTED', async () => {
		const authorizer = createNamespaceAuthorizer({
			authorityPeerId: 'authority-node',
			grants: [], // No grants for anyone
		});

		const layer = new CrdtSyncLayer({
			namespace: 'products',
			identity: { peerId: 'local-node' },
			authorizer,
		});

		await layer.load();

		const rejectedSpy = vi.fn();
		layer.on('operation:rejected', rejectedSpy);

		const maliciousEnvelope: CrdtSyncEnvelope = {
			id: 'msg-1',
			opId: 'op-1',
			type: 'sync:update',
			namespace: 'products',
			sourcePeerId: 'attacker-peer',
			timestamp: Date.now(),
			update: new Uint8Array([1, 2, 3]),
		};

		const result = layer.applyEnvelope(maliciousEnvelope);

		expect(result).toBeNull();
		expect(rejectedSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				reason: 'missing namespace write capability',
				envelope: maliciousEnvelope,
			}),
		);
	});

	it('Test 2: Collaborator tries to elevate own role to admin → REJECTED', () => {
		const governance = createGovernanceManager();

		expect(() => {
			governance.createProposal({
				targetPeerId: 'collaborator-peer',
				proposedRole: 'admin',
				createdBy: 'collaborator-peer',
			});
		}).toThrow('A peer cannot promote itself without governance');
	});

	it('Test 3: Peer with valid capability writes successfully to permitted namespace', async () => {
		const trustedPeerId = 'trusted-peer';
		const authorizer = createNamespaceAuthorizer({
			authorityPeerId: 'authority-node',
			grants: [
				{
					subject: trustedPeerId,
					namespace: 'products',
					action: 'write',
				},
			],
		});

		const layer = new CrdtSyncLayer({
			namespace: 'products',
			identity: { peerId: 'local-node' },
			authorizer,
		});

		await layer.load();

		const syncedSpy = vi.fn();
		layer.on('synced', syncedSpy);
		layer.on('operation:rejected', (e) => {
			throw new Error(`Should not be rejected: ${e.reason}`);
		});

		// Create a valid Yjs update
		const doc = new Y.Doc();
		const map = doc.getMap('products');
		map.set('item1', 'value1');
		const update = Y.encodeStateAsUpdate(doc);

		const validEnvelope: CrdtSyncEnvelope = {
			id: 'msg-2',
			opId: 'op-2',
			type: 'sync:update',
			namespace: 'products',
			sourcePeerId: trustedPeerId,
			timestamp: Date.now(),
			update,
		};

		layer.applyEnvelope(validEnvelope);

		expect(syncedSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				sourcePeerId: trustedPeerId,
				opId: 'op-2',
			}),
		);

		const localMap = layer.doc.getMap('products');
		expect(localMap.get('item1')).toBe('value1');
	});

	it('Test 4: Verify envelope signature validation rejects tampered operations', async () => {
		const aliceIdentity = new IdentityManager();
		const alicePeerId = 'alice';
		const alicePubKeys = aliceIdentity.getPublicKeys();

		const layer = new CrdtSyncLayer({
			namespace: 'products',
			identity: {
				peerId: 'local-node',
				verify: (sig, msg, peerId) => {
					if (peerId === alicePeerId) {
						return aliceIdentity.verify(sig, msg, alicePubKeys.dsa);
					}
					return false;
				},
			},
			// Skip authorizer for this test to focus on signature
		});

		await layer.load();

		const aliceLayer = new CrdtSyncLayer({
			namespace: 'products',
			identity: {
				peerId: alicePeerId,
				sign: (msg) => aliceIdentity.sign(msg),
			},
		});
		await aliceLayer.load();

		const signedEnvelope = aliceLayer.createUpdateForPeer(
			Y.encodeStateVector(new Y.Doc()),
			'local-node',
		);

		const rejectedSpy = vi.fn();
		layer.on('operation:rejected', rejectedSpy);

		// Tamper with the envelope
		const tamperedEnvelope = {
			...signedEnvelope,
			timestamp: signedEnvelope.timestamp + 1,
		};

		layer.applyEnvelope(tamperedEnvelope);

		expect(rejectedSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				reason: 'invalid signature',
			}),
		);
	});
});
