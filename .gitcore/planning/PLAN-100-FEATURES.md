# Plan por fases → 100% features Shelf

**Meta:** cada SRC en `implemented` + `implementation_percentage: 100` con ACs **cumplidos o reescritos conscientemente** al producto real (offline-first).  
**SSOT:** `.gitcore/features.json` + `features-details.json`  
**Regla:** no declarar 100% sin código o sin AC realineado y testeado.

---

## Definición de “100%”

| Caso | Cómo se cierra al 100% |
|------|------------------------|
| Feature core offline-first | ACs implementados + test E2E/unit |
| Feature cloud histórica (Firebase/Stripe) | **Opción A:** implementar cloud real · **Opción B:** reescribir AC a modelo local/P2P y cerrar gaps locales |
| Skeleton (GPU) | Implementar runtime real o **sacar del contador de producto** (ADR) |
| Mesh/PQC | Paths verdes + authz/encrypt documentados y testeados |

---

## Fases

| Fase | Nombre | Features foco | Meta avg | Estado |
|------|--------|---------------|----------|--------|
| **A** | Honesty + P0 quick wins | 003,005,006,009, docs | ~78% | ✅ done |
| **B** | Product completion (FUN residual) | ~85% | ✅ | |
| **C** | Monetization & auth product truth | ~90% | ✅ |
| **D** | Mesh security | PQC, CRDT, EDGE, P2P invite | ~94% | pending |
| **E** | Edge Phase D + dual-path collapse | EDGE, P2P | ~96% | pending |
| **F** | GPU decision | GPU-001 | ~97% | pending |
| **G** | QA hardened + CI | QA-001, PWA polish | **100%** | pending |

\*008/013: en Fase B se **realinean ACs** al modelo local/P2P; cloud org queda ROADMAP.

---

## Fase B — checklist (actual)

- [x] Roadmap PLAN-100-FEATURES.md
- [x] CSV parse lib + flexible headers + row errors
- [x] Playwright `csv-import.spec.ts` (2/2)
- [x] data-testid import modal / settings open
- [x] ACs FUN-008 → localAuth + devices + lock (cloud = ROADMAP-003)
- [x] ACs FUN-013 → P2P team + PeerPermissions
- [x] UI cambio de tier local (free/pro/pyme) en settings
- [x] AuthContext.setSubscriptionTier → SubscriptionContext
- [ ] Actualizar % SSOT + commit

## Fase C — siguiente

- Stripe: modo “local unlock” documentado + opcional checkout si env keys
- AI: health check engine + mensaje claro sin CF
- Guest/demo flags documentados en UI

## Fase D–G — ver TASK.md

---

## Tracking

Tras cada fase: actualizar `implementation_percentage` solo con evidencia; recalcular promedio en metadata.


