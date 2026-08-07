# SWAL Stability Protocol (SSP) — Protocolo de Estabilización

> Estado: DISEÑO v0.1 (2026-08-07) — pendiente de aprobación antes de implementar (regla de cores críticos).
> Aplica a: shelf, edge-mesh (canónico), xavier, gestalt, synapse-trading, maloca, nido, OrionHealth, worldexams.

## 1. Objetivo

Un único protocolo que determina **estabilidad, funcionalidad y seguridad** real de cada software SWAL,
genera **tags estables** (vX.Y.Z.DDMMYYYY) verificados, e **indexa el resultado en Xavier** para que
cualquier agente responda sobre features con datos reales (no suposiciones), ahorrando tokens vía
snippets contextuales.

## 2. Estado actual (embriones que YA existen)

| Pieza | Dónde | Estado |
|---|---|---|
| `verify-pipeline.sh --check --test --json` | shelf (21/21) · xavier (27/27) | ✅ funcional — valida features.json ↔ rutas ↔ SRS REQ ↔ USER-STORIES ↔ test refs + build + test |
| `.gitcore/features.json` | todos los repos | ✅ con `req_ids` + `user_stories` por feature (xavier 27 features, shelf 21) |
| `docs/SRS/REQUIREMENTS.md` + `USER-STORIES.md` | repos | ✅ IEEE 830 + historias |
| **XTSP / Progressive Memory Disclosure** | Xavier (`mode=snippet`, ~68% menos tokens) | ✅ funcional — fat search → page-in → persist |
| Snippet write-through (code-graph → memorias) | Xavier | ✅ patrón implementado |
| Tags DDMMYYYY | shelf v0.5.3.07082026 | ✅ formato adoptado |

**Lo que FALTA**: (a) script orquestador multi-fase único y portable; (b) checks de SEGURIDAD explícitos;
(c) veredicto cuantificado (stability/functionality/security scores); (d) gate de tag estable automático;
(e) indexación Xavier del reporte por repo/tag; (f) snippets por feature disparados por tarea pendiente;
(g) regla de interconexión: toda respuesta sobre una feature consulta el reporte.

## 3. Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  stabilize.sh  (un script por repo, mismo contrato)         │
│                                                             │
│  F0  Metadata   features.json ↔ SRS REQ ↔ US ↔ tests refs  │
│  F1  Build      turbo/cargo/anchor build completo           │
│  F2  Unit       todos los unit tests (paso/fail)            │
│  F3  E2E core   specs críticos (P2P, auth, security)        │
│  F4  Security   audit deps + secret scan + hooks + gate     │
│  F5  Score      → stability% · functionality% · security%   │
│  F6  Verdict    STABLE / BETA / UNSTABLE + umbrales         │
│  F7  Tag        si STABLE → vX.Y.Z.DDMMYYYY + CHANGELOG     │
│  F8  Index      POST a Xavier (kind=stability_report)       │
└─────────────────────────────────────────────────────────────┘
        │                                  │
        ▼                                  ▼
