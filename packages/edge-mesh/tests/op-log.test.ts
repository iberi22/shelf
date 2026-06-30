import { describe, it, expect } from 'vitest';
import { createOpLog } from '../src/op-log';
import type { CrdtSyncEnvelope } from '../src/types';

describe('OpLog', () => {
	const createEnvelope = (overrides: Partial<CrdtSyncEnvelope> = {}): CrdtSyncEnvelope => ({
		id: 'msg-1',
		opId: 'op-1',
		type: 'sync:update',
		namespace: 'test-ns',
		sourcePeerId: 'peer-1',
		timestamp: Date.now(),
		...overrides,
	});

	it('should append a new entry and return it', () => {
		const opLog = createOpLog();
		const envelope = createEnvelope();
		const entry = opLog.append(envelope);

		expect(entry).toBeDefined();
		expect(entry?.opId).toBe(envelope.opId);
		expect(opLog.has(envelope.opId)).toBe(true);
	});

	it('should return null when appending a duplicate opId', () => {
		const opLog = createOpLog();
		const envelope = createEnvelope();
		opLog.append(envelope);

		const duplicateEntry = opLog.append(envelope);
		expect(duplicateEntry).toBeNull();
	});

	it('should verify if an opId exists using has()', () => {
		const opLog = createOpLog();
		const envelope = createEnvelope({ opId: 'op-exists' });

		expect(opLog.has('op-exists')).toBe(false);
		opLog.append(envelope);
		expect(opLog.has('op-exists')).toBe(true);
	});

	it('should list all entries sorted by timestamp ascending', () => {
		const opLog = createOpLog();
		opLog.append(createEnvelope({ opId: 'op-2', timestamp: 200 }));
		opLog.append(createEnvelope({ opId: 'op-1', timestamp: 100 }));
		opLog.append(createEnvelope({ opId: 'op-3', timestamp: 300 }));

		const list = opLog.list();
		expect(list).toHaveLength(3);
		expect(list[0].opId).toBe('op-1');
		expect(list[1].opId).toBe('op-2');
		expect(list[2].opId).toBe('op-3');
	});

	it('should filter entries by namespace when listing', () => {
		const opLog = createOpLog();
		opLog.append(createEnvelope({ opId: 'op-1', namespace: 'ns-1' }));
		opLog.append(createEnvelope({ opId: 'op-2', namespace: 'ns-2' }));
		opLog.append(createEnvelope({ opId: 'op-3', namespace: 'ns-1' }));

		const listNs1 = opLog.list('ns-1');
		expect(listNs1).toHaveLength(2);
		expect(listNs1.every(e => e.namespace === 'ns-1')).toBe(true);

		const listNs2 = opLog.list('ns-2');
		expect(listNs2).toHaveLength(1);
		expect(listNs2[0].namespace).toBe('ns-2');
	});

	it('should compact entries before a given timestamp', () => {
		const opLog = createOpLog();
		opLog.append(createEnvelope({ opId: 'op-1', timestamp: 100 }));
		opLog.append(createEnvelope({ opId: 'op-2', timestamp: 200 }));
		opLog.append(createEnvelope({ opId: 'op-3', timestamp: 300 }));

		const removedCount = opLog.compactBefore(250);
		expect(removedCount).toBe(2);

		expect(opLog.has('op-1')).toBe(false);
		expect(opLog.has('op-2')).toBe(false);
		expect(opLog.has('op-3')).toBe(true);

		const list = opLog.list();
		expect(list).toHaveLength(1);
		expect(list[0].opId).toBe('op-3');
	});
});
