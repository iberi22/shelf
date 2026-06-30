import { describe, expect, it } from 'vitest';
import { DatabaseSyncManager } from '../src/database-sync';
import type { AppState, Product } from '../src/types';

const product = (
	id: string,
	name: string,
	overrides: Partial<Product> = {},
): Product => ({
	id,
	name,
	price: 10,
	cost: 6,
	quantity: 2,
	isActive: true,
	updatedBy: 'node-a',
	updatedAt: '2026-06-14T00:00:00.000Z',
	...overrides,
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
		measureOptions: ['5CM', '7CM', '10CM', '12CM', '14CM', '15CM', '17CM', '20CM', '28CM'],
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

	it('lets collaborators apply clean product updates directly', () => {
		const sync = new DatabaseSyncManager();
		const baseProduct = product('sku-1', 'Coffee', {
			price: 10,
			updatedAt: '2026-06-14T00:00:00.000Z',
			updatedBy: 'host',
		});

		sync.initWithState(
			baseState({
				products: [baseProduct],
				peers: [
					{
						id: 'node-b',
						role: 'collaborator',
						lastSeen: '2026-06-14T00:00:00.000Z',
						permissions: {
							canViewProducts: true,
							canEditProducts: true,
							canViewSales: true,
							canEditSales: false,
							canViewClients: true,
							canEditClients: false,
							canViewSuppliers: false,
							canEditSuppliers: false,
							canViewPurchaseOrders: false,
							canEditPurchaseOrders: false,
							canViewReports: false,
							canViewArqueo: false,
							canViewDashboard: false,
						},
					},
				],
			}),
		);
		sync.localPeerId = 'node-b';
		sync.setMasterPeerId('host');

		sync.upsertEntity('products', {
			...baseProduct,
			price: 12,
			updatedAt: '2026-06-14T00:01:00.000Z',
			updatedBy: 'node-b',
			__baseUpdatedAt: baseProduct.updatedAt,
		});

		const state = sync.getState('node-b');
		expect(state.products?.[0]).toEqual(expect.objectContaining({ price: 12 }));
		expect(state.pendingEdits).toEqual([]);
		expect((state.products?.[0] as Product & { __baseUpdatedAt?: string }).__baseUpdatedAt).toBeUndefined();
	});

	it('routes stale collaborator product updates to pending edits', () => {
		const sync = new DatabaseSyncManager();
		const currentProduct = product('sku-1', 'Coffee', {
			price: 15,
			updatedAt: '2026-06-14T00:02:00.000Z',
			updatedBy: 'host',
		});

		sync.initWithState(
			baseState({
				products: [currentProduct],
				peers: [
					{
						id: 'node-b',
						role: 'collaborator',
						lastSeen: '2026-06-14T00:00:00.000Z',
						permissions: {
							canViewProducts: true,
							canEditProducts: true,
							canViewSales: true,
							canEditSales: false,
							canViewClients: true,
							canEditClients: false,
							canViewSuppliers: false,
							canEditSuppliers: false,
							canViewPurchaseOrders: false,
							canEditPurchaseOrders: false,
							canViewReports: false,
							canViewArqueo: false,
							canViewDashboard: false,
						},
					},
				],
			}),
		);
		sync.localPeerId = 'node-b';
		sync.setMasterPeerId('host');

		sync.upsertEntity('products', {
			...currentProduct,
			price: 12,
			updatedAt: '2026-06-14T00:03:00.000Z',
			updatedBy: 'node-b',
			__baseUpdatedAt: '2026-06-14T00:00:00.000Z',
		});

		const state = sync.getState('node-b');
		expect(state.products?.[0]).toEqual(expect.objectContaining({ price: 15 }));
		expect(state.pendingEdits).toHaveLength(1);
		expect(state.pendingEdits?.[0].proposedData).toEqual(expect.objectContaining({ price: 12 }));
	});

	it('blocks unauthorized authority mutations from collaborators', () => {
		const sync = new DatabaseSyncManager();
		sync.initWithState(
			baseState({
				peers: [
					{
						id: 'host',
						role: 'admin',
						isMaster: true,
						lastSeen: '2026-06-14T00:00:00.000Z',
					},
					{
						id: 'node-b',
						role: 'collaborator',
						lastSeen: '2026-06-14T00:00:00.000Z',
					},
				],
			}),
		);
		sync.localPeerId = 'node-b';
		sync.setMasterPeerId('host');

		// Attempt unauthorized inventory config change
		const newConfig = { ...baseState().inventoryConfig, lowStockThreshold: 99 };
		sync.setInventoryConfig(newConfig as any);
		expect(sync.getInventoryConfig()?.lowStockThreshold).not.toBe(99);

		// Attempt unauthorized master reassignment
		sync.setMasterPeerId('node-b');
		expect(sync.getMasterPeerId()).toBe('host');

		// Attempt unauthorized peer removal
		sync.removeLinkedNode('host');
		expect(sync.getLinkedNodes().find(n => n.id === 'host')).toBeDefined();
	});
});
