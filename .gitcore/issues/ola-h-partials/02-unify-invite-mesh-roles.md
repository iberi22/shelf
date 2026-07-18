# [Ola H · 02] Unify team invite roles with mesh P2PRole (SRC-FUN-013)

> Wave: **Ola H — Close Partial Features**.  
> SSOT gap: SRC-FUN-013 ~72% — invite UI uses `UserRole = owner|admin|member` while mesh enforcement uses `P2PRole = admin|collaborator|vendedor` + `PeerPermissions`.  
> Prefer PR base: **`develop`**.

## Web Research Required

1. Search: `"role mapping UI product team admin collaborator viewer"` patterns for dual role systems.
2. Prefer **single source of truth** = mesh `P2PRole` for invites; keep local **owner** only for the account that owns the node (not inviteable).

## Exact Technical Context

### Types (`packages/p2p-mesh-core/src/types.ts` ~257 lines)

```ts
// ~line 133
export type UserRole = "owner" | "admin" | "member";
// ~line 135
export type P2PRole = "admin" | "collaborator" | "vendedor" | "custom";
// ~line 137
export interface TeamMember {
  id: string;
  email: string | null;
  role: UserRole;  // ← PROBLEM: invite stores member/admin only
}
```

### Invite UI (`apps/shelf-inventory/components/InviteMemberModal.tsx` ~136 lines)

- State: `useState<UserRole>('member')` ~line 19
- Deep link query: `role: inviteRole` in `generateInviteLink` ~lines 23–31
- Select options: only `member` | `admin` ~lines 119–120
- Dispatch: `ADD_TEAM_MEMBER` with `{ id, email, role }` ~lines 51–58

### Mesh presets (`apps/shelf-inventory/components/P2PSyncManager.tsx` ~lines 39–84)

```ts
const permissionPresets: Record<'admin' | 'collaborator' | 'vendedor', PeerPermissions> = { ... }
```

### BranchConfig owner row (`apps/shelf-inventory/components/BranchConfig.tsx` ~line 37)

```ts
[{ id: 'owner', email: user?.email ?? 'owner@example.com', role: 'owner' as const }, ...state.teamMembers]
```

### Desired model

1. **Keep** `UserRole` for display of local owner if needed, OR expand `TeamMember.role` to:

```ts
export type TeamMemberRole = "owner" | P2PRole; // owner = local only, never invite
export interface TeamMember {
  id: string;
  email: string | null;
  role: TeamMemberRole;
}
```

2. Invite modal options: **`admin` | `collaborator` | `vendedor`** (labels via i18n keys already used in P2P UI: `p2pSync.roleAdmin` / `roleCollaborator` / `roleVendedor` or settings.team keys — add EN/ES strings if missing in `locales/en.json` + `es.json` only).

3. Deep link `?role=` must carry mesh role (`collaborator` not `member`).

4. When adding team member, store mesh role. Map legacy:
   - `member` → `collaborator`
   - keep `admin` → `admin`
   - `owner` remains only for synthetic owner row in BranchConfig

5. Export a small mapper in types or a tiny helper in app:

```ts
export function teamRoleToP2PRole(role: TeamMemberRole): P2PRole {
  if (role === 'owner' || role === 'admin') return 'admin';
  if (role === 'vendedor') return 'vendedor';
  if (role === 'custom') return 'custom';
  return 'collaborator'; // collaborator + legacy member
}
```

Place mapper in `packages/p2p-mesh-core/src/types.ts` or `apps/shelf-inventory/lib/teamRoles.ts` (prefer package export if TeamMember lives there).

## Problem

Invites advertise org-style roles that **do not match** PeerPermissions presets. Joining peers get ambiguous role strings; mesh UI and invite UI diverge → partial multi-user AC.

## Acceptance Criteria

- [ ] Invite modal exposes mesh roles: admin, collaborator, vendedor (`data-testid="invite-role-select"` options)
- [ ] Default invite role = `collaborator` (not `member`)
- [ ] Generated invite URL includes mesh role in `role` query param
- [ ] `TeamMember.role` type accepts mesh roles + `owner` (for local owner row)
- [ ] Backward compatibility: loading old state with `member` still works (treat as collaborator in UI)
- [ ] `BranchConfig` owner row still shows owner
- [ ] No TypeScript errors in touched files
- [ ] Optional: unit-ish assertion or extend existing invite test only if cheap — do not rewrite all P2P E2E

## Files to Modify

| File | Change |
|------|--------|
| `packages/p2p-mesh-core/src/types.ts` | TeamMember role type + optional mapper |
| `apps/shelf-inventory/components/InviteMemberModal.tsx` | Role select + defaults |
| `apps/shelf-inventory/components/BranchConfig.tsx` | Type-safe owner row if needed |
| `apps/shelf-inventory/locales/en.json` + `es.json` | Labels if missing |

**DO NOT touch:** `P2PSyncManager.tsx` permission matrix (reuse existing presets conceptually), `p2p.ts`, CSV import, SubscriptionModal.

**NEVER create `.patch` files in repo root.**

## Verification

```bash
pnpm --dir apps/shelf-inventory exec tsc --noEmit
# if types package builds separately:
pnpm --dir packages/p2p-mesh-core test
```

## Dependencies and Merge Order

- **Depends on:** nothing
- **Can run in parallel with:** 01, 03, 04
- **SRC-ID:** SRC-FUN-013
