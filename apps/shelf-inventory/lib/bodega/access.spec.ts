import { describe, expect, it } from 'vitest';

import { BODEGA_FEATURE_FLAG, canViewBodega } from './access';

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
