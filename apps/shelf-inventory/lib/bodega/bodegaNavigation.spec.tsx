import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar, { MobileBottomNav } from '../../components/Sidebar';
import MainApp from '../../MainApp';
import { BODEGA_FEATURE_FLAG } from './access';

(globalThis as any).__APP_VERSION__ = '1.0.0';
(globalThis as any).__COMMIT_HASH__ = 'abcdef';

// Mock matchMedia for JSDOM
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes('min-width: 768px'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

// Mock child pages to keep route testing fast and isolated
vi.mock('../../components/Dashboard', () => ({ default: () => <div data-testid="dashboard">Dashboard</div> }));
vi.mock('../../components/Inventory', () => ({ default: () => <div data-testid="inventory">Inventory</div> }));
vi.mock('../../components/BodegaPage', () => ({ default: () => <div data-testid="bodega-page">BodegaPage</div> }));
vi.mock('../../components/Arqueo', () => ({ default: () => <div data-testid="arqueo">Arqueo</div> }));
vi.mock('../../components/Catalog', () => ({ default: () => <div data-testid="catalog">Catalog</div> }));
vi.mock('../../components/Clients', () => ({ default: () => <div data-testid="clients">Clients</div> }));
vi.mock('../../components/MemoryTuningPage', () => ({ default: () => <div data-testid="memory">Memory</div> }));
vi.mock('../../components/P2PSyncStatusHeader', () => ({ default: () => <div data-testid="sync">Sync</div> }));
vi.mock('../../components/PullToRefresh', () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock('../../components/PurchaseOrders', () => ({ default: () => <div data-testid="purchases">Purchases</div> }));
vi.mock('../../components/Reports', () => ({ default: () => <div data-testid="reports">Reports</div> }));
vi.mock('../../components/Sales', () => ({ default: () => <div data-testid="sales">Sales</div> }));
vi.mock('../../components/Settings', () => ({ default: () => <div data-testid="settings">Settings</div> }));
vi.mock('../../components/Suppliers', () => ({ default: () => <div data-testid="suppliers">Suppliers</div> }));
vi.mock('../../components/GlobalSearch', () => ({ default: () => <div data-testid="search">Search</div> }));

let mockState = {
  role: 'admin' as string | null,
  permissions: { canViewProducts: true } as Record<string, boolean> | null,
  branches: [] as any[],
  isExpelled: false,
};

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    state: mockState,
    dispatch: vi.fn(),
  }),
}));

let enabledFlags: Record<string, boolean> = {};

vi.mock('../../hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    isEnabled: (flag: string) => enabledFlags[flag] ?? false,
  }),
}));

const translations: Record<string, string> = {
  'nav.bodegas': 'Bodegas',
  'nav.summary': 'Resumen',
  'nav.inventory': 'Inventario',
  'common.accessDenied': 'Acceso restringido',
  'common.accessDeniedDescription': 'No tienes permisos para ver esta sección.',
};

vi.mock('../../context/I18nContext', () => ({
  useI18n: () => ({
    t: (k: string) => translations[k] || k,
  }),
}));

describe('Sidebar and MainApp Bodega navigation wiring', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockState = {
      role: 'admin',
      permissions: { canViewProducts: true },
      branches: [],
      isExpelled: false,
    };
    enabledFlags = {};
  });

  afterEach(() => {
    cleanup();
  });

  describe('Sidebar (kills M7)', () => {
    it('hides nav.bodegas in Sidebar when feature flag is disabled', () => {
      enabledFlags[BODEGA_FEATURE_FLAG] = false;
      render(<Sidebar activeComponent="nav.summary" setActiveComponent={vi.fn()} />);

      expect(screen.queryByText('Bodegas')).not.toBeInTheDocument();
    });

    it('shows nav.bodegas in Sidebar when feature flag is enabled and user is admin', () => {
      enabledFlags[BODEGA_FEATURE_FLAG] = true;
      render(<Sidebar activeComponent="nav.summary" setActiveComponent={vi.fn()} />);

      const bodegaElements = screen.getAllByText('Bodegas');
      expect(bodegaElements.length).toBeGreaterThan(0);
    });

    it('hides nav.bodegas in Sidebar for collaborator with canViewProducts: false even when flag is enabled', () => {
      enabledFlags[BODEGA_FEATURE_FLAG] = true;
      mockState = {
        role: 'collaborator',
        permissions: { canViewProducts: false },
        branches: [],
        isExpelled: false,
      };
      render(<Sidebar activeComponent="nav.summary" setActiveComponent={vi.fn()} />);

      expect(screen.queryByText('Bodegas')).not.toBeInTheDocument();
    });
  });

  describe('MobileBottomNav shared predicate integration', () => {
    it('uses isNavItemVisible to gate mobile nav items (e.g. inventory feature flag)', () => {
      enabledFlags['SRC-FUN-001'] = false;
      render(<MobileBottomNav activeComponent="nav.summary" setActiveComponent={vi.fn()} />);

      expect(screen.queryByTestId('mobile-nav-item-nav.inventory')).not.toBeInTheDocument();
    });
  });

  describe('MainApp routing (kills M5 and M6)', () => {
    it('denies access (renders AccessDenied, NOT BodegaPage) when feature flag is disabled (kills M5 & M6)', () => {
      enabledFlags[BODEGA_FEATURE_FLAG] = false;
      render(<MainApp initialComponent="nav.bodegas" />);

      expect(screen.getByTestId('access-denied')).toBeInTheDocument();
      expect(screen.queryByTestId('bodega-page')).not.toBeInTheDocument();
    });

    it('denies access when flag is enabled but collaborator lacks product permission (kills M5)', () => {
      enabledFlags[BODEGA_FEATURE_FLAG] = true;
      mockState = {
        role: 'collaborator',
        permissions: { canViewProducts: false },
        branches: [],
        isExpelled: false,
      };

      render(<MainApp initialComponent="nav.bodegas" />);

      expect(screen.getByTestId('access-denied')).toBeInTheDocument();
      expect(screen.queryByTestId('bodega-page')).not.toBeInTheDocument();
    });

    it('renders BodegaPage when feature flag is enabled and user has access', () => {
      enabledFlags[BODEGA_FEATURE_FLAG] = true;
      render(<MainApp initialComponent="nav.bodegas" />);

      expect(screen.getByTestId('bodega-page')).toBeInTheDocument();
      expect(screen.queryByTestId('access-denied')).not.toBeInTheDocument();
    });
  });
});
