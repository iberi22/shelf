import { describe, expect, it } from 'vitest';

import { BODEGA_FEATURE_FLAG, canViewBodega, isNavItemVisible } from './access';

describe('bodega access (feature flag + existing permission model)', () => {
  it('is gated by the Branches & Bodegas feature flag', () => {
    expect(BODEGA_FEATURE_FLAG).toBe('SRC-FUN-023');
  });

  it('denies access when the feature flag is disabled, even for admins', () => {
    expect(canViewBodega({ role: 'admin', permissions: { canViewProducts: true }, flagEnabled: false })).toBe(false);
  });

  it('allows admins when the flag is enabled, regardless of the product permission', () => {
    expect(canViewBodega({ role: 'admin', permissions: { canViewProducts: false }, flagEnabled: true })).toBe(true);
  });

  it('allows a non-admin whose canViewProducts is not explicitly denied', () => {
    expect(canViewBodega({ role: 'collaborator', permissions: { canViewProducts: true }, flagEnabled: true })).toBe(
      true,
    );
    expect(canViewBodega({ role: 'collaborator', permissions: {}, flagEnabled: true })).toBe(true);
    expect(canViewBodega({ role: 'collaborator', permissions: null, flagEnabled: true })).toBe(true);
  });

  it('denies a non-admin whose canViewProducts is explicitly false', () => {
    expect(canViewBodega({ role: 'collaborator', permissions: { canViewProducts: false }, flagEnabled: true })).toBe(
      false,
    );
  });
});

describe('isNavItemVisible navigation predicate', () => {
  const makeCtx = (opts: {
    flags?: Record<string, boolean>;
    role?: string | null;
    permissions?: Record<string, boolean | undefined> | null;
  }) => ({
    role: opts.role ?? 'admin',
    permissions: opts.permissions ?? {},
    isEnabled: (flag: string) => opts.flags?.[flag] ?? true,
  });

  it('denies nav.bodegas when BODEGA_FEATURE_FLAG is disabled', () => {
    const ctx = makeCtx({
      flags: { [BODEGA_FEATURE_FLAG]: false },
      role: 'admin',
    });
    expect(isNavItemVisible('nav.bodegas', ctx)).toBe(false);
    expect(isNavItemVisible({ nameKey: 'nav.bodegas' }, ctx)).toBe(false);
  });

  it('denies nav.bodegas for collaborator without product viewing permissions', () => {
    const ctx = makeCtx({
      flags: { [BODEGA_FEATURE_FLAG]: true },
      role: 'collaborator',
      permissions: { canViewProducts: false },
    });
    expect(isNavItemVisible('nav.bodegas', ctx)).toBe(false);
  });

  it('allows nav.bodegas for collaborator with product viewing permission enabled', () => {
    const ctx = makeCtx({
      flags: { [BODEGA_FEATURE_FLAG]: true },
      role: 'collaborator',
      permissions: { canViewProducts: true },
    });
    expect(isNavItemVisible('nav.bodegas', ctx)).toBe(true);
  });

  it('allows nav.bodegas for admin when feature flag is enabled', () => {
    const ctx = makeCtx({
      flags: { [BODEGA_FEATURE_FLAG]: true },
      role: 'admin',
      permissions: { canViewProducts: false },
    });
    expect(isNavItemVisible('nav.bodegas', ctx)).toBe(true);
  });

  it('correctly handles feature flags and permissions for standard navigation items', () => {
    // Purchases feature flag check
    expect(isNavItemVisible('nav.purchases', makeCtx({ flags: { 'SRC-FUN-005': false } }))).toBe(false);
    expect(isNavItemVisible('nav.purchases', makeCtx({ flags: { 'SRC-FUN-005': true } }))).toBe(true);

    // Dashboard permission check for non-admin
    expect(
      isNavItemVisible('nav.summary', makeCtx({ role: 'cashier', permissions: { canViewDashboard: false } })),
    ).toBe(false);
    expect(isNavItemVisible('nav.summary', makeCtx({ role: 'admin', permissions: { canViewDashboard: false } }))).toBe(
      true,
    );
  });
});
