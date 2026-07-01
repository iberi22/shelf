import { describe, it, expect } from 'vitest';
import { createOpLog } from '../src/op-log';

describe('OpLog', () => {
	it('should append a new entry and return true', () => {
		const opLog = createOpLog();
		const entry = {
			opId: 'op-1',
			namespace: 'test-ns',
			timestamp: Date.now(),
			data: { foo: 'bar' },
		};
		const result = opLog.append(entry);

		expect(result).toBe(true);
		expect(opLog.has('op-1')).toBe(true);
	});

	it('should return false when appending a duplicate opId', () => {
		const opLog = createOpLog();
		const entry = {
			opId: 'op-1',
			namespace: 'test-ns',
			timestamp: Date.now(),
			data: { foo: 'bar' },
		};
		opLog.append(entry);

		const duplicateResult = opLog.append(entry);
		expect(duplicateResult).toBe(false);
	});

	it('should get all entries sorted by timestamp ascending', () => {
		const opLog = createOpLog();
		opLog.append({ opId: 'op-2', namespace: 'ns', timestamp: 200, data: {} });
		opLog.append({ opId: 'op-1', namespace: 'ns', timestamp: 100, data: {} });
		opLog.append({ opId: 'op-3', namespace: 'ns', timestamp: 300, data: {} });

		const entries = opLog.getEntries();
		expect(entries).toHaveLength(3);
		expect(entries[0].opId).toBe('op-1');
		expect(entries[1].opId).toBe('op-2');
		expect(entries[2].opId).toBe('op-3');
	});

	it('should filter entries by namespace', () => {
		const opLog = createOpLog();
		opLog.append({ opId: 'op-1', namespace: 'ns-1', timestamp: 100, data: {} });
		opLog.append({ opId: 'op-2', namespace: 'ns-2', timestamp: 200, data: {} });
		opLog.append({ opId: 'op-3', namespace: 'ns-1', timestamp: 300, data: {} });

		const ns1Entries = opLog.getEntries('ns-1');
		expect(ns1Entries).toHaveLength(2);
		expect(ns1Entries.every(e => e.namespace === 'ns-1')).toBe(true);
	});

	it('should filter entries by since timestamp', () => {
		const opLog = createOpLog();
		opLog.append({ opId: 'op-1', namespace: 'ns', timestamp: 100, data: {} });
		opLog.append({ opId: 'op-2', namespace: 'ns', timestamp: 200, data: {} });
		opLog.append({ opId: 'op-3', namespace: 'ns', timestamp: 300, data: {} });

		const filtered = opLog.getEntries(undefined, 200);
		expect(filtered).toHaveLength(2);
		expect(filtered[0].opId).toBe('op-2');
		expect(filtered[1].opId).toBe('op-3');
	});

	it('should compact entries before a given timestamp', () => {
		const opLog = createOpLog();
		opLog.append({ opId: 'op-1', namespace: 'ns', timestamp: 100, data: {} });
		opLog.append({ opId: 'op-2', namespace: 'ns', timestamp: 200, data: {} });
		opLog.append({ opId: 'op-3', namespace: 'ns', timestamp: 300, data: {} });

		const removedCount = opLog.compact(250);
		expect(removedCount).toBe(2);
		expect(opLog.has('op-1')).toBe(false);
		expect(opLog.has('op-2')).toBe(false);
		expect(opLog.has('op-3')).toBe(true);
	});
});
