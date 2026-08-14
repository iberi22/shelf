# Plan — SSOT features + scripts de verificación (2026-08-14)

**SRC / scope:** GitCore protocol tooling + honesty of 21 product features  
**Issue:** [#471](https://github.com/iberi22/shelf/issues/471)  
**SSOT producto:** `.gitcore/features.json`  
**Número de producto a reportar:** **91–93%** (no 97%, no 42%, no 21/21 PASS)  
**Estado:** ANALYSIS → DESIGN listo para IMPLEMENT

---

## Objetivo

Que un agente (o BELA) pueda correr un comando y obtener el **% de implementación real** del producto Shelf, alineado con el codebase, sin verdes falsos ni rojos falsos.

Hoy hay **cuatro números distintos** y ninguno es un verificador fiable:

| Fuente | Número | Qué mide |
|--------|-------:|----------|
| Metadata / TASK.md | **91%** | Oficial, conservador, **usar este** |
| Promedio `progress_pct` SSOT | **92.9%** | Aritmética del JSON canónico |
| `implementation-score.json` (17 jul) | **97%** | Protocolo GitCore, no producto |
| Heurística `feature-verify` (réplica) | **42.5%** | Falso negativo (evidencia en prosa) |
| `verify-pipeline.sh` | **21/21 PASS** | Falso positivo (schema incorrecto) |
| `packages/edge-mesh/features.json` | **66%** | Otro catálogo (18 features de paquete) |

---

## Hallazgos (auditoría 2026-08-14)

### A. Drift de SSOT (tres JSON + TASK)

Archivos:

- `.gitcore/features.json` — SSOT (updated 2026-08-02)
- `features.json` (raíz) — índice, updated 2026-07-18
- `.gitcore/features-details.json` — detalle, updated 2026-07-18
- `.gitcore/planning/TASK.md` — tabla 2026-07-18

Deltas claimed % (SSOT vs raíz/details):

| ID | SSOT | Raíz / details | Código hoy |
|----|-----:|---------------:|------------|
| SRC-FUN-001 | 97 | 96 | OK, +1 cosmético |
| SRC-FUN-005 | **98** | **94** | `cancelled` **existe** → SSOT más cierto |
| SRC-FUN-007 | **92** | **86** | OpenRouter + WebLLM → SSOT más cierto |
| SRC-FUN-009 | Colaborador SWAL | Details aún Ads+Stripe | Ads/Modal **borrados** → details **stale** |
| SRC-GPU-001 | **95** | **88** | kernels reales → SSOT más cierto |
| SRC-QA-001 | **94** | **87** | 62+ specs / 17 Cypress |

Metadata SSOT dice `implementation_percentage: 91` pero el promedio de `progress_pct` es **92.9%**. TASK.md no se actualizó.

### B. Paths muertos en `features-details.json` (5)

94.1% de paths/tests declarados existen. Faltan:

| Feature | Path declarado | Realidad |
|---------|----------------|----------|
| SRC-FUN-003 | `.../ProChartsTeaserCard.tsx` | No existe |
| SRC-FUN-009 | `.../SubscriptionModal.tsx`, `.../Ads.tsx` | Eliminados (modelo Colaborador) |
| SRC-CRDT-001 | `packages/p2p-mesh-core/src/database-sync.ts` | Ahora es **directorio** `database-sync/` |
| SRC-QA-001 | `.github/workflows/ci.yml` | Está en `workflows.disabled/`; activo = `test.yml` |

### C. Campo `evidence` del SSOT es prosa, no paths

`feature-verify.ps1` resuelve archivos. El SSOT guarda notas (`"database-sync.ts Y.Maps + encodeStateAsUpdate"`). Resultado de la heurística: **0 confirmed / 12 overstated / 7 missing**. Eso no refleja el código.

`features-details.json` ya tiene `paths[]` + `tests[]` + `acceptance_met{}` — ese es el schema correcto.

### D. Scripts: validez

| Script | ¿Correr hoy? | Defecto |
|--------|--------------|---------|
| `implementation-score.ps1` | Solo como health de protocolo | `overall_pct` **no** es % producto. Cache 97% stale. Linux: **no hay pwsh**. SWAL penaliza `test.yml` activo. |
| `feature-verify.ps1` / `feature-diff-claimed.ps1` | Idea correcta | Input inválido (prosa). `MaxFilesPerFeature=6`. Premia líneas, no ACs. Requiere pwsh. |
| `verify-pipeline.sh` | **No usar para %** | Lee `implemented_in` / `req_ids` / `user_stories` / `tests`. Shelf usa `evidence` / `user_story`. Vacío = PASS. Reescribe `extract_features.py` cada run. `eval echo` para braces. |
| `extract_features.py` | Sidecar generado | Path absoluto de máquina (`/home/belal/...` o leftover `/app/`). Schema genérico. |
| `protocol-health.ps1` | Útil | Fallará `no_active_workflow_yml` por `test.yml` (conflicto era privada vs CI real). |

### E. Audit counts SSOT vs disco

| Claim (`metadata.audit`) | Claimed | Actual |
|--------------------------|---------|--------|
| `locales_count` | 20 | **20** |
| `playwright_specs` | 35 | **~62** en `tests/` (74 `*.spec.ts` en la app) |
| `cypress_e2e_specs` | 16 | **17** |
| `edge_mesh_unit_tests` | 214 | **47 archivos** `*.test.ts` (214 era recuento de casos) |

### F. Catálogo edge-mesh aparte

`packages/edge-mesh/features.json`: 18 features, 0 implemented / 18 partial, **66%**, updated 2026-07-17. **No mezclar** con las 21 de producto (`SRC-EDGE-001` = 95% wrapping de app).

### G. SRS

`docs/SRS/REQUIREMENTS.md` tiene REQ-008…REQ-028 enlazados a SRC-FUN/PQC/… pero checkboxes de REQ-001 aún `[ ]` y `SRS Estado: draft`. El linker de `feature-verify` no aprovecha bien esos REQ si evidence no es path.

---

## Número de producto (no negociable en este plan)

**Reportar ~91% (rango 91–93%)** para las 21 features.

No reportar:

- 97% (`implementation-score` protocolo)
- 42% (`feature-verify` crudo)
- 100% / 21/21 (`verify-pipeline` vacío)
- 66% (catálogo interno edge-mesh)

Roadmap (cloud sync, Stripe live, maloca extract) **fuera** de este %.

---

## Fases de implementación

### Fase 0 — Contrato de números (docs, 30 min)

- Documentar en `TASK.md` y metadata: `product_pct` vs `protocol_pct`.
- Dejar escrito: SSOT = `.gitcore/features.json`; raíz y details son derivadas.

### Fase 1 — Alinear SSOT (P0)

1. Recalcular `metadata.implementation_percentage` como promedio real de `progress_pct` **o** bajar `progress_pct` para que coincida con 91 — elegir una y documentar.
2. Sync `features.json` raíz ← SSOT (mismos % y nombres; FUN-009 = Colaborador).
3. Actualizar `features-details.json`:
   - FUN-005 `status_cancelled: true`, % 98
   - FUN-007 motores OpenRouter+WebLLM, quitar gate Pro stale, % 92
   - FUN-009 modelo Colaborador; quitar Ads/SubscriptionModal; ACs nuevas
   - GPU-001 `execute_task_real` acorde a kernels; % 95; añadir test path
   - QA-001 path CI = `test.yml`; % 94
   - CRDT path = `packages/p2p-mesh-core/src/database-sync/`
   - Quitar `ProChartsTeaserCard.tsx`
4. Actualizar tabla de `TASK.md` (fecha 2026-08-14).
5. Refrescar `metadata.audit` (locales, specs, cypress, edge-mesh file count vs case count).

### Fase 2 — Evidence = paths (P0, desbloquea verify)

Schema propuesto por feature:

```json
"evidence": [
  { "path": "apps/shelf-inventory/components/Sales.tsx", "note": "ADD_SALE → stock" }
]
```

Hasta entonces: `evidence` solo strings que sean paths relativos existentes. Notas van a `gaps` o `note`.

Migrar las ~40 entradas prosa del SSOT usando `paths`/`tests` de details (ya limpios salvo los 5 muertos).

Quitar o subir `MaxFilesPerFeature` (6 recorta FUN-001 11 evidencias).

### Fase 3 — `verify-pipeline.sh` schema Shelf (P0)

- Leer `evidence` / `paths` / `tests` (no solo `implemented_in`).
- Fallar si el path no existe (file o directory).
- Strip comentarios ` (…)` y ` → …` al resolver.
- **No** reescribir `extract_features.py` en cada run; script estable.
- Path de lib relativo (`dirname`), nunca `/app/` ni `$HOME`.
- Quitar `eval echo` para braces; usar glob.
- Exit ≠ 0 si hay MISS; no PASS vacío.

### Fase 4 — Puerto Python de `feature-verify` (P1)

Linux/WSL no tiene `pwsh`. Añadir `.gitcore/scripts/feature-verify.py` (misma heurística + schema v2) invocable por `bash .gitcore/scripts/verify-pipeline.sh` y por agentes.

Mantener `.ps1` para Windows; ambos deben leer el mismo JSON.

Heurística: ponderar `acceptance_met` de details (bool por AC) en vez de contar líneas. Gaps “optional polish” ≠ −8 plano.

### Fase 5 — `implementation-score` honesto (P1)

- Emitir `product_pct` (promedio features, post-verify) **y** `protocol_pct` por separado.
- `overall_pct` no se cita como “% del producto”.
- Decidir política SWAL vs `.github/workflows/test.yml` (o dejar de penalizar CI activo en este repo).
- Regenerar `.gitcore/implementation-score.json` (hoy 2026-07-17).

### Fase 6 — No mezclar catálogos (P2)

- Documentar: 21 SRC de producto ≠ 18 F-* de `@shelf/edge-mesh`.
- Recalibrar o marcar stale el `packages/edge-mesh/features.json` (66%, 17 jul) en un issue aparte si se quiere honestidad del paquete.

---

## Orden de ejecución recomendado

```
Fase 0 (docs números)
  → Fase 2 (evidence paths) + Fase 1 (sync JSON) en el mismo PR
    → Fase 3 (pipeline bash)
      → Fase 4 (python verify)
        → Fase 5 (score split)
          → Fase 6 (edge-mesh catalog, opcional)
```

PR1 (honesty): Fases 0–2. Sin esto, ningún script sirve.  
PR2 (tooling): Fases 3–4.  
PR3 (score): Fase 5.

---

## Criterios de aceptación

- [ ] Un comando Linux (`python3` o `bash`) lista 21 features con CLAIM / SUGGEST / VERDICT / EVID `ok/declared`.
- [ ] `verify-pipeline.sh` **falla** si se borra un path de evidence (no 21/21 vacío).
- [ ] `features.json` raíz, `features-details.json` y `TASK.md` coinciden en % e IDs con `.gitcore/features.json`.
- [ ] `evidence` del SSOT son paths que existen en disco (0 prosa).
- [ ] `implementation-score` distingue `product_pct` ≈ 91–93 y `protocol_pct`.
- [ ] Documentado: no mezclar 66% edge-mesh con 91% producto.
- [ ] `extract_features.py` no contiene paths absolutos de máquina.

## Fuera de alcance

- Subir el producto a 100% (roadmap cloud/Stripe/maloca).
- Reescribir ACs de negocio.
- Instalar PowerShell en CI como único verificador.
- Cambiar `.gitcore/ARCHITECTURE.md`.
