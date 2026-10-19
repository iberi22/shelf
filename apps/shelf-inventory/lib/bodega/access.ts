/**
 * Access rule for the Bodega (external snapshot) screen.
 *
 * The screen must respect the existing permission + feature-flag system used by every
 * other route in MainApp/Sidebar:
 *   - it is gated by a feature flag (the "Branches & Bodegas" flag, SRC-FUN-023), and
 *   - it honours the same role/permission model (`role === 'admin' || canViewProducts !== false`).
 *
 * Keeping this as a pure function makes the gating rule unit-testable (it lives under
 * `lib/`, which the Vitest suite covers) and guarantees the rule has a single definition.
 */
export interface BodegaAccess {
  role?: string | null;
  permissions?: { canViewProducts?: boolean } | null;
  /** Whether the Bodega feature flag (SRC-FUN-023) is enabled. */
  flagEnabled: boolean;
}

export const BODEGA_FEATURE_FLAG = 'SRC-FUN-023';

/** Mirrors `isEnabled(BODEGA_FEATURE_FLAG) && canView(permissions?.canViewProducts)`. */
export function canViewBodega(access: BodegaAccess): boolean {
  if (!access.flagEnabled) return false;
  if (access.role === 'admin') return true;
  return access.permissions?.canViewProducts !== false;
}
