import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MainApp from '../MainApp';

const flags = vi.hoisted(() => ({ enabled: new Set<string>() }));

vi.mock('../hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    isEnabled: (id: string) => flags.enabled.has(id),
  }),
}));

vi.mock('../context/AppContext', () => ({
  useAppContext: () => ({
    state: { isExpelled: false, role: 'admin', permissions: undefined },
    dispatch: vi.fn(),
  }),
}));

vi.mock('../context/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../components/Arqueo', () => ({
  default: () => <div data-testid="arqueo-page" />,
}));
vi.mock('../components/Dashboard', () => ({ default: () => null }));
vi.mock('../components/Inventory', () => ({ default: () => null }));
vi.mock('../components/Sales', () => ({ default: () => null }));
vi.mock('../components/Clients', () => ({ default: () => null }));
vi.mock('../components/Suppliers', () => ({ default: () => null }));
vi.mock('../components/PurchaseOrders', () => ({ default: () => null }));
vi.mock('../components/Catalog', () => ({ default: () => null }));
vi.mock('../components/Reports', () => ({ default: () => null }));
vi.mock('../components/MemoryTuningPage', () => ({ default: () => null }));
vi.mock('../components/Settings', () => ({ default: () => null }));
vi.mock('../components/BodegaPage', () => ({ default: () => null }));
vi.mock('../components/P2PSyncStatusHeader', () => ({ default: () => null }));
vi.mock('../components/PullToRefresh', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/Sidebar', () => ({
  default: () => null,
  MobileBottomNav: () => null,
}));

describe('MainApp nav gating: Arqueo / Cash Sessions (SRC-FUN-026)', () => {
  it('keeps Arqueo visible when only the AI Assistant flag (SRC-FUN-007) is disabled', () => {
    flags.enabled = new Set(['SRC-FUN-026']);

    render(<MainApp initialComponent="nav.arqueo" />);

    expect(screen.getByTestId('arqueo-page')).toBeInTheDocument();
    expect(screen.queryByTestId('access-denied')).not.toBeInTheDocument();
  });

  it('hides Arqueo when its own flag (SRC-FUN-026) is disabled', () => {
    flags.enabled = new Set(['SRC-FUN-007']);

    render(<MainApp initialComponent="nav.arqueo" />);

    expect(screen.queryByTestId('arqueo-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('access-denied')).toBeInTheDocument();
  });
});
