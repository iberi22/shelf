/**
 * Unit tests for lib/rbac.ts — every role × permission combination, plus the
 * Supabase RLS migration strings and the local-fallback enforcement path.
 *
 * Pure-logic tests (no browser/page), consistent with csv-import.spec.ts.
 */
import { expect, test } from '@playwright/test';
import {
  assertPermission,
  authorize,
  checkPermission,
  getEnforcementMode,
  isSupabaseConfigured,
  PERMISSION_MATRIX,
  PERMISSIONS,
  type Permission,
  PermissionDeniedError,
  RLS_POLICIES,
  ROLES,
  type Role,
  SUPABASE_RLS_MIGRATION_SQL,
} from '../lib/rbac';

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

// ─── checkPermission: all 16 role × permission combinations ────────────────

for (const role of ROLES) {
  for (const permission of PERMISSIONS) {
    test(`checkPermission: ${role} ${permission} = ${EXPECTED[role][permission]}`, () => {
      expect(checkPermission(role, permission)).toBe(EXPECTED[role][permission]);
    });
  }
}

test('checkPermission: exported matrix matches the expected table', () => {
  expect(PERMISSION_MATRIX).toEqual(EXPECTED);
});

test('checkPermission: unknown role is denied for every action', () => {
  for (const permission of PERMISSIONS) {
    expect(checkPermission('superuser', permission)).toBe(false);
  }
});

test('checkPermission: unknown action is denied for every role', () => {
  for (const role of ROLES) {
    expect(checkPermission(role, 'canDeleteDatabase')).toBe(false);
    expect(checkPermission(role, '')).toBe(false);
  }
});

test('checkPermission: non-string garbage input is denied', () => {
  expect(checkPermission(undefined as unknown as Role, 'canEditProducts')).toBe(false);
  expect(checkPermission(null as unknown as Role, 'canEditProducts')).toBe(false);
  expect(checkPermission('admin', undefined as unknown as Permission)).toBe(false);
});

test('role hierarchy is strictly monotone (admin >= collaborator >= vendedor >= viewer)', () => {
  for (const permission of PERMISSIONS) {
    const granted = (role: Role) => checkPermission(role, permission);
    // Boolean implication: a lower role may only have a permission that the
    // role above it also has.
    expect(granted('collaborator') === false || granted('admin')).toBe(true);
    expect(granted('vendedor') === false || granted('collaborator')).toBe(true);
    expect(granted('viewer') === false || granted('vendedor')).toBe(true);
  }
  // viewer must have zero permissions.
  for (const permission of PERMISSIONS) {
    expect(checkPermission('viewer', permission)).toBe(false);
  }
});

// ─── assertPermission / authorize (local enforcement + fallback) ────────────

test('assertPermission: admin is allowed every action', () => {
  for (const permission of PERMISSIONS) {
    expect(() => assertPermission('admin', permission)).not.toThrow();
  }
});

test('assertPermission: viewer is denied every action', () => {
  for (const permission of PERMISSIONS) {
    expect(() => assertPermission('viewer', permission)).toThrow(PermissionDeniedError);
  }
});

test('assertPermission: denied error carries role/action/mode context', () => {
  try {
    assertPermission('viewer', 'canExportData');
    expect.unreachable('expected throw');
  } catch (error) {
    expect(error).toBeInstanceOf(PermissionDeniedError);
    const denied = error as PermissionDeniedError;
    expect(denied.role).toBe('viewer');
    expect(denied.action).toBe('canExportData');
    expect(['supabase-rls', 'local-fallback']).toContain(denied.mode);
    expect(denied.message).toContain('viewer');
    expect(denied.message).toContain('canExportData');
  }
});

test('authorize: denies collaborator canManageTeam / vendedor canViewReports gracefully', () => {
  expect(() => authorize('collaborator', 'canManageTeam')).toThrow(PermissionDeniedError);
  expect(() => authorize('vendedor', 'canViewReports')).toThrow(PermissionDeniedError);
  expect(() => authorize('vendedor', 'canExportData')).toThrow(PermissionDeniedError);
});

