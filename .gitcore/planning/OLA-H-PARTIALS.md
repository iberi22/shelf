# Ola H — Close Partial Features (Shelf → ~93%)

**Fecha:** 2026-07-17  
**Baseline SSOT:** ~88% → **post-integration ~91%** (16 implemented / 5 partial / 0 skeleton)  
**Repo:** `iberi22/shelf` · trabajo preferido sobre `develop`  
**Orquestación:** Jules async (`jules` label only)

## Objetivo

Cerrar gaps **implementables y acotados** de los 5 SRC partials sin redesign:

| SRC | Gap | Issue Ola H |
|-----|-----|-------------|
| SRC-PQC-001 (78%) | `EDGE_MESH_ENVELOPE` no en `shouldEncryptMessage` | 01 |
| SRC-FUN-013 (72%) | Invite `UserRole` ≠ mesh `P2PRole` | 02 |
| SRC-FUN-014 (82%) | Sin mapeo interactivo de columnas CSV | 03 |
| SRC-FUN-009 (78%) | Stripe checkout sin backend + UX offline | 04 |
| SRC-EDGE-001 (78%) | Entity ACL surgical / Phase D maloca | **fuera de ola** (más grande) |

## File ownership map (anti-conflicto)

| File | Issues |
|------|--------|
| `packages/p2p-mesh-core/src/p2p.ts` | **01 only** |
| `packages/p2p-mesh-core/tests/security.test.ts` | **01 only** |
| `packages/p2p-mesh-core/src/types.ts` | **02 only** |
| `apps/shelf-inventory/components/InviteMemberModal.tsx` | **02 only** |
| `apps/shelf-inventory/components/BranchConfig.tsx` | **02 only** (owner row) |
| `apps/shelf-inventory/lib/csvProductImport.ts` | **03 only** |
| `apps/shelf-inventory/components/ImportCSVModal.tsx` | **03 only** |
| `apps/shelf-inventory/tests/csv-import.spec.ts` | **03 only** |
| `apps/shelf-inventory/components/SubscriptionModal.tsx` | **04 only** |
| `apps/shelf-inventory/components/NetworkConfig.tsx` | **04 only** (plan card copy/confirm) |
| `apps/shelf-inventory/tests/subscription-gates.spec.ts` | **04 only** |

**No shared files between issues → all 4 can run in parallel.**

## Merge order (if any conflict appears)

1. 01 (crypto core)  
2. 02 / 03 / 04 (app features, independent)  
3. Docs SSOT bump (humano o issue 05 docs-only)

## Progress tracker

| # | Issue | Task | Files | Status |
|---|-------|------|-------|--------|
| 01 | [#297](https://github.com/iberi22/shelf/issues/297) | Encrypt EDGE_MESH_ENVELOPE dual-ready | `p2p.ts`, `security.test.ts` | Integrated |
| 02 | [#298](https://github.com/iberi22/shelf/issues/298) | Unify invite ↔ mesh roles | `types.ts`, `InviteMemberModal`, `BranchConfig` | Integrated |
| 03 | [#299](https://github.com/iberi22/shelf/issues/299) | CSV interactive column map | `csvProductImport`, `ImportCSVModal` | Integrated |
| 04 | [#300](https://github.com/iberi22/shelf/issues/300) | Monetization offline/Stripe fallback | `SubscriptionModal`, `NetworkConfig` | Integrated |

**Launched:** 2026-07-17 · labels `jules` applied (trigger-only protocol).

Also open (pre-existing): [#272](https://github.com/iberi22/shelf/issues/272) Sentry offline queue — not part of Ola H.

## Monitor

```powershell
gh pr list --repo iberi22/shelf --state open --json number,title,headRefName,mergeable
gh issue list --repo iberi22/shelf --state open --label jules
# optional CLI:
jules remote list --session
```

## Trigger protocol

```powershell
# After issues created:
foreach ($n in 297..300) {
  gh issue edit $n --repo iberi22/shelf --add-label jules
}
```

## DO NOT

- Touch `packages/edge-mesh` maloca extract (Phase D — separate epic)
- Add new npm dependencies unless unavoidable
- Claim 100% project-wide in SSOT until partials re-audited
- Create `.patch` / loose root scripts
