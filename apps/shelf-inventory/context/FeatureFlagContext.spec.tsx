import { renderHook } from '@testing-library/react';
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
});
