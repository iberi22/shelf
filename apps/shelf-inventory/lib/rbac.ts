/**
 * RBAC abstraction for Shelf Inventory.
 *
 * Single source of truth for roles & permissions. Enforcement is local and
 * offline-first: the permission matrix in this module runs in the client/app
 * and in tests.
 *
 * The permission matrix (role x action):
 *
 * | role          | canEditProducts | canViewReports | canManageTeam | canExportData |
 * |---------------|-----------------|----------------|---------------|---------------|
 * | admin         | ✅              | ✅             | ✅            | ✅            |
 * | collaborator  | ✅              | ✅             | ❌            | ✅            |
 * | vendedor      | ✅              | ❌             | ❌            | ❌            |
 * | viewer        | ❌              | ❌             | ❌            | ❌            |
 */

/** Application roles (stored lowercase). */
export const Role = {
  admin: 'admin',
  collaborator: 'collaborator',
  vendedor: 'vendedor',
  viewer: 'viewer',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** Every known role, for iteration & validation. */
export const ROLES: readonly Role[] = Object.values(Role);

/** Business actions protected by RBAC. */
export const Permission = {
  canEditProducts: 'canEditProducts',
  canViewReports: 'canViewReports',
  canManageTeam: 'canManageTeam',
  canExportData: 'canExportData',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/** Alias so call sites read naturally: `checkPermission(role, action)`. */
export type PermissionAction = Permission;

/** Every known permission, for iteration & validation. */
export const PERMISSIONS: readonly Permission[] = Object.values(Permission);

/**
 * Canonical permission matrix.
 */
export const PERMISSION_MATRIX: Record<Role, Record<Permission, boolean>> = {
  admin: {
    canEditProducts: true,
    canViewReports: true,
    canManageTeam: true,
    canExportData: true,
  },
  collaborator: {
    canEditProducts: true,
    canViewReports: true,
    canManageTeam: false,
    canExportData: true,
  },
  vendedor: {
    canEditProducts: true,
    canViewReports: false,
    canManageTeam: false,
    canExportData: false,
  },
  viewer: {
    canEditProducts: false,
    canViewReports: false,
    canManageTeam: false,
    canExportData: false,
  },
};

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

export function isPermission(value: unknown): value is Permission {
  return PERMISSIONS.includes(value as Permission);
}

/**
 * Pure matrix lookup. Returns `false` (deny by default) for unknown roles or
 * actions so bad data from the P2P mesh or an old client can never escalate.
 */
export function checkPermission(userRole: string | Role, action: string | Permission): boolean {
  if (!isRole(userRole) || !isPermission(action)) {
    return false;
  }
  return PERMISSION_MATRIX[userRole][action];
}

/** Error thrown by `assertPermission` / `authorize` when access is denied. */
export class PermissionDeniedError extends Error {
  readonly role: string;
  readonly action: string;
  readonly mode: EnforcementMode;

  constructor(role: string, action: string, mode: EnforcementMode) {
    super(`Permission denied: role "${role}" cannot perform "${action}" (enforcement: ${mode})`);
    this.name = 'PermissionDeniedError';
    this.role = role;
    this.action = action;
    this.mode = mode;
  }
}

/** RBAC is enforced locally (offline-first); the matrix is the only enforcement. */
export type EnforcementMode = 'local';

/** Returns the enforcement mode. Always `'local'`. */
export function getEnforcementMode(): EnforcementMode {
  return 'local';
}

/**
 * Throws `PermissionDeniedError` if `userRole` cannot perform `action`.
 */
export function assertPermission(userRole: string | Role, action: string | Permission): void {
  if (!checkPermission(userRole, action)) {
    throw new PermissionDeniedError(String(userRole), String(action), getEnforcementMode());
  }
}

/**
 * Single entry point for app code. Enforces the local matrix.
 */
export function authorize(userRole: string | Role, action: string | Permission): boolean {
  assertPermission(userRole, action);
  return true;
}
