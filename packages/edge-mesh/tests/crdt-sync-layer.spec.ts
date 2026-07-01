import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { createCrdtSyncLayer, CrdtSyncLayer } from '../src/sync/layer';
import { InMemoryStorage } from '../src/storage';
import { createNamespaceAuthorizer } from '../src/authz/namespace';

const createIdentity = (peerId: string) => ({
	peerId,
	sign: (message: Uint8Array) => message,
	verify: (signature: Uint8Array, message: Uint8Array, sourcePeerId: string) => {
        // Simple verification for testing: signature should match message
		return signature.length === message.length &&
			signature.every((byte, index) => byte === message[index]);
    }
});

describe('CrdtSyncLayer', () => {
    let layerA: CrdtSyncLayer;
    let layerB: CrdtSyncLayer;
    const NS = 'test-ns';

    beforeEach(async () => {
        layerA = createCrdtSyncLayer({
            namespace: NS,
            identity: createIdentity('peer-a'),
        });
        layerB = createCrdtSyncLayer({
            namespace: NS,
            identity: createIdentity('peer-b'),
        });
        await layerA.load();
        await layerB.load();
    });

    it('should initialize correctly', () => {
        expect(layerA.isReady()).toBe(true);
        expect(layerA.namespace).toBe(NS);
    });

    it('should load state from storage on initialization', async () => {
        const storage = new InMemoryStorage();
        const doc = new Y.Doc();
        doc.getMap('data').set('key', 'value');
        const update = Y.encodeStateAsUpdate(doc);

        // Simulating storage format (array of numbers)
        await storage.set(`sync:${NS}:snapshot`, Array.from(update));

        const layer = createCrdtSyncLayer({
            namespace: NS,
            identity: createIdentity('peer-test'),
            storage
        });

        await layer.load();
        expect(layer.doc.getMap('data').get('key')).toBe('value');
    });

    it('should persist snapshot to storage', async () => {
        const storage = new InMemoryStorage();
        const layer = createCrdtSyncLayer({
            namespace: NS,
            identity: createIdentity('peer-test'),
            storage
        });
        await layer.load();

        layer.doc.getMap('data').set('foo', 'bar');
        await layer.persistSnapshot();

        const stored = await storage.get(`sync:${NS}:snapshot`);
        expect(stored).toBeDefined();

        const newDoc = new Y.Doc();
        Y.applyUpdate(newDoc, new Uint8Array(stored as number[]));
        expect(newDoc.getMap('data').get('foo')).toBe('bar');
    });

    it('should handle local changes', () => {
        layerA.applyLocalChange((doc: Y.Doc) => {
            doc.getMap('data').set('a', 1);
        });

        expect(layerA.doc.getMap('data').get('a')).toBe(1);
        
        // applyLocalChange returns a snapshot envelope
        const envelope = layerA.applyLocalChange((doc: Y.Doc) => {
            doc.getMap('data').set('b', 2);
        });
        expect(layerA.doc.getMap('data').get('b')).toBe(2);
        expect(envelope.type).toBe('sync:snapshot');
        // opId is generated but the OpLog only logs received remote ops,
        // not locally produced envelopes. Verify the envelope shape instead.
        expect(envelope.opId).toBeDefined();
        expect(envelope.namespace).toBe(layerA.namespace);
        expect(envelope.sourcePeerId).toBe(layerA.identity.peerId);
    });

    it('should reject envelopes with namespace mismatch', () => {
        const rejected: any[] = [];
        layerA.on('operation:rejected', (e) => rejected.push(e));

        const envelope = layerB.createSyncRequest('peer-a');
        envelope.namespace = 'wrong-ns';

        layerA.applyEnvelope(envelope);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBe('namespace mismatch');
    });

    it('should synchronize two layers through a full handshake', () => {
        // Peer A has some data
        layerA.doc.getMap('data').set('keyA', 'valA');

        // Peer B requests sync from A via send
        const sentFromB: any[] = [];
        layerB.on('send', (env) => sentFromB.push(env));
        
        const request = layerB.createSyncRequest('peer-a');
        expect(request.type).toBe('sync:request');
        expect(request.targetPeerId).toBe('peer-a');

        // Peer A receives request and sends update + its own state vector
        const responseFromA = layerA.applyEnvelope(request);
        expect(responseFromA?.type).toBe('sync:update');
        expect(responseFromA?.update).toBeDefined();

        // Peer B receives update from A
        const ackFromB = layerB.applyEnvelope(responseFromA!);
        expect(ackFromB?.type).toBe('sync:ack');
        expect(layerB.doc.getMap('data').get('keyA')).toBe('valA');

        // Peer A receives ACK
        layerA.applyEnvelope(ackFromB!);
    });

    it('should handle missing data on both sides (mutual sync)', () => {
        layerA.doc.getMap('data').set('a', 1);
        layerB.doc.getMap('data').set('b', 2);

        // B requests sync from A
        const request = layerB.createSyncRequest('peer-a');

        // A applies request, returns update with 'a' and A's state vector
        const updateFromA = layerA.applyEnvelope(request);
        expect(updateFromA?.type).toBe('sync:update');

        // B applies update from A, gets 'a'.
        const sentFromB: any[] = [];
        layerB.on('send', (env) => sentFromB.push(env));
        layerB.applyEnvelope(updateFromA!);

        expect(layerB.doc.getMap('data').get('a')).toBe(1);
        expect(layerB.doc.getMap('data').get('b')).toBe(2);

        // A now creates its own request to sync from B
        const sentFromA: any[] = [];
        layerA.on('send', (env) => sentFromA.push(env));
        
        // A creates snapshot envelope (has all its data including 'a')
        const requestA = layerA.createSyncRequest('peer-b');
        const responseFromB = layerB.applyEnvelope(requestA);
        
        // B's response should contain 'b' data for A
        expect(responseFromB?.type).toBe('sync:update');
        expect(responseFromB?.update).toBeDefined();
        
        // A applies update from B
        layerA.applyEnvelope(responseFromB!);
        expect(layerA.doc.getMap('data').get('b')).toBe(2);
        expect(layerA.doc.getMap('data').get('a')).toBe(1);
    });

    it('should retry sending targeted updates if no ACK is received', () => {
        vi.useFakeTimers();
        const sent: any[] = [];
        const layer = createCrdtSyncLayer({
            namespace: NS,
            identity: createIdentity('peer-a'),
            ackTimeout: 1000,
            maxRetries: 3
        });
        layer.load();
        layer.on('send', (env) => sent.push(env));

        const update = layer.createUpdateForPeer(Y.encodeStateVector(new Y.Doc()), 'peer-b');
        layer.send(update);

        expect(sent).toHaveLength(1);

        // First retry (1000ms)
        vi.advanceTimersByTime(1000);
        expect(sent).toHaveLength(2);

        // Second retry (2000ms)
        vi.advanceTimersByTime(2000);
        expect(sent).toHaveLength(3);

        // Third retry (4000ms)
        vi.advanceTimersByTime(4000);
        expect(sent).toHaveLength(4);

        // After max retries, it should fail
        const failed: any[] = [];
        layer.on('operation:failed', (e) => failed.push(e));
        vi.advanceTimersByTime(8000);
        expect(failed).toHaveLength(1);
        expect(failed[0].envelope.opId).toBe(update.opId);

        vi.useRealTimers();
    });

    it('should stop retrying once ACK is received', () => {
        vi.useFakeTimers();
        const sent: any[] = [];
        const layer = createCrdtSyncLayer({
            namespace: NS,
            identity: createIdentity('peer-a'),
            ackTimeout: 1000
        });
        layer.load();
        layer.on('send', (env) => sent.push(env));

        const update = layer.createUpdateForPeer(Y.encodeStateVector(new Y.Doc()), 'peer-b');
        layer.send(update);
        expect(sent).toHaveLength(1);

        vi.advanceTimersByTime(1000);
        expect(sent).toHaveLength(2);

        // Create ACK envelope manually
        const ack = {
            id: 'ack-id',
            opId: 'ack-op',
            type: 'sync:ack' as const,
            namespace: NS,
            sourcePeerId: 'peer-b',
            targetPeerId: 'peer-a',
            ackId: update.opId,
            timestamp: Date.now(),
            capability: `${NS}:read`,
        };

        layer.applyEnvelope(ack);

        vi.advanceTimersByTime(10000);
        expect(sent).toHaveLength(2); // No more retries

        vi.useRealTimers();
    });

    it('should reject envelopes with invalid signatures', () => {
        const rejected: any[] = [];
        layerA.on('operation:rejected', (e) => rejected.push(e));

        const update = layerB.createUpdateForPeer(layerA.getStateVector(), 'peer-a');
        update.signature = new Uint8Array([1, 2, 3]); // Invalid signature

        layerA.applyEnvelope(update);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBe('invalid signature');
        expect(layerA.doc.getMap('data').has('b')).toBe(false);
    });

    it('should reject envelopes without signature if identity requires it', () => {
        const rejected: any[] = [];
        layerA.on('operation:rejected', (e) => rejected.push(e));

        const update = layerB.createUpdateForPeer(layerA.getStateVector(), 'peer-a');
        // Delete the signature to simulate missing signature
        const unsigned = { ...update, signature: undefined } as any;
        delete unsigned.signature;

        layerA.applyEnvelope(unsigned);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBe('missing signature');
    });

    it('should reject envelopes from unauthorized peers', () => {
        const authorizer = createNamespaceAuthorizer({
            authorityPeerId: 'peer-a',
            grants: [] // No grants for peer-b
        });

        const securedLayerA = createCrdtSyncLayer({
            namespace: NS,
            identity: createIdentity('peer-a'),
            authorizer
        });
        securedLayerA.load();

        const rejected: any[] = [];
        securedLayerA.on('operation:rejected', (e) => rejected.push(e));

        const update = layerB.createUpdateForPeer(securedLayerA.getStateVector(), 'peer-a');

        securedLayerA.applyEnvelope(update);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBe('missing namespace write capability');
    });

    it('should accept envelopes if authorizer grants write permission', () => {
        const authorizer = createNamespaceAuthorizer({
            authorityPeerId: 'peer-a',
            grants: [{ subject: 'peer-b', namespace: NS, action: 'write' }]
        });

        const securedLayerA = createCrdtSyncLayer({
            namespace: NS,
            identity: createIdentity('peer-a'),
            authorizer
        });
        securedLayerA.load();

        const rejected: any[] = [];
        securedLayerA.on('operation:rejected', (e) => rejected.push(e));

        layerB.doc.getMap('data').set('b', 100);
        const update = layerB.createUpdateForPeer(securedLayerA.getStateVector(), 'peer-a');

        securedLayerA.applyEnvelope(update);
        expect(rejected).toHaveLength(0);
        expect(securedLayerA.doc.getMap('data').get('b')).toBe(100);
    });
});
