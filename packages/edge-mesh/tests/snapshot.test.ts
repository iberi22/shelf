import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createSnapshotManager } from '../src/snapshot';

describe('SnapshotManager', () => {
	it('should create a snapshot from a Y.Doc', () => {
		const manager = createSnapshotManager({ now: () => 1000 });
		const doc = new Y.Doc();
		const text = doc.getText('content');
		text.insert(0, 'Hello World');

		const snapshot = manager.create('test-ns', doc);

		expect(snapshot.namespace).toBe('test-ns');
		expect(snapshot.createdAt).toBe(1000);
		expect(snapshot.update).toBeInstanceOf(Uint8Array);
		expect(snapshot.stateVector).toBeInstanceOf(Uint8Array);
	});

	it('should retrieve a stored snapshot using get()', () => {
		const manager = createSnapshotManager();
		const doc = new Y.Doc();
		manager.create('test-ns', doc);

		const snapshot = manager.get('test-ns');
		expect(snapshot).toBeDefined();
		expect(snapshot?.namespace).toBe('test-ns');

		expect(manager.get('non-existent')).toBeUndefined();
	});

	it('should apply a snapshot update to a Y.Doc', () => {
		const manager = createSnapshotManager();
		const sourceDoc = new Y.Doc();
		sourceDoc.getMap('data').set('key', 'value');
		const snapshot = manager.create('test-ns', sourceDoc);

		const targetDoc = new Y.Doc();
		manager.apply(targetDoc, snapshot);

		expect(targetDoc.getMap('data').get('key')).toBe('value');
	});

	it('should recover state from a snapshot into a fresh Y.Doc', () => {
		const manager = createSnapshotManager();

		// 1. Create initial state
		const originalDoc = new Y.Doc();
		const array = originalDoc.getArray('list');
		array.push(['item1', 'item2']);

		// 2. Take snapshot
		const snapshot = manager.create('app-state', originalDoc);

		// 3. Modify original further (simulating divergent state)
		array.push(['item3']);

		// 4. Create a new doc and recover from snapshot
		const recoveredDoc = new Y.Doc();
		manager.apply(recoveredDoc, snapshot);

		// 5. Verify recovered state matches state at snapshot time
		const recoveredArray = recoveredDoc.getArray('list');
		expect(recoveredArray.length).toBe(2);
		expect(recoveredArray.get(0)).toBe('item1');
		expect(recoveredArray.get(1)).toBe('item2');

		// Original doc should still have its further modifications
		expect(array.length).toBe(3);
	});
});
