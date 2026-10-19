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

export interface NavItemVisibilityContext {
  role?: string | null;
  permissions?: {
    canViewDashboard?: boolean;
    canViewProducts?: boolean;
    canViewSales?: boolean;
    canViewPurchaseOrders?: boolean;
    canViewClients?: boolean;
    canViewSuppliers?: boolean;
    canViewReports?: boolean;
    canViewArqueo?: boolean;
  } | null;
  isEnabled: (flag: string) => boolean;
}

/**
 * Single predicate determining whether a navigation item or route is visible
 * based on active feature flags and role/permissions.
 * Used by Sidebar (desktop and mobile) and MainApp routing.
 */
export function isNavItemVisible(item: string | { nameKey: string }, ctx: NavItemVisibilityContext): boolean {
  const nameKey = typeof item === 'string' ? item : item.nameKey;

  // Feature Gating
  if (nameKey === 'nav.purchases' && !ctx.isEnabled('SRC-FUN-005')) return false;
  if (nameKey === 'nav.reports' && !ctx.isEnabled('SRC-FUN-012')) return false;
  if (nameKey === 'nav.arqueo' && !ctx.isEnabled('SRC-FUN-007')) return false;
  if (nameKey === 'nav.inventory' && !ctx.isEnabled('SRC-FUN-001')) return false;
  if (nameKey === 'nav.sales' && !ctx.isEnabled('SRC-FUN-002')) return false;
  if (nameKey === 'nav.clients' && !ctx.isEnabled('SRC-FUN-004')) return false;
  if (nameKey === 'nav.suppliers' && !ctx.isEnabled('SRC-FUN-004')) return false;
  if (nameKey === 'nav.bodegas') {
    return canViewBodega({
      role: ctx.role,
      permissions: ctx.permissions,
      flagEnabled: ctx.isEnabled(BODEGA_FEATURE_FLAG),
    });
  }

  // Permissions Gating
  const p = ctx.permissions;
  if (!p || ctx.role === 'admin' || !ctx.role) return true;
  if (nameKey === 'nav.summary' && p.canViewDashboard === false) return false;
  if (nameKey === 'nav.inventory' && p.canViewProducts === false) return false;
  if (nameKey === 'nav.sales' && p.canViewSales === false) return false;
  if (nameKey === 'nav.purchases' && p.canViewPurchaseOrders === false) return false;
  if (nameKey === 'nav.clients' && p.canViewClients === false) return false;
  if (nameKey === 'nav.suppliers' && p.canViewSuppliers === false) return false;
  if (nameKey === 'nav.reports' && p.canViewReports === false) return false;
  if (nameKey === 'nav.arqueo' && p.canViewArqueo === false) return false;

  return true;
}
