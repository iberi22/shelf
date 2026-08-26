/**
 * RBAC abstraction for Shelf Inventory.
 *
 * Single source of truth for roles & permissions, enforced in two layers:
 *
 *  1. **Local enforcement (always active, offline-first)** — the permission
 *     matrix in this module runs in the client/app and in tests. It is the
 *     fallback used while Supabase is unavailable (no URL configured) and the
 *     first line of defense when it is.
 *  2. **Supabase RLS (server-side, when configured)** — `RLS_POLICIES` /
 *     `SUPABASE_RLS_MIGRATION_SQL` export the SQL policy definitions that
 *     mirror the exact same matrix so a malicious client cannot escalate.
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

/** Application roles (stored lowercase; matches `app_role` SQL enum). */
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
 * Canonical permission matrix. Keep in sync with the SQL `has_permission`
 * function in `SUPABASE_RLS_MIGRATION_SQL`.
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

/**
 * Where RBAC is currently enforced:
 * - `supabase-rls`  — Supabase is configured; server-side RLS backs the matrix.
 * - `local-fallback` — Supabase is unavailable; the local matrix is the only
 *   enforcement (offline-first mode).
 */
export type EnforcementMode = 'supabase-rls' | 'local-fallback';

/**
 * Reads the Supabase project URL from Vite env vars without requiring the
 * `@supabase/supabase-js` client (not installed yet). Safe to call in plain
 * Node (Playwright tests, SSR) where `import.meta.env` does not exist.
 */
function readSupabaseEnv(): string | undefined {
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  };
  const url = meta.env?.['VITE_SUPABASE_URL'];
  return typeof url === 'string' && url.trim() !== '' ? url : undefined;
}

/** `true` when a Supabase backend URL is configured. */
export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== undefined;
}

/**
 * Resolves the active enforcement mode. Pass `supabaseEnabled` explicitly in
 * tests/embedding contexts; defaults to the configured environment.
 */
export function getEnforcementMode(supabaseEnabled: boolean = isSupabaseConfigured()): EnforcementMode {
  return supabaseEnabled ? 'supabase-rls' : 'local-fallback';
}

/**
 * Throws `PermissionDeniedError` if `userRole` cannot perform `action`.
 * Safe to call when Supabase is unavailable — it is the local fallback.
 */
export function assertPermission(
  userRole: string | Role,
  action: string | Permission,
  options: { supabaseEnabled?: boolean } = {},
): void {
  const mode = getEnforcementMode(options.supabaseEnabled);
  if (!checkPermission(userRole, action)) {
    throw new PermissionDeniedError(String(userRole), String(action), mode);
  }
}

/**
 * Single entry point for app code. Always enforces the local matrix (defense
 * in depth); when Supabase is configured, RLS additionally enforces the same
 * matrix server-side, so this never weakens security based on the backend.
 */
