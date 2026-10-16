import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as AppContextMod from '../context/AppContext';
import Inventory from '../components/Inventory';
import React from 'react';

vi.mock('../context/I18nContext', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

vi.mock('../context/CurrencyContext', () => ({
  useCurrency: () => ({ formatCurrency: (v: number) => `$${v}` }),
}));

vi.mock('../context/UIContext', () => ({
  useUI: () => ({ setOfflineIntents: vi.fn(), showToast: vi.fn() }),
}));

// Mock the child components to simplify the test
vi.mock('../components/inventory/InventoryView', () => ({
  InventoryView: ({ readOnly }: { readOnly: boolean }) => (
    <div data-testid="mock-inventory-view" data-readonly={readOnly ? 'true' : 'false'}>
      {readOnly ? 'Read Only Mode' : 'Editable Mode'}
    </div>
  ),
}));

vi.mock('../components/BarcodeScanner', () => ({
  default: () => <div data-testid="mock-barcode-scanner" />
}));

vi.mock('../components/PhotoVariantPicker', () => ({
  default: () => <div data-testid="mock-photo-variant-picker" />
}));

vi.mock('../components/ui/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-modal">{children}</div>
}));

vi.mock('../components/ProductModal', () => ({
  ProductModal: () => <div data-testid="mock-product-modal" />
}));

vi.mock('../components/ProductDetailModal', () => ({
  ProductDetailModal: () => <div data-testid="mock-product-detail-modal" />
}));

describe('Inventory container', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const baseState = {
    user: { id: 'user1', name: 'User 1' },
    activeNodes: [],
    linkedNodes: [],
    ephemeralNodes: [],
    peerId: 'peer1',
    meshStatus: 'connected' as const,
    setMeshStatus: vi.fn(),
    nodeState: {
      type: 'mesh' as const,
      encryption: 'unencrypted' as const,
      auth: 'none' as const,
    },
    dispatch: vi.fn(),
    startP2P: vi.fn(),
    updateLinkedNode: vi.fn(),
    removeLinkedNode: vi.fn(),
    isScanning: false,
    setIsScanning: vi.fn(),
    scanResult: null,
    setScanResult: vi.fn(),
    scanError: null,
    setScanError: vi.fn(),
    getOrCreateLocalDatabase: vi.fn(),
    inventoryConfig: { fields: [], columns: [], categories: [] },
    dsaKeyPair: null,
    preferences: {},
    updatePreferences: vi.fn(),
    activeProducts: [],
    products: [],
    suppliers: [],
  };

  it('renders correctly without editing permissions (Blocker 2)', () => {
    // Override useAppContext to return a state where canEditProducts is false
    vi.spyOn(AppContextMod, 'useAppContext').mockReturnValue({
      state: {
        ...baseState,
        role: 'collaborator',
        permissions: { canEditProducts: false },
      },
      dispatch: vi.fn(),
      getDbSync: () => ({ getArray: () => ({ toArray: () => [] }) }),
    } as unknown as AppContextMod.AppContextType);

    render(<Inventory />);

    // Check if the mock InventoryView received readOnly=true
    const mockView = screen.getByTestId('mock-inventory-view');
    expect(mockView).toHaveAttribute('data-readonly', 'true');
    expect(screen.getByText('Read Only Mode')).toBeInTheDocument();
  });

  it('renders correctly with editing permissions (Blocker 2)', () => {
    // Override useAppContext to return a state where canEditProducts is true
    vi.spyOn(AppContextMod, 'useAppContext').mockReturnValue({
      state: {
        ...baseState,
        role: 'collaborator',
        permissions: { canEditProducts: true },
      },
      dispatch: vi.fn(),
      getDbSync: () => ({ getArray: () => ({ toArray: () => [] }) }),
    } as unknown as AppContextMod.AppContextType);

    render(<Inventory />);

    // Check if the mock InventoryView received readOnly=false
    const mockView = screen.getByTestId('mock-inventory-view');
    expect(mockView).toHaveAttribute('data-readonly', 'false');
    expect(screen.getByText('Editable Mode')).toBeInTheDocument();
  });

  it('renders correctly as admin (Blocker 2)', () => {
    // Admins can always edit, even without explicit permissions
    vi.spyOn(AppContextMod, 'useAppContext').mockReturnValue({
      state: {
        ...baseState,
        role: 'admin',
        permissions: {},
      },
      dispatch: vi.fn(),
      getDbSync: () => ({ getArray: () => ({ toArray: () => [] }) }),
    } as unknown as AppContextMod.AppContextType);

    render(<Inventory />);

    // Check if the mock InventoryView received readOnly=false
    const mockView = screen.getByTestId('mock-inventory-view');
    expect(mockView).toHaveAttribute('data-readonly', 'false');
    expect(screen.getByText('Editable Mode')).toBeInTheDocument();
  });
});
