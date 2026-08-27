import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  createEmptyShelfEdgeStats,
  getDeletedIdsFromYMapEvent,
  getShelfEdgeStats,
  readShelfEdgeState,
  SHELF_EDGE_BRANCH_COLLECTIONS,
  SHELF_EDGE_COLLECTIONS,
  SHELF_EDGE_GLOBAL_COLLECTIONS,
  SHELF_EDGE_LOCAL_ORIGIN,
  SHELF_EDGE_UNIFIED_DOC,
  shelfEdgeMapKey,
  syncAppStateToShelfEdgeDoc,
} from './edge-mesh-workflow';

describe('constants', () => {
  it('exposes namespace and origin constants', () => {
    expect(SHELF_EDGE_UNIFIED_DOC).toBe(true);
    expect(SHELF_EDGE_LOCAL_ORIGIN).toBe('shelf-edge-workflow');
  });

  it('splits collections into global and branch sets', () => {
    expect(SHELF_EDGE_GLOBAL_COLLECTIONS).toContain('clients');
    expect(SHELF_EDGE_GLOBAL_COLLECTIONS).toContain('suppliers');
    expect(SHELF_EDGE_BRANCH_COLLECTIONS).toContain('products');
    expect(SHELF_EDGE_BRANCH_COLLECTIONS).toContain('sales');
    expect(SHELF_EDGE_COLLECTIONS).toHaveLength(
      SHELF_EDGE_GLOBAL_COLLECTIONS.length + SHELF_EDGE_BRANCH_COLLECTIONS.length,
    );
  });
});

describe('shelfEdgeMapKey', () => {
  it('uses the plain collection name in unified mode', () => {
    expect(shelfEdgeMapKey('products')).toBe('products');
    expect(shelfEdgeMapKey('products', '', true)).toBe('products');
  });

  it('prefixes the collection name in legacy mode', () => {
    expect(shelfEdgeMapKey('products', 'shelf', false)).toBe('shelf_products');
  });

  it('ignores the prefix when unified', () => {
    expect(shelfEdgeMapKey('clients', 'shelf_')).toBe('clients');
  });
});

describe('createEmptyShelfEdgeStats', () => {
  it('zeroes every collection', () => {
    const stats = createEmptyShelfEdgeStats();
    for (const collection of SHELF_EDGE_COLLECTIONS) {
      expect(stats[collection]).toBe(0);
    }
    expect(Object.keys(stats)).toHaveLength(SHELF_EDGE_COLLECTIONS.length);
  });
});

describe('getShelfEdgeStats / readShelfEdgeState', () => {
  it('reads map sizes per collection from a Y.Doc', () => {
    const doc = new Y.Doc();
    doc.getMap('products').set('p1', { id: 'p1', name: 'A' });
    doc.getMap('clients').set('c1', { id: 'c1', name: 'Client' });
    const stats = getShelfEdgeStats(doc);
    expect(stats.products).toBe(1);
    expect(stats.clients).toBe(1);
    expect(stats.sales).toBe(0);
  });

  it('reads prefixed maps in legacy mode', () => {
    const doc = new Y.Doc();
    doc.getMap('shelf_products').set('p1', { id: 'p1' });
    const stats = getShelfEdgeStats(doc, 'shelf', false);
    expect(stats.products).toBe(1);
    expect(stats.sales).toBe(0);
  });

  it('readShelfEdgeState mirrors map values into AppState arrays', () => {
    const doc = new Y.Doc();
    doc.getMap('products').set('p1', { id: 'p1', name: 'A' });
    const state = readShelfEdgeState(doc);
    expect(state.products).toEqual([{ id: 'p1', name: 'A' }]);
    expect(state.sales).toEqual([]);
  });
});

describe('syncAppStateToShelfEdgeDoc', () => {
  it('mirrors AppState arrays into Y maps and reports stats', () => {
    const doc = new Y.Doc();
    const result = syncAppStateToShelfEdgeDoc(doc, {
      products: [{ id: 'p1', name: 'A' }],
      clients: [{ id: 'c1', name: 'C' }],
    } as never);

    expect(result.changedCollections.sort()).toEqual(['clients', 'products']);
    expect(result.stats.products).toBe(1);
    expect(result.stats.clients).toBe(1);
    expect(result.totalItems).toBe(2);
    expect(doc.getMap('products').get('p1')).toEqual({ id: 'p1', name: 'A' });
  });

  it('is idempotent: no changed collections when state matches the doc', () => {
    const doc = new Y.Doc();
    const state = {
      products: [{ id: 'p1', name: 'A' }],
    } as never;
    syncAppStateToShelfEdgeDoc(doc, state);
    const second = syncAppStateToShelfEdgeDoc(doc, state);
    expect(second.changedCollections).toEqual([]);
    expect(second.totalItems).toBe(1);
  });

  it('removes entries that disappeared from the state', () => {
    const doc = new Y.Doc();
    syncAppStateToShelfEdgeDoc(doc, { products: [{ id: 'p1' }, { id: 'p2' }] } as never);
    const result = syncAppStateToShelfEdgeDoc(doc, { products: [{ id: 'p1' }] } as never);
    expect(result.changedCollections).toContain('products');
    expect(doc.getMap('products').has('p2')).toBe(false);
  });

  it('filters out items without a string id', () => {
    const doc = new Y.Doc();
    const result = syncAppStateToShelfEdgeDoc(doc, {
      products: [{ id: 'p1' }, { name: 'no-id' }, null, 'string-item'],
    } as never);
    expect(result.stats.products).toBe(1);
  });

  it('writes to prefixed maps in legacy mode', () => {
    const doc = new Y.Doc();
    const result = syncAppStateToShelfEdgeDoc(
      doc,
      { products: [{ id: 'p1' }] } as never,
      SHELF_EDGE_COLLECTIONS as never,
      'shelf',
      false,
    );
    expect(result.stats.products).toBe(1);
    expect(doc.getMap('shelf_products').has('p1')).toBe(true);
  });
});

describe('getDeletedIdsFromYMapEvent', () => {
  it('collects keys whose change action is delete', () => {
    const event = {
      changes: {
        keys: new Map([
          ['gone-1', { action: 'delete' }],
          ['kept-1', { action: 'add' }],
          ['gone-2', { action: 'delete' }],
          ['updated-1', { action: 'update' }],
        ]),
      },
    };
    expect(getDeletedIdsFromYMapEvent(event as unknown as Y.YMapEvent<unknown>)).toEqual(['gone-1', 'gone-2']);
  });

  it('returns an empty array when nothing was deleted', () => {
    const event = {
      changes: { keys: new Map([['a', { action: 'add' }]]) },
    };
    expect(getDeletedIdsFromYMapEvent(event as unknown as Y.YMapEvent<unknown>)).toEqual([]);
  });
});