export function authorize(
  userRole: string | Role,
  action: string | Permission,
  options: { supabaseEnabled?: boolean } = {},
): boolean {
  assertPermission(userRole, action, options);
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Supabase RLS migration (exported for `supabase db pull` / migration files)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-table RLS policy definitions, keyed by table name. Each policy mirrors
 * the permission matrix above via the `has_permission(permission, team_id)`
 * SQL function, so the server-side matrix is defined exactly once.
 *
 * Requirements on the target schema:
 * - every business table has a `team_id uuid not null` column (tenant scope);
 * - `row level security` is already enabled on each table;
 * - the Data API grants `authenticated` access to the tables (see Supabase
 *   "Exposing a Table to the Data API" — RLS then controls the rows).
 */
export const RLS_POLICIES: Readonly<Record<string, readonly string[]>> = {
  products: [
    `create policy "products_select_team_member" on public.products
  for select to authenticated
  using (public.current_role(team_id) is not null);`,
    `create policy "products_insert_editor" on public.products
  for insert to authenticated
  with check (public.has_permission('canEditProducts', team_id));`,
    `create policy "products_update_editor" on public.products
  for update to authenticated
  using (public.has_permission('canEditProducts', team_id))
  with check (public.has_permission('canEditProducts', team_id));`,
    `create policy "products_delete_editor" on public.products
  for delete to authenticated
  using (public.has_permission('canEditProducts', team_id));`,
  ],
  sales: [
    `create policy "sales_select_team_member" on public.sales
  for select to authenticated
  using (public.current_role(team_id) is not null);`,
    `create policy "sales_insert_editor" on public.sales
  for insert to authenticated
  with check (public.has_permission('canEditProducts', team_id));`,
    `create policy "sales_update_editor" on public.sales
  for update to authenticated
  using (public.has_permission('canEditProducts', team_id))
  with check (public.has_permission('canEditProducts', team_id));`,
    `create policy "sales_delete_editor" on public.sales
  for delete to authenticated
  using (public.has_permission('canEditProducts', team_id));`,
  ],
  audit_logs: [
    `create policy "audit_logs_select_reporter" on public.audit_logs
  for select to authenticated
  using (public.has_permission('canViewReports', team_id));`,
    `create policy "audit_logs_insert_member" on public.audit_logs
  for insert to authenticated
  with check (public.current_role(team_id) is not null);`,
  ],
  team_members: [
    `create policy "team_members_select_member" on public.team_members
  for select to authenticated
  using (public.current_role(team_id) is not null);`,
    `create policy "team_members_insert_admin" on public.team_members
  for insert to authenticated
  with check (public.has_permission('canManageTeam', team_id));`,
    `create policy "team_members_update_admin" on public.team_members
  for update to authenticated
  using (public.has_permission('canManageTeam', team_id))
  with check (public.has_permission('canManageTeam', team_id));`,
    `create policy "team_members_delete_admin" on public.team_members
  for delete to authenticated
  using (public.has_permission('canManageTeam', team_id));`,
  ],
};

/**
 * Complete, ready-to-run migration: role enum, `team_members` table, helper
 * functions and every RLS policy above. Paste into a Supabase migration
 * (or `supabase migration new <name>` + this body) to deploy.
 */
export const SUPABASE_RLS_MIGRATION_SQL = `-- ============================================================================
-- Shelf Inventory — RBAC + Row Level Security (mirror of lib/rbac.ts matrix)
-- Generated from apps/shelf-inventory/lib/rbac.ts. Keep both in sync.
-- ============================================================================

-- 1) Role enum -----------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'collaborator', 'vendedor', 'viewer');
exception
  when duplicate_object then null;
end $$;

-- 2) team_members: source of truth for roles ----------------------------------
create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

alter table public.team_members enable row level security;

-- Data API exposure (Supabase: newly created tables may need explicit grants):
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;

-- 3) Helper functions -----------------------------------------------------------
-- current_role(team_id): role of the JWT user within a team.
-- SECURITY DEFINER is intentional here: it lets policies read team_members
-- without recursing into its own RLS. It is safe ONLY because the body is
-- gated on auth.uid() (never a caller-supplied user_id) and EXECUTE is
-- revoked from anon/public.
create or replace function public.current_role(p_team_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select tm.role
  from public.team_members tm
  where tm.user_id = auth.uid()
    and tm.team_id = p_team_id
  limit 1
$$;

revoke execute on function public.current_role(uuid) from public, anon;
grant execute on function public.current_role(uuid) to authenticated;

-- has_permission(permission, team_id): server-side mirror of PERMISSION_MATRIX.
-- Same SECURITY DEFINER rationale as current_role.
create or replace function public.has_permission(p_permission text, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case (select tm.role
               from public.team_members tm
               where tm.user_id = auth.uid()
                 and tm.team_id = p_team_id
               limit 1)
    when 'admin'        then true
    when 'collaborator' then p_permission in ('canEditProducts', 'canViewReports', 'canExportData')
    when 'vendedor'     then p_permission = 'canEditProducts'
    when 'viewer'       then false
    else false
  end
$$;

revoke execute on function public.has_permission(text, uuid) from public, anon;
grant execute on function public.has_permission(text, uuid) to authenticated;

-- 4) RLS policies (see RLS_POLICIES in lib/rbac.ts) -----------------------------
-- Notes:
--  * Policies target the role 'authenticated' via the TO clause instead of
--    legacy role()-based checks, which break under anonymous sign-ins.
--  * UPDATE policies always pair USING with WITH CHECK (Prevent row reassignment).
--  * Roles come from team_members (server-side), never from client-editable
--    profile metadata, which the client can forge in the JWT.
--  * canExportData has no table policy: exports run through an Edge Function
--    that calls  select public.has_permission('canExportData', :team_id);
--    before streaming the file.
--  * Report views must use  create view ... with (security_invoker = true)
--    or they would bypass RLS; gate them with
--    public.has_permission('canViewReports', team_id).

${Object.entries(RLS_POLICIES)
  .map(([table, policies]) => {
    const banner = `-- ${table} ${'-'.repeat(Math.max(0, 74 - table.length))}`;
    return [banner, ...policies].join('\n');
  })
  .join('\n\n')}
`;
