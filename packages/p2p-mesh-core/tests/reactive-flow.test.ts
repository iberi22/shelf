import { describe, expect, it, vi } from 'vitest';
import { DatabaseSyncManager } from '../src/database-sync';

describe('DatabaseSyncManager reactive observing', () => {
	it('should trigger onObserve for local mutations after refactor', async () => {
		const sync = new DatabaseSyncManager();
        // Set local peer as master to pass permissions check
        sync.localPeerId = 'node-a';
        sync.setMasterPeerId('node-a');
		sync.isReady = true;

		const observer = vi.fn();
		sync.onObserve(observer);

		// Local mutation
		sync.upsertEntity('products', { id: 'p1', name: 'Product 1' } as any);

		expect(observer).toHaveBeenCalledWith(
			'products',
			[expect.objectContaining({ id: 'p1', name: 'Product 1' })],
			[]
		);
	});

	it('should trigger onChange for local metadata mutations after refactor', async () => {
		const sync = new DatabaseSyncManager();
        sync.localPeerId = 'node-a';
        sync.setMasterPeerId('node-a');
		sync.isReady = true;

        const changeHandler = vi.fn();
        sync.onChange(changeHandler);

        sync.setInventoryConfig({ lowStockThreshold: 10 } as any);

        expect(changeHandler).toHaveBeenCalled();
        // The second argument of onChange is the origin, it should be "local"
        expect(changeHandler).toHaveBeenCalledWith(expect.any(Uint8Array), 'local');
	});
});
