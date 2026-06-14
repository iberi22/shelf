import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { SyncEngine } from '../src/sync/engine';

describe('SyncEngine', () => {
	it('should synchronize state between two engines', () => {
		const engine1 = new SyncEngine();
		const engine2 = new SyncEngine();

		const map1 = engine1.doc.getMap('test');
		map1.set('key', 'value');

		const update = engine1.getUpdate();
		engine2.applyUpdate(update);

		const map2 = engine2.doc.getMap('test');
		expect(map2.get('key')).toBe('value');
	});

	it('should support diff synchronization using state vectors', () => {
		const engine1 = new SyncEngine();
		const engine2 = new SyncEngine();

		const map1 = engine1.doc.getMap('test');
		map1.set('a', 1);

		// Initial sync
		engine2.applyUpdate(engine1.getUpdate());

		// Update engine1
		map1.set('b', 2);

		// Sync only the difference
		const sv2 = engine2.getStateVector();
		const diff = engine1.getDiff(sv2);
		engine2.applyUpdate(diff);

		const map2 = engine2.doc.getMap('test');
		expect(map2.get('a')).toBe(1);
		expect(map2.get('b')).toBe(2);
	});
});
