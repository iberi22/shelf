import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createSnapshotManager } from '../src/snapshot';
import { InMemoryStorage } from '../src/storage';
import { createCrdtSyncLayer } from '../src/sync/layer';

describe('SnapshotManager', () => {
	it('should create a snapshot from a Y.Doc', async () => {
		const manager = createSnapshotManager({ now: () => 1000 });
		const doc = new Y.Doc();
		const text = doc.getText('content');
		text.insert(0, 'Hello World');

		const snapshot = await manager.create(doc);

		expect(snapshot.timestamp).toBe(1000);
		expect(snapshot.data).toBeInstanceOf(Uint8Array);
		expect(snapshot.stateVector).toBeInstanceOf(Uint8Array);
		expect(snapshot.id).toBeDefined();
	});

	it('should retrieve a stored snapshot using get()', async () => {
		const manager = createSnapshotManager();
		const doc = new Y.Doc();
		const created = await manager.create(doc);

		const snapshot = await manager.get(created.id);
		expect(snapshot).toBeDefined();
		expect(snapshot?.id).toBe(created.id);

		expect(await manager.get('non-existent')).toBeNull();
	});

	it('should recover state from a snapshot into a fresh Y.Doc', async () => {
		const manager = createSnapshotManager();

		// 1. Create initial state
		const originalDoc = new Y.Doc();
		const array = originalDoc.getArray('list');
		array.push(['item1', 'item2']);

		// 2. Take snapshot
		const snapshot = await manager.create(originalDoc);

		// 3. Modify original further (simulating divergent state)
		array.push(['item3']);

		// 4. Create a new doc and recover from snapshot
		const recoveredDoc = new Y.Doc();
		await manager.recover(recoveredDoc, snapshot);

		// 5. Verify recovered state matches state at snapshot time
		const recoveredArray = recoveredDoc.getArray('list');
		expect(recoveredArray.length).toBe(2);
		expect(recoveredArray.get(0)).toBe('item1');
		expect(recoveredArray.get(1)).toBe('item2');

		// Original doc should still have its further modifications
		expect(array.length).toBe(3);
	});

	it('should persist snapshots to storage if provided', async () => {
		const storage = new InMemoryStorage();
		const manager = createSnapshotManager({ storage });
		const doc = new Y.Doc();
		doc.getMap('meta').set('version', '1.0');

		const snapshot = await manager.create(doc);

		// Create a new manager instance with the same storage
		const manager2 = createSnapshotManager({ storage });
		const retrieved = await manager2.get(snapshot.id);

		expect(retrieved).toBeDefined();
		expect(retrieved?.id).toBe(snapshot.id);

		const doc2 = new Y.Doc();
		await manager2.recover(doc2, retrieved!);
		expect(doc2.getMap('meta').get('version')).toBe('1.0');
	});

	it('should support compact recovery (op-log -> snapshot) in SyncLayer', async () => {
		const syncLayer = createCrdtSyncLayer({
			namespace: 'test',
			identity: { peerId: 'peer1' },
			now: () => 2000
		});
		await syncLayer.load();

		// 1. Add some entries to op-log
		syncLayer.opLog.append({
			id: '1',
			opId: 'op1',
			namespace: 'test',
			sourcePeerId: 'peer2',
			timestamp: 1000,
			type: 'sync:update'
		});
		syncLayer.opLog.append({
			id: '2',
			opId: 'op2',
			namespace: 'test',
			sourcePeerId: 'peer2',
			timestamp: 1500,
			type: 'sync:update'
		});

		expect(syncLayer.opLog.list().length).toBe(2);

		// 2. Persist snapshot (which should trigger compaction)
		await syncLayer.persistSnapshot();

		// 3. Verify op-log is compacted for entries before snapshot timestamp (2000)
		expect(syncLayer.opLog.list().length).toBe(0);
	});
});
