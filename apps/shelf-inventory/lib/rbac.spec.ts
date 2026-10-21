/**
 * Unit tests for lib/rbac.ts — every role × permission combination, plus the
 * assertPermission / authorize / PermissionDeniedError enforcement path.
 *
 * Ported from the former Playwright suite in tests/rbac.spec.ts so it runs in
 * the Vitest unit gate (lib/ is included by vitest.config.ts).
 */
import { describe, expect, it } from 'vitest';
import * as rbac from './rbac';
import {
  assertPermission,
  authorize,
  checkPermission,
  getEnforcementMode,
  PERMISSION_MATRIX,
  PERMISSIONS,
  type Permission,
  PermissionDeniedError,
  ROLES,
  type Role,
} from './rbac';

// Independent expectation table (deliberately duplicated so the tests verify
// the exported matrix instead of merely echoing it).
const EXPECTED: Record<Role, Record<Permission, boolean>> = {
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

describe('checkPermission: role × permission matrix', () => {
  for (const role of ROLES) {
    for (const permission of PERMISSIONS) {
      it(`${role} ${permission} = ${EXPECTED[role][permission]}`, () => {
        expect(checkPermission(role, permission)).toBe(EXPECTED[role][permission]);
      });
    }
  }

  it('exported matrix matches the expected table', () => {
    expect(PERMISSION_MATRIX).toEqual(EXPECTED);
  });

  it('unknown role is denied for every action', () => {
    for (const permission of PERMISSIONS) {
      expect(checkPermission('superuser', permission)).toBe(false);
    }
  });

  it('unknown action is denied for every role', () => {
    for (const role of ROLES) {
      expect(checkPermission(role, 'canDeleteDatabase')).toBe(false);
      expect(checkPermission(role, '')).toBe(false);
    }
  });

  it('non-string garbage input is denied', () => {
    expect(checkPermission(undefined as unknown as Role, 'canEditProducts')).toBe(false);
    expect(checkPermission(null as unknown as Role, 'canEditProducts')).toBe(false);
    expect(checkPermission('admin', undefined as unknown as Permission)).toBe(false);
  });

  it('role hierarchy is monotone (admin >= collaborator >= vendedor >= viewer)', () => {
    for (const permission of PERMISSIONS) {
      const granted = (role: Role) => checkPermission(role, permission);
      expect(granted('collaborator') === false || granted('admin')).toBe(true);
      expect(granted('vendedor') === false || granted('collaborator')).toBe(true);
      expect(granted('viewer') === false || granted('vendedor')).toBe(true);
    }
    for (const permission of PERMISSIONS) {
      expect(checkPermission('viewer', permission)).toBe(false);
    }
  });
});

describe('assertPermission / authorize (local enforcement)', () => {
  it('admin is allowed every action', () => {
    for (const permission of PERMISSIONS) {
      expect(() => assertPermission('admin', permission)).not.toThrow();
    }
  });

  it('viewer is denied every action', () => {
    for (const permission of PERMISSIONS) {
      expect(() => assertPermission('viewer', permission)).toThrow(PermissionDeniedError);
    }
  });

  it('denied error carries role/action/mode context', () => {
    try {
      assertPermission('viewer', 'canExportData');
      expect.unreachable('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionDeniedError);
      const denied = error as PermissionDeniedError;
      expect(denied.role).toBe('viewer');
      expect(denied.action).toBe('canExportData');
      expect(denied.mode).toBe('local');
      expect(denied.message).toContain('viewer');
      expect(denied.message).toContain('canExportData');
    }
  });

  it('authorize denies collaborator canManageTeam, vendedor canViewReports / canExportData', () => {
    expect(() => authorize('collaborator', 'canManageTeam')).toThrow(PermissionDeniedError);
    expect(() => authorize('vendedor', 'canViewReports')).toThrow(PermissionDeniedError);
    expect(() => authorize('vendedor', 'canExportData')).toThrow(PermissionDeniedError);
  });

  it('authorize returns true for permitted combinations', () => {
    expect(authorize('admin', 'canManageTeam')).toBe(true);
    expect(authorize('collaborator', 'canExportData')).toBe(true);
    expect(authorize('vendedor', 'canEditProducts')).toBe(true);
  });

  it('getEnforcementMode is always the local matrix', () => {
    expect(getEnforcementMode()).toBe('local');
  });

  it('module exports exactly the local RBAC surface (no backend-specific exports)', () => {
    // Regression guard: any new or restored export must be a deliberate change here.
    expect(Object.keys(rbac).sort()).toEqual(
      [
        'PERMISSIONS',
        'PERMISSION_MATRIX',
        'Permission',
        'PermissionDeniedError',
        'ROLES',
        'Role',
        'assertPermission',
        'authorize',
        'checkPermission',
        'getEnforcementMode',
        'isPermission',
        'isRole',
      ].sort(),
    );
  });
});
