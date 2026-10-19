import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { InventoryConfig, Product } from 'p2p-mesh-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryView, type InventoryViewProps } from '../components/inventory/InventoryView';
import { DEFAULT_INVENTORY_CONFIG } from './inventoryConfig';

vi.mock('../context/I18nContext', () => ({
  useI18n: () => ({
    t: (k: string, options?: any) => {
      if (k === 'inventory.showingCount') return `${options.shown} of ${options.total}`;
      return k;
    },
  }),
}));

describe('InventoryView component', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders correctly with default fields when custom fields are missing (Blocker 1)', () => {
    const config: InventoryConfig = {
      ...DEFAULT_INVENTORY_CONFIG,
      fields: [{ id: 'field-category', key: 'category', label: 'Category', type: 'text' }],
    };

    const product: Product = {
      id: 'p1',
      name: 'Product 1',
      sku: 'SKU1',
      price: 10,
      cost: 5,
      quantity: 5,
      isActive: true,
      updatedBy: 'peer-1',
      updatedAt: new Date().toISOString(),
      supplierId: 's1',
      customFields: {},
    };

    const props: InventoryViewProps = {
      products: [product],
      config,
      formatMoney: (v: number) => `$${v}`,
      t: (k: string) => k,
      lowStockThreshold: 2,
      suppliers: [],
    };

    expect(() => render(<InventoryView {...props} />)).not.toThrow();
    const tables = screen.getAllByTestId('inventory-table');
    expect(tables.length).toBeGreaterThan(0);
    expect(tables[0]).toBeInTheDocument();
  });

  it('resets mobile pagination on search filter change (Blocker 3)', { timeout: 30_000 }, async () => {
    const config: InventoryConfig = {
      ...DEFAULT_INVENTORY_CONFIG,
      fields: [],
    };

    // Generate 101 products
    const products: Product[] = Array.from({ length: 101 }).map((_, i) => ({
      id: `p${i}`,
      name: i < 60 ? `Alpha Product ${i}` : `Beta Product ${i}`,
      sku: `SKU${i}`,
      price: 10,
      cost: 5,
      quantity: 5,
      isActive: true,
      updatedBy: 'peer-1',
      updatedAt: new Date().toISOString(),
      supplierId: 's1',
      customFields: {},
    }));

    // Mock IntersectionObserver
    const observer = { fire: null as IntersectionObserverCallback | null };
    class MockIntersectionObserver implements IntersectionObserver {
      root: Element | null = null;
      rootMargin: string = '';
      scrollMargin: string = '0px';
      thresholds: ReadonlyArray<number> = [];

      constructor(callback: IntersectionObserverCallback) {
        observer.fire = callback;
      }

      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    const props: InventoryViewProps = {
      products,
      config,
      formatMoney: (v: number) => `$${v}`,
      t: (k: string, options?: any) => {
        if (k === 'inventory.showingCount') return `${options.shown} of ${options.total}`;
        return k;
      },
      lowStockThreshold: 2,
      suppliers: [],
    };

    render(<InventoryView {...props} />);

    // Initial: should show 50
    expect(screen.getByTestId('mobile-list-count')).toHaveTextContent('50 of 101');

    // Trigger intersection multiple times to load all 101 products
    if (!observer.fire) {
      throw new Error('IntersectionObserver was not constructed');
    }
    const mockEntry = { isIntersecting: true } as unknown as IntersectionObserverEntry;
    const mockObserver = {} as unknown as IntersectionObserver;
    const fire = observer.fire;
    act(() => {
      fire([mockEntry], mockObserver);
    });
    act(() => {
      fire([mockEntry], mockObserver);
    });

    // Should now show 101
    expect(screen.getByTestId('mobile-list-count')).toHaveTextContent('101 of 101');

    // Change filter: search for exactly "Alpha" matches
    const searchInput = screen.getByPlaceholderText('inventory.searchPlaceholder');
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'Alpha' } });
    });

    // "Alpha" matches: 60 products (i < 60).
    // It should reset to 50 of 60.
    expect(screen.getByTestId('mobile-list-count')).toHaveTextContent('50 of 60');

    // And mobile sentinel should be present again (since there are more items to load)
    expect(screen.getByTestId('mobile-list-sentinel')).toBeInTheDocument();
  });
});
