import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import shippedLedger from '../../../.gitcore/features.json';
import { ENABLED_FEATURE_STATUSES, FeatureFlagProvider, useFeatureFlagsContext } from './FeatureFlagContext';

interface LedgerFeature {
  id: string;
  status: string;
}

const ledger = shippedLedger as { features: LedgerFeature[] };

const statusOf = (id: string) => ledger.features.find((feature) => feature.id === id)?.status;

const isEnabledStatus = (status: string) => (ENABLED_FEATURE_STATUSES as readonly string[]).includes(status);

const renderFlags = () =>
  renderHook(() => useFeatureFlagsContext(), {
    wrapper: ({ children }) => <FeatureFlagProvider>{children}</FeatureFlagProvider>,
  });

describe('FeatureFlagContext enablement', () => {
  beforeEach(() => {
    localStorage.clear();
    // The provider probes the Vite dev features API in DEV mode; keep every test
    // pinned to the shipped .gitcore/features.json ledger.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats the shipped partial features SRC-FUN-002/004/005 as enabled with no overrides', () => {
    // Guard against ledger drift making the assertions below vacuous.
    expect([statusOf('SRC-FUN-002'), statusOf('SRC-FUN-004'), statusOf('SRC-FUN-005')]).toEqual([
      'partial',
      'partial',
      'partial',
    ]);

    const { result } = renderFlags();

    expect(result.current.overrides).toEqual({});
    // Sales, Contact Management (clients + suppliers) and Purchase Orders gate the
    // sidebar entries and MainApp routes, so they must resolve to enabled.
    expect(result.current.isEnabled('SRC-FUN-002')).toBe(true);
    expect(result.current.isEnabled('SRC-FUN-004')).toBe(true);
    expect(result.current.isEnabled('SRC-FUN-005')).toBe(true);
  });

  it('keeps planned, in_progress and out_of_scope features disabled', () => {
    expect(statusOf('SRC-REF-003')).toBe('planned');
    expect(statusOf('SRC-FUN-009')).toBe('out_of_scope');
    expect(statusOf('SRC-REF-001')).toBe('in_progress');

    const { result } = renderFlags();

    expect(result.current.isEnabled('SRC-REF-003')).toBe(false);
    expect(result.current.isEnabled('SRC-FUN-009')).toBe(false);
    expect(result.current.isEnabled('SRC-REF-001')).toBe(false);
  });

  it('enables exactly the shipped implemented, validated and partial features', () => {
    const { result } = renderFlags();
    const mismatches = ledger.features
      .filter((feature) => result.current.isEnabled(feature.id) !== isEnabledStatus(feature.status))
      .map((feature) => `${feature.id} (${feature.status})`);

    expect(mismatches).toEqual([]);
    expect(ledger.features.some((feature) => feature.status === 'partial')).toBe(true);
  });

  it('returns false for ids that are not in the ledger', () => {
    const { result } = renderFlags();

    expect(result.current.isEnabled('SRC-DOES-NOT-EXIST')).toBe(false);
  });

  it('still lets a local override disable a partial feature', () => {
    localStorage.setItem('shelf_feature_overrides', JSON.stringify({ 'SRC-FUN-002': false }));

    const { result } = renderFlags();

    expect(result.current.isEnabled('SRC-FUN-002')).toBe(false);
    expect(result.current.isEnabled('SRC-FUN-004')).toBe(true);
  });

  it('respects runtime_enabled independently of status when available', async () => {
    const mockLedger = {
      metadata: {},
      features: [
        { id: 'F1', status: 'implemented', runtime_enabled: false },
        { id: 'F2', status: 'planned', runtime_enabled: true },
        { id: 'F3', status: 'planned' },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockLedger,
      }),
    );

    expect(import.meta.env.DEV).toBe(true);
    const { result } = renderFlags();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isEnabled('F1')).toBe(false); // implemented but runtime_enabled=false
    expect(result.current.isEnabled('F2')).toBe(true); // planned but runtime_enabled=true
    expect(result.current.isEnabled('F3')).toBe(false); // planned, no runtime_enabled
  });

  it('still lets a local override win over runtime_enabled', async () => {
    const mockLedger = {
      metadata: {},
      features: [{ id: 'F1', status: 'planned', runtime_enabled: true }],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockLedger,
      }),
    );

    localStorage.setItem('shelf_feature_overrides', JSON.stringify({ F1: false }));

    const { result } = renderFlags();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isEnabled('F1')).toBe(false);
  });

  it('toggleFeature writes runtime_enabled state without modifying status', async () => {
    const mockLedger = {
      metadata: { total_features: 2 },
      features: [
        { id: 'SRC-FUN-002', status: 'partial' }, // partial is enabled by default
        { id: 'SRC-FUN-003', status: 'planned', runtime_enabled: false },
      ],
    };

    const fetchStub = vi
      .fn<
        (
          url: string | URL | Request,
          init?: { method?: string; body?: string },
        ) => Promise<{ ok: boolean; json: () => Promise<unknown> }>
      >()
      .mockResolvedValue({
        ok: true,
        json: async () => mockLedger,
      });
    vi.stubGlobal('fetch', fetchStub);

    const { result } = renderFlags();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.toggleFeature('SRC-FUN-002');

    const postCalls = fetchStub.mock.calls.filter((call) => call[1]?.method === 'POST');
    expect(postCalls.length).toBe(1);

    const postBody = JSON.parse(postCalls[0][1]?.body as string);
    expect(postBody.features).toEqual([
      {
        id: 'SRC-FUN-002',
        status: 'partial',
        runtime_enabled: false,
      },
      {
        id: 'SRC-FUN-003',
        status: 'planned',
        runtime_enabled: false,
      },
    ]);
  });
});