┌───────────────┐            ┌──────────────────────────────┐
│ features.json │            │ Xavier (memoria agéntica)    │
│ (por feature: │            │  kind=stability_report       │
│  %real, tests,│            │  kind=feature_snippet        │
│  req, stories)│            │  triggers por tarea pend.    │
└───────────────┘            └──────────────────────────────┘
```

## 4. Fases del script (contrato único)

Cada fase es **independiente y reporta JSON**; el script es idempotente y reanudable (--phase N).

### F0 — Metadata (honestidad)
- Para cada feature en `features.json`: verifica que `req_ids` existen en REQUIREMENTS.md, que `user_stories` existen en USER-STORIES.md, y que **cada test referenciado existe** y contiene la feature.
- Detección de inflado: % declarado vs tests reales que tocan la feature (heurística por rutas/string).
- Salida: `features_verified: {feature_id: {ok, declared_pct, verified_pct}}`.

### F1 — Build
- Stack auto-detectado (pnpm/turbo, cargo, anchor): `turbo build` / `cargo build` / `cargo check --workspace`.
- RAMDISK: `CARGO_TARGET_DIR=/build/rust-target/...` (patrón ya en verify-pipeline.sh).

### F2 — Unit
- `pnpm --filter ... test` / `cargo test` por paquete. Umbral: **100% pass** obligatorio (0 flaky en 1 run; flaky conocido se documenta en features.json como `known_flakes`).

### F3 — E2E core
- Specs críticos por repo (shelf: P2P sync, authz, security, smoke-prod). Run serial (`--workers=1`).
- Regla anti-mentira: si un spec core falla 2/2 runs → **UNSTABLE**, no se etiqueta.

### F4 — Security
- `npm audit` / `cargo audit` (umbral: 0 high/critical) + secret scan (`gitleaks` o grep de patrones) + hooks git funcionales (pre-commit/pre-push) + test hooks NO expuestos en prod (gate VITE_TEST_MODE — lección 0.5.3.07082026).
- Salida: `security: {audit, secrets, hooks, prod_hooks_gated}`.

### F5 — Score (veredicto cuantificado)
```
stability%     = (F2 pass% + F3 pass% + E2E flake_rate ajustado) / 2
functionality% = media de verified_pct de features (honesto, no declarado)
security%      = 100 - penalización (high vulns × 15, critical × 25, secrets × 50)
```

### F6 — Veredicto
| Veredicto | Umbrales |
|---|---|
| **STABLE** | stability ≥ 95% · functionality = 100% (o 0 features pendientes) · security = 100% |
| **BETA** | stability ≥ 80% · functionality ≥ 70% · security ≥ 90% |
| **UNSTABLE** | cualquier score menor |

### F7 — Tag estable
- Si STABLE → `vX.Y.Z.DDMMYYYY` (bump Z automático o manual), CHANGELOG actualizado, tag pusheado.
- El tag SOLO lo genera el script (nadie etiqueta a mano).

### F8 — Index Xavier
- `POST /v1/memories` kind=`stability_report`, path `stability/{repo}/{tag}`, content = JSON completo del veredicto.
- **Snippets por feature**: kind=`feature_snippet`, path `features/{repo}/{feature_id}`, content = {feature, %real, tests, reqs, stories, última verificación} — compacto (<300 chars) para mode=snippet.

## 5. Interconexión con respuestas (regla obligatoria)

**Toda respuesta de un agente (Hermes/Jules/Gestalt) que mencione una feature o funcionalidad DEBE**:
1. Consultar Xavier: `POST /v1/memories/search {query: "<feature>", mode: "snippet"}` → snippets del feature + stability_report del repo.
2. Si no hay reporte (repo no indexado) → fallback local: leer `features.json` del repo.
3. Responder con los DATOS del reporte (% real, tests, tag, veredicto) — nunca afirmar "funciona/está listo" sin el dato.
4. Si la feature no existe en features.json → decirlo explícitamente ("no declarada").

Implementación: skill Hermes `swal-feature-truth` (regla + comandos) + prompt de Jules (AGENTS.md: "cita el stability report").

## 6. Contextos inteligentes Xavier (triggers por tarea pendiente)

Patrón XTSP aplicado a las tareas: **el issue completo entra → Xavier concatena internamente → el agente recibe contexto compacto**.

### Trigger por issue/tarea
Cuando se crea o retoma un issue (o PR):
1. El agente hace `POST /v1/memories/search {query: "<título+paths del issue>", mode: "snippet", limit: 10}`.
2. Xavier devuelve: snippets de features tocadas (con %real y tests), stability_report del repo, decisiones previas (kind=decision), memos de arquitectura.
3. El agente PAGEA-IN (GET por id) solo los 2-3 snippets con más score que necesita.
4. Resultado: contexto completo (~68% menos tokens que pasar el issue + todo el repo) y **sin lecturas ciegas de código** (el snippet trae path + score).

### Tipo de snippets indexados
| kind | path | contenido | trigger |
|---|---|---|---|
| `stability_report` | `stability/{repo}/{tag}` | JSON veredicto | cualquier tarea del repo |
| `feature_snippet` | `features/{repo}/{feature_id}` | feature + %real + tests + reqs | issue que toca la feature |
| `decision` | `decisions/{repo}/{id}` | decisiones de arquitectura | cambio de diseño |
| `architecture` | `architecture/{repo}/{module}` | resumen de módulo (fat search) | tarea en el módulo |

### Ahorro de tokens (métrica objetivo)
- Antes: issue completo (2-4k tokens) + exploración de código (10-50k) = **12-54k tokens/tarea**.
- Después: snippets (10×~150 = 1.5k) + page-in (2×~500 = 1k) = **~2.5k tokens/tarea** → **~80-95% menos**.

## 7. Roadmap de implementación (olas)

| Ola | Entregable | Repos |
|---|---|---|
| **A** | `stabilize.sh` genérico (contrato F0-F8) + docs | shelf (piloto — ya tiene verify-pipeline 21/21) |
| **B** | Indexación Xavier (kind=stability_report + feature_snippet) + script `stabilize-index` | shelf → xavier |
| **C** | Triggers: skill Hermes `swal-feature-truth` + AGENTS.md para Jules (regla de citar reporte) | Hermes + repos |
| **D** | Roll-out: xavier (27 features), edge-mesh, gestalt, synapse-trading, maloca, nido | resto del ecosistema |

Cada ola: verificación local completa (unit + verify) antes de tag. Sin Jules para el diseño del core (directiva), implementación sí delegable por olas.

## 8. Métricas de éxito

1. 100% de los repos SWAL con tag estable DDMMYYYY generado por el script (no manual).
2. Toda respuesta de Hermes sobre features cita el stability report (auditable por sesión).
3. %real de features honesto en todos los features.json (sin inflado — detectado por F0).
4. Tokens por tarea delegada a Jules: reducción ≥ 60% (medible en sesiones).
5. Cero tags estables rotos (un tag = código que pasó F0-F5 en el mismo commit).

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Scripts divergentes por repo | Contrato JSON único + test del contrato en F0 |
| E2E flakes enmascaran estabilidad | Run serial + 2/2 fails = UNSTABLE + known_flakes documentado |
| Audit deps sin red/registro | `--offline` + registro local de resultados (fecha) |
| Xavier sin embeddings (modo local) | BM25 fallback (ya existe en Xavier) |
| Sobrecarga de indexación | Snippets pequeños (<300 chars) + dedup por path (upsert) |

---
*Documento de diseño SSP v0.1 — 2026-08-07. Aprobación requerida antes de implementar Ola A.*
