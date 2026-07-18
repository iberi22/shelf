# Plan de sesión — Features honesty + cierre de gaps

**Fecha:** 2026-07-17  
**Objetivo:** (1) SSOT de features 100% honesto, (2) maximizar % real en esta sesión sin romper P2P verde.

---

## Principios

1. **No inventar 100%.** Solo subir % con código o con reescritura consciente de ACs.
2. **P2P gate no se regresa.** Tras cambios mesh/authz, re-run:
   `multi-peer`, `edge-mesh-sync`, `p2p-sync`, `offline-sync`, `p2p-conflict-resolution`, `p2p-three-node-permissions`, `security-sync`.
3. **Product decisions explícitas** cuando el AC histórico miente (Firebase, Stripe live).
4. **Commits en `develop`**, mensajes con SRC-ID.

---

## Fase 0 — Docs SSOT (esta sesión, primero) ✅ en curso

| # | Entrega | Archivo |
|---|---------|---------|
| 0.1 | Summary + % + gaps | `.gitcore/features.json` |
| 0.2 | Detalle paths/tests/next | `.gitcore/features-details.json` |
| 0.3 | Index raíz | `features.json` |
| 0.4 | App status human | `apps/shelf-inventory/FEATURES_STATUS.md` |
| 0.5 | Requirements tables | `docs/src/REQUIREMENTS.md`, `NON-FUNCTIONAL.md` |
| 0.6 | Per-feature MD headers | `docs/src/features/*`, `docs/src/non-functional/*` |
| 0.7 | Task board | `.gitcore/planning/TASK.md` |
| 0.8 | Agents/README pointers | `AGENTS.md`, `README.md` |

**Done when:** ningún doc de status dice “Firebase Auth 100%” o “21/21 implemented”.

---

## Fase 1 — Quick wins producto (P0, ~1–2 h)

### 1.1 SRC-FUN-009 — Tier real (mayor ROI)

| Acción | Detalle |
|--------|---------|
| Fix | `SubscriptionContext` lee `user.subscriptionTier` de `AuthContext` / localAuth |
| Ads | `showAds = isFree` vuelve a tener sentido |
| Guest | `loginAsGuest` → tier `free` o flag `demoFullAccess` explícito (no pyme silencioso) |
| Tests | Unit/smoke: free user ve ads gate; pro no |
| % esperado | 42% → **~65–75%** (Stripe live sigue partial) |

### 1.2 SRC-FUN-003 — Dashboard charts reales

| Acción | Detalle |
|--------|---------|
| Fix | Reusar agregación de `Reports.tsx` (salesByDay, topProducts) en Dashboard |
| Remove/gate | Fake `ProChartsTeaserCard` data o solo upsell vacío |
| % esperado | 68% → **~88–92%** |

### 1.3 SRC-FUN-008 — Alinear AC (docs) o guest tier

| Opción A (recomendada sesión) | Reescribir AC a: local email/password, seed recovery, device list, P2P multi-device; cloud = ROADMAP-003 |
| Opción B | Implementar Firebase (fuera de scope realista de una sesión) |
| Fix mínimo código | Guest no es `pyme` por defecto |
| % esperado docs | honest 40% **con AC real** → puede reportarse **~75% local-auth** |

---

## Fase 2 — Gaps funcionales medianos (P1, ~1–2 h)

### 2.1 SRC-FUN-005 — Purchase Orders cancelled

- Tipo `status: 'pending' | 'received' | 'cancelled'`
- UI cancelar (sin tocar stock)
- Cypress o Playwright: create → receive → stock

**%:** 84 → **~92**

### 2.2 SRC-FUN-006 — Scanner polish

- `formatsToSupport` EAN_13, EAN_8, UPC_A, CODE_128, QR_CODE
- Toast/vibrate on success

**%:** 82 → **~90**

### 2.3 SRC-FUN-014 — CSV import E2E mínimo

- Playwright con `template.csv` fixture
- Assert product aparece

**%:** 78 → **~85**

### 2.4 SRC-FUN-013 — AC rewrite a modelo P2P

- Docs: roles admin/collaborator/vendedor + PeerPermissions
- No prometer Firebase org

**% reportado:** 58 se mantiene o sube a **~70** si se cierran ACs al modelo real

---

## Fase 3 — Mesh/PQC (solo si queda tiempo; no romper gate)

| # | Item | Riesgo | Acción sesión |
|---|------|--------|---------------|
| 3.1 | ROADMAP-010 YJS encrypt | **Alto** (rompió multi-peer antes) | Solo diseño dual-ready + flag OFF default; **no forzar ON** |
| 3.2 | invite-and-sync master | Medio | Debug “CHANGE_ROLE from non-master” si hay tiempo |
| 3.3 | Phase D | Alto/largo | No en esta sesión (solo doc) |
| 3.4 | GPU-001 | — | Dejar skeleton; no fake % |

---

## Fase 4 — Validación + commit

1. `pnpm --dir packages/edge-mesh test`
2. Playwright gate 7 archivos (9 tests)
3. Actualizar `%` en `features.json` + `features-details.json` solo donde haya evidencia
4. Commit `docs/feat(...): ... (SRC-*)` en `develop`
5. Push develop (pre-push build)

---

## Orden de ejecución (checklist)

```
[x] 0.1 features.json honesty
[x] 0.2 features-details.json
[x] 0.3–0.8 remaining docs sync
[x] 1.1 SubscriptionContext tier wire
[x] 1.2 Dashboard real charts
[x] 1.3 Auth guest free + demo flag for E2E
[x] 2.1 PO cancelled
[x] 2.2 Scanner formats/feedback
[ ] 2.3 CSV E2E (deferred if time)
[x] 2.4 Multi-user AC docs (docs pass)
[ ] 4.* re-validate + push
```

## Fuera de scope (esta sesión)

- Full Stripe webhooks production
- Firebase/Firestore real
- GPU executeTask real
- Phase D maloca extract
- GHA billing/runner infra (solo documentar)

## Meta de salida de sesión

| Métrica | Entrada auditoría | Meta sesión |
|---------|------------------:|------------:|
| Project average | 75% | **80–84%** |
| Implemented count | 8 | **11–13** |
| P0 mentiras runtime | tier hardcode + dashboard fake | **eliminadas** |
| Docs consistency | drift | **SSOT único** |

---

## Criterio de éxito

- Cualquier agente que lea `.gitcore/features.json` ve la misma verdad que el código.
- Free tier real (ads/gates) funciona sin hardcode.
- Dashboard muestra series reales de ventas.
- Gate P2P sigue verde.