test('authorize: returns true for permitted combos', () => {
  expect(authorize('admin', 'canManageTeam')).toBe(true);
  expect(authorize('collaborator', 'canExportData')).toBe(true);
  expect(authorize('vendedor', 'canEditProducts')).toBe(true);
});

// ─── Supabase availability + local fallback ─────────────────────────────────

test('isSupabaseConfigured: safe to call without a Supabase client', () => {
  // Must not throw in plain Node (Playwright/SSR) where import.meta.env is absent.
  expect(typeof isSupabaseConfigured()).toBe('boolean');
});

test('getEnforcementMode: explicit flags resolve the mode', () => {
  expect(getEnforcementMode(true)).toBe('supabase-rls');
  expect(getEnforcementMode(false)).toBe('local-fallback');
});

test('getEnforcementMode: default follows isSupabaseConfigured()', () => {
  expect(getEnforcementMode()).toBe(isSupabaseConfigured() ? 'supabase-rls' : 'local-fallback');
});

test('authorize: local matrix is enforced even when Supabase is configured (defense in depth)', () => {
  expect(() => authorize('viewer', 'canManageTeam', { supabaseEnabled: true })).toThrow(PermissionDeniedError);
  expect(() => authorize('vendedor', 'canViewReports', { supabaseEnabled: true })).toThrow(PermissionDeniedError);
  expect(authorize('admin', 'canExportData', { supabaseEnabled: true })).toBe(true);
});

test('local fallback: enforcement works when Supabase is unavailable', () => {
  expect(getEnforcementMode(false)).toBe('local-fallback');
  expect(() => assertPermission('viewer', 'canEditProducts', { supabaseEnabled: false })).toThrow(
    PermissionDeniedError,
  );
  expect(authorize('collaborator', 'canEditProducts', { supabaseEnabled: false })).toBe(true);
});

// ─── Supabase RLS migration artifacts ───────────────────────────────────────

test('RLS: migration contains role enum, team table and RLS enablement', () => {
  expect(SUPABASE_RLS_MIGRATION_SQL).toContain('app_role');
  expect(SUPABASE_RLS_MIGRATION_SQL).toContain('team_members');
  expect(SUPABASE_RLS_MIGRATION_SQL).toContain('enable row level security');
});

test('RLS: every table has at least one policy, and full coverage exists', () => {
  for (const [table, policies] of Object.entries(RLS_POLICIES)) {
    expect(table.trim().length).toBeGreaterThan(0);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toContain('create policy');
      expect(policy).toContain(`on public.${table}`);
    }
  }
  // products & sales are the core tables: SELECT + INSERT + UPDATE + DELETE.
  for (const table of ['products', 'sales']) {
    const joined = RLS_POLICIES[table].join('\n');
    expect(joined).toContain('for select');
    expect(joined).toContain('for insert');
    expect(joined).toContain('for update');
    expect(joined).toContain('for delete');
    expect(joined).toContain('with check'); // UPDATE policies must pair USING+WITH CHECK
  }
});

test('RLS: every permission key is represented in the migration', () => {
  for (const permission of PERMISSIONS) {
    expect(SUPABASE_RLS_MIGRATION_SQL).toContain(permission);
  }
});

test('RLS: avoids deprecated/unsafe patterns', () => {
  expect(SUPABASE_RLS_MIGRATION_SQL).not.toContain('auth.role()');
  expect(SUPABASE_RLS_MIGRATION_SQL).not.toContain('user_metadata');
  expect(SUPABASE_RLS_MIGRATION_SQL).toContain('to authenticated');
  expect(SUPABASE_RLS_MIGRATION_SQL).toContain('auth.uid()');
});

test('RLS: team management policies are admin-only (canManageTeam)', () => {
  const teamPolicies = RLS_POLICIES.team_members.join('\n');
  expect(teamPolicies).toContain(`has_permission('canManageTeam', team_id)`);
});

test('RLS: report access is gated by canViewReports', () => {
  const auditPolicies = RLS_POLICIES.audit_logs.join('\n');
  expect(auditPolicies).toContain(`has_permission('canViewReports', team_id)`);
});
