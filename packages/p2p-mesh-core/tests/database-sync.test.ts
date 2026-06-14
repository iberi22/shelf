import { describe, expect, it } from 'vitest';
import { DatabaseSyncManager } from '../src/database-sync';
import type { AppState, Product } from '../src/types';

const product = (id: string, name: string): Product => ({
	id,
	name,
	price: 10,
	cost: 6,
	quantity: 2,
	isActive: true,
	updatedBy: 'node-a',
	updatedAt: '2026-06-14T00:00:00.000Z',
});

const baseState = (overrides: Partial<AppState> = {}): AppState => ({
	products: [],
	sales: [],
	clients: [],
	suppliers: [],
	purchaseOrders: [],
	auditLogs: [],
	arqueoSessions: [],
	ocrResults: [],
	teamMembers: [],
	pendingEdits: [],
	productChangeHistory: [],
	peers: [],
	localPeerId: null,
	inventoryConfig: {
		lowStockThreshold: 5,
		tablePageSize: 50,
		variantAttributes: ['Color', 'Medida'],
		measureOptions: ['30CM', '40CM', '50CM', '60CM'],
		inventoryFields: [],
	},
	role: 'admin',
	...overrides,
});

describe('DatabaseSyncManager lifecycle sync', () => {
	it('marks ready only after initial state is loaded and notifies listeners', () => {
		const sync = new DatabaseSyncManager();
		const readyEvents: boolean[] = [];
		sync.onReady(() => readyEvents.push(sync.isReady));

		expect(sync.isReady).toBe(false);
		sync.initWithState(
			baseState({
				products: [product('sku-1', 'Coffee')],
			}),
		);

		expect(sync.isReady).toBe(true);
		expect(readyEvents).toEqual([true]);
		expect(sync.getState().products).toEqual([
			expect.objectContaining({ id: 'sku-1', name: 'Coffee' }),
		]);
	});

	it('catches up a peer with state-vector diffs instead of AppState snapshots', () => {
		const source = new DatabaseSyncManager();
		const target = new DatabaseSyncManager();

		source.initWithState(
			baseState({
				products: [product('sku-1', 'Coffee')],
			}),
		);
		target.initWithState(baseState());

		const diff = source.getDiff(target.getStateVector());
		target.applyUpdate(diff, 'source-peer');

		expect(target.getState().products).toEqual([
			expect.objectContaining({ id: 'sku-1', name: 'Coffee' }),
		]);
	});
});
