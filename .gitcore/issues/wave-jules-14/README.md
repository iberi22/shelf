# Wave Jules 14 Issues — Shelf Post-Ola-I Gaps

**Fecha:** 2026-07-30  
**Orquestación:** Jules async (`jules` label)  
**Baseline SSOT:** `features.json` ~91% (21 features implemented, 0 partial)  
**Repo:** `iberi22/shelf` · Trabajo sobre `develop` (mergeado con main)  
**Ola anterior:** Ola H (issues #297-#300) — cerró 4 gaps críticos de PQC, roles, CSV, monetización

---

## Principios de diseño

1. **Sin conflicto entre issues** — cada issue toca archivos disjuntos
2. **Ejecutables por Jules** — cada issue tiene ACs claros, rutas exactas y scope acotado (~1-3 archivos)
3. **Cubren brechas reales** — basado en `features-details.json` gaps/next_actions
4. **14 issues** — cubriendo product core, mesh/PQC, QA/PWA, y residual roadmap

---

## File Ownership Map (anti-conflicto)

| # | Issue | Files primarios | Archivos exclusivos |
|---|-------|----------------|---------------------|
| J01 | Dashboard: wire real charts | `Dashboard.tsx`, `Reports.tsx` | ✅ Solo Dashboard + Reports |
| J02 | Sales: scan-to-cart flow | `Sales.tsx`, `BarcodeScanner.tsx` | ✅ Solo Sales + BarcodeScanner |
| J03 | Purchase Orders: cancelled + tests | `PurchaseOrders.tsx`, `types.ts` (p2p-mesh-core) | ✅ Solo PO + types |
| J04 | App Lock PIN + Biometrics UX | `LockScreen.tsx`, `webauthn.ts` | ✅ Solo LockScreen + lib/webauthn |
| J05 | Device list & revocation UI | `DeviceManagementPanel.tsx`, `localAuth.ts` | ✅ Solo DeviceManagementPanel + localAuth |
| J06 | AI Assistant: E2E test + quality | `AIChat.tsx`, `tests/ai-assistant.spec.ts` | ✅ AIChat + test file (nuevo) |
| J07 | Multi-language: hardcoded sweep | `locales/*.json`, `components/*.tsx` (varios) | ⚠️ Modifica locales/ + limpia strings |
| J08 | Data Import: all-or-nothing rollback | `csvProductImport.ts`, `ImportCSVModal.tsx` | ✅ Solo CSV lib + modal |
| J09 | GPU Agent: real WebGPU kernels + tests | `gpu-agent.ts` (gpu-agent pkg) | ✅ Solo packages/gpu-agent |
| J10 | Edge Mesh: requireSignedEnvelopes | `edge-mesh.ts`, `protocol/index.ts` | ✅ Solo packages/edge-mesh protocol |
| J11 | Testing: CI reliability + coverage gates | `.github/workflows/ci.yml`, `vitest.config.ts` | ✅ CI + vitest configs |
| J12 | P2P: invite authority + residual | `p2p.ts`, `tests/p2p-authority.spec.ts` | ✅ Solo p2p-mesh-core |
| J13 | CRDT: re-harden entity ACL multi-peer | `database-sync.ts`, `tests/security-sync.spec.ts` | ✅ Solo database-sync + test |
| J14 | PWA: offline fallback for P2P signaling | `UpdateNotification.tsx`, `P2PSyncManager.tsx` | ✅ Solo P2P Manager + Update |

**Regla:** cada issue opera sobre archivos no compartidos con ningún otro issue.

---

## Issue J01 — Dashboard: wire real sales charts

**ID:** SRC-FUN-003 · **Prioridad:** P0 · **Feature % actual:** 92% · **Target:** 97%

### Gaps a cerrar
- Dashboard NO muestra gráficos de ventas reales
- ProChartsTeaserCard muestra datos demo hardcodeados
- Reports.tsx ya tiene la lógica salesByDay + topProducts

### Archivos
- `apps/shelf-inventory/components/Dashboard.tsx` — agregar chart real
- `apps/shelf-inventory/components/ProChartsTeaserCard.tsx` — gating pro + real data
- `apps/shelf-inventory/tests/dashboard-charts.spec.ts` — nuevo test

### Acceptance Criteria
1. Dashboard muestra un Line chart de ventas por día (últimos 30 días) usando datos reales de `state.sales`
2. Gráfico usa exactamente la misma lógica `salesByDay` que Reports.tsx (reutilizar, no duplicar)
3. Top 5 productos más vendidos en Dashboard con revenue y cantidad
4. ProChartsTeaserCard reemplazado por datos reales; gated apropiadamente según tier
5. No rompe existente: StatCards siguen funcionando, customize toggle intacto
6. Test: asegura que datos reales se renderizan, no placeholders

### Dependencias
- Ninguna externa. Reports.tsx ya tiene chart.js registrado.

---

## Issue J02 — Sales: scan-to-cart flow

**ID:** SRC-FUN-002 · **Prioridad:** P1 · **Feature % actual:** 97% · **Target:** 99%

### Gaps a cerrar
- "Optional scan-to-cart in Sales" — integrar BarcodeScanner en el flujo de ventas
- Escanear un producto lo agrega directamente al carrito de venta sin buscarlo manualmente

### Archivos
- `apps/shelf-inventory/components/Sales.tsx` — agregar botón "Scan to cart" + onScan handler
- `apps/shelf-inventory/components/BarcodeScanner.tsx` — ya existe, conectar
- `apps/shelf-inventory/tests/sales-scan-to-cart.spec.ts` — nuevo test

### Acceptance Criteria
1. Botón "Scan to Cart" en la interfaz de Sales (junto a selector de productos)
2. Al escanear un código de barras, busca el producto por SKU en `state.products`
3. Si encuentra match, agrega automáticamente al carrito de venta con cantidad 1
4. Si hay múltiples variantes del producto, muestra selector de variante primero
5. Si NO encuentra match, notificación "Producto no encontrado"
6. Feedback visual: toast de confirmación + vibrate (reusar patrón de BarcodeScanner)
7. Test: simula escaneo → verifica que producto aparece en carrito

### Dependencias
- BarcodeScanner.tsx (no modificar su API actual, solo agregar eventos)

---

## Issue J03 — Purchase Orders: cancelled status + E2E

**ID:** SRC-FUN-005 · **Prioridad:** P1 · **Feature % actual:** 94% · **Target:** 98%

### Gaps a cerrar
- `acceptance_met.status_cancelled: false` — el tipo `status` no incluye `cancelled`
- E2E faltante para receive → stock increment

### Archivos
- `packages/p2p-mesh-core/src/types.ts` — ya tiene `"pending" | "received" | "cancelled"` (línea 120)
- `apps/shelf-inventory/components/PurchaseOrders.tsx` — agregar botón cancelar + validación
- `apps/shelf-inventory/cypress/e2e/purchase-orders.cy.ts` — extender con receive + cancel E2E

### Acceptance Criteria
1. PurchaseOrders.tsx tiene botón "Cancelar" para POs en estado `pending`
2. Al cancelar, el status cambia a `cancelled` y el botón se deshabilita
3. Al recibir, el stock se incrementa correctamente (suma cantidades de items)
4. PO cancelada NO incrementa stock
5. E2E: create → receive → stock verificado → cancel (nueva PO) → stock no cambia
6. UI muestra badge de color por estado (verde=received, rojo=cancelled, amarillo=pending)

### Dependencias
- types.ts (p2p-mesh-core) — no necesita cambios, ya tiene status canonical

---

## Issue J04 — App Lock PIN + Biometrics UX

**ID:** SRC-FUN-008 · **Prioridad:** P0 · **Feature % actual:** 88% · **Target:** 93%

### Gaps a cerrar
- App lock PIN y/o biometrics (WebAuthn) — implementado parcial; pulir UX
- LockScreen existe pero sin integración completa con localAuth

### Archivos
- `apps/shelf-inventory/components/LockScreen.tsx` — mejorar UX: PIN entry, fingerprint prompt
- `apps/shelf-inventory/lib/webauthn.ts` — verificar/mejorar autenticación biométrica
- `apps/shelf-inventory/context/AuthContext.tsx` — integrar app lock flow (no modificar auth base)
- `apps/shelf-inventory/tests/auth-device-lock.spec.ts` — nuevo test

### Acceptance Criteria
1. App lock con PIN de 4-6 dígitos configurable desde Settings
2. Fingerprint/face unlock (WebAuthn) como alternativa al PIN en dispositivos compatibles
3. Si no hay biometría, solo PIN (fallback)
4. Lock se activa después de 5 minutos de inactividad (configurable)
5. Pantalla de lock muestra reloj + fecha + botón de desbloqueo
6. Si el usuario no puede desbloquear, opción "Recuperar cuenta vía seed"
7. ✅ No modifica localAuth ni AuthContext core (solo extiende hooks)
8. Test: mock inactivity → lock → unlock con PIN correcto/incorrecto

### Dependencias
- AuthContext.tsx — solo agregar `authLock` state, no modificar login flow base

---

## Issue J05 — Device list & revocation UI

**ID:** SRC-FUN-008 · **Prioridad:** P1 · **Feature % actual:** 88% · **Target:** 93%

### Gaps a cerrar
- Lista y revocación de dispositivos autorizados — UI existe? Revisar DeviceManagementPanel
- Seed recovery / restore cuenta local

### Archivos
- `apps/shelf-inventory/components/DeviceManagementPanel.tsx` — mejorar UI de lista de dispositivos
- `apps/shelf-inventory/lib/localAuth.ts` — agregar función revokeDevice
- `apps/shelf-inventory/lib/seedGenerator.ts` — integrar recovery flow
- `apps/shelf-inventory/tests/auth-device-revocation.spec.ts` — nuevo test

### Acceptance Criteria
1. Settings > Dispositivos muestra lista de dispositivos autorizados con nombre, tipo, último acceso
2. Botón "Revocar" elimina dispositivo de la lista (se requiere confirmación)
3. Seed recovery: generar PDF/texto con frase semilla para restaurar cuenta local
4. Restaurar cuenta desde seed phrase en pantalla de login
5. UI de restauración con input de seed phrase + validación
6. Test: generar seed → restaurar cuenta → datos locales recuperados

### Dependencias
- DeviceManagementPanel.tsx existe, extender sin romper

---

## Issue J06 — AI Assistant: E2E test + quality gates

**ID:** SRC-FUN-007 · **Prioridad:** P2 · **Feature % actual:** 86% · **Target:** 92%

### Gaps a cerrar
- Sin tests E2E para AI Assistant
- `acceptance_met.cloud_function_proxy_primary: false`
- Calidad depende del engine; agregar gate + tests

### Archivos
- `apps/shelf-inventory/components/AIChat.tsx` — agregar data-testid, loading states
- `apps/shelf-inventory/hooks/useWebLLM.ts` — verificar integridad
- `apps/shelf-inventory/tests/ai-assistant.spec.ts` — nuevo test (Playwright)

### Acceptance Criteria
1. AI Chat UI es visible para usuarios Pro (gated correctamente)
2. Para usuarios Free, AI Chat muestra upsell o está oculto
3. Input de chat con placeholder, botón de envío, indicador de streaming
4. Test: mock WebLLM response → verifica que mensaje aparece en UI
5. Test: mock Gemini API → verifica respuesta renderizada
6. Test: usuario Free → AI Chat no disponible
7. Loading spinner mientras el asistente "piensa"
8. No rompe Reports.tsx donde AIChat está embebido

### Dependencias
- Reports.tsx — solo agregar data-testid, no modificar layout

---

## Issue J07 — Multi-language: hardcoded string sweep

**ID:** SRC-FUN-010 · **Prioridad:** P1 · **Feature % actual:** 90% · **Target:** 96%

### Gaps a cerrar
- `acceptance_met.full_ui_no_hardcode: false`
- Componentes tienen strings hardcodeados que deben pasar a locales/

### Archivos
- `apps/shelf-inventory/locales/en.json` — agregar keys faltantes
- `apps/shelf-inventory/locales/es.json` — agregar keys faltantes
- Revisar componentes específicos:
  - `apps/shelf-inventory/components/AIChat.tsx` — líneas 86, 101, 129, 164, 199, 226
  - `apps/shelf-inventory/components/P2PSyncManager.tsx` — líneas con strings español
  - `apps/shelf-inventory/components/SubscriptionModal.tsx` — línea 143
  - `apps/shelf-inventory/components/QRScannerModal.tsx` — error messages
  - `apps/shelf-inventory/components/Sidebar.tsx` — nav labels
  - `apps/shelf-inventory/components/PurchaseOrders.tsx` — status labels
- Script/lint: `bin/check-hardcoded-strings.ts` — opcional, herramienta detectar strings

### Acceptance Criteria
1. Todos los strings visibles en UI pasan por `t('key')` function de i18n
2. Archivos en.json y es.json cubren 100% de keys usadas en componentes
3. No hay `<string>` literales visibles en JSX de los componentes auditados (excepciones: iconos, data-testid, ARIA labels)
4. Persistencia de idioma intacta
5. Test: cambiar idioma → verificar que textos cambian correctamente

### Dependencias
- Ninguna. Solo modificar locale files + limpiar componentes.

---

## Issue J08 — Data Import: all-or-nothing rollback

**ID:** SRC-FUN-014 · **Prioridad:** P2 · **Feature % actual:** 94% · **Target:** 98%

### Gaps a cerrar
- `gaps[0]: "Optional all-or-nothing import rollback"`
- Si una fila del CSV falla, importación parcial queda inconsistente

### Archivos
- `apps/shelf-inventory/lib/csvProductImport.ts` — agregar rollback logic + batch validation
- `apps/shelf-inventory/components/ImportCSVModal.tsx` — mostrar "Success: X productos importados" con opción "Deshacer"
- `apps/shelf-inventory/tests/csv-import-rollback.spec.ts` — nuevo test

### Acceptance Criteria
1. Importación CSV valida TODAS las filas ANTES de insertar alguna
2. Reporta errores por fila (línea, campo, mensaje) antes de aplicar
3. Si alguna fila falla validación, NINGUNA se importa (all-or-nothing)
4. Si todas pasan, se importan en batch y se muestra resumen
5. Opción "Deshacer" disponible por 5 segundos post-import (revertir batch)
6. Rollback: si alguna inserción individual falla, revierte las ya insertadas del mismo batch
7. Test: CSV con fila inválida → 0 productos importados
8. Test: CSV válido → X productos importados → deshacer → 0 productos

### Dependencias
- AppContext.removeProduct(s) para rollback
- No modificar importación CSV existente, solo envolver en transacción

---

## Issue J09 — GPU Agent: real WebGPU kernels + unit tests

**ID:** SRC-GPU-001 · **Prioridad:** P1 · **Feature % actual:** 88% · **Target:** 95%

### Gaps a cerrar
- `execute_task_real: false` — tareas solo CPU fallback, sin WebGPU real
- Sin tests E2E para GPU path
- Mesh task marketplace residual

### Archivos
- `packages/gpu-agent/src/gpu-agent.ts` — agregar implementación WebGPU real para vector-sum, dot-product, matrix-scale
- `packages/gpu-agent/tests/gpu-agent.test.ts` — extender con tests WebGPU (mock navigator.gpu)
- `packages/gpu-agent/docs/ADR-001-GPU-AGENT.md` — documentar estado actual

### Acceptance Criteria
1. `executeTask('vector-sum')` usa WebGPU cuando `navigator.gpu` disponible, con shader WGSL real
2. `executeTask('dot-product')` idem
3. `executeTask('matrix-scale')` idem
4. Cuando WebGPU no disponible, CPU fallback idéntico output
5. Resultados de GPU vs CPU son equivalentes (tolerancia flotante)
6. Test: mock `navigator.gpu` → verifica que WebGPU path se ejecuta
7. Test: sin WebGPU → verifica CPU fallback
8. `maxConcurrentTasks` respetado (encolar si > límite)

### Dependencias
- No toca app/shelf-inventory. Solo packages/gpu-agent.

---

## Issue J10 — Edge Mesh: harden requireSignedEnvelopes

**ID:** SRC-EDGE-001 · **Prioridad:** P0 · **Feature % actual:** 88% · **Target:** 93%

### Gaps a cerrar
- `requireSignedEnvelopes` aún optional en edge-mesh path
- Maloca extract residual (Phase D2) — fuera de scope
- Hacia un solo message type (YJS→envelope)

### Archivos
- `packages/edge-mesh/src/edge-mesh.ts` — agregar flag `requireSignedEnvelopes: boolean`
- `packages/edge-mesh/src/protocol/index.ts` — validar firma en envelopes
- `packages/edge-mesh/tests/protocol/index.test.ts` — extender con signed envelope tests
- `packages/edge-mesh/tests/edge-mesh.test.ts` — extender

### Acceptance Criteria
1. `EdgeMeshConfig.requireSignedEnvelopes` por defecto `false` (no romper existente)
2. Cuando `true`, todo envelope entrante requiere `ML-DSA-65` signature válida
3. Envelope sin firma → rechazado con log warn
4. Envelope con firma inválida → rechazado con log error
5. Test: config=false → envelopes sin firma pasan (backward compat)
6. Test: config=true → envelope sin firma rechazado
7. Test: config=true → envelope con firma válida pasa
8. No afecta YJS_UPDATE (que sigue por YJS wire)

### Dependencias
- `packages/edge-mesh/src/protocol/` + `packages/edge-mesh/src/identity/`

---

## Issue J11 — QA: CI reliability + coverage gates

**ID:** SRC-QA-001 · **Prioridad:** P1 · **Feature % actual:** 87% · **Target:** 94%

### Gaps a cerrar
- GHA runner minutes may fail infra-side
- Husky pre-commit/pre-push fiable
- Sin coverage gates

### Archivos
- `.github/workflows/ci.yml` — mejorar robustez de jobs
- `vitest.config.ts` en packages/edge-mesh, packages/p2p-mesh-core, packages/gpu-agent — agregar coverage
- `.husky/pre-commit` — verificar
- `.husky/pre-push` — verificar
- `apps/shelf-inventory/vitest.config.ts` — agregar coverage

### Acceptance Criteria
1. CI jobs tienen timeout explícito (15 min cada uno)
2. Cada job reporta fallo claramente (no timeout silencioso)
3. Vitest coverage gate: branch ≥ 50%, line ≥ 60% en packages/edge-mesh (mínimo)
4. Husky pre-commit corre lint-staged (root) + tsc shelf-inventory
5. Husky pre-push corre build + test:packages
6. Husky funciona sin errores de path
7. Test: CI corre lint + build + cypress + playwright + packages test en < 15 min
8. Test: `pnpm test:packages` pasa con coverage report

### Dependencias
- Configs existentes .husky/ + .github/workflows/ci.yml

---

## Issue J12 — P2P: invite authority + residual fix

**ID:** SRC-P2P-001 · **Prioridad:** P0 · **Feature % actual:** 90% · **Target:** 94%

### Gaps a cerrar
- Thin core residual
- Invite authority residual
- `CHANGE_ROLE from non-master` edge case

### Archivos
- `packages/p2p-mesh-core/src/p2p.ts` — fix role change authority
- `packages/p2p-mesh-core/src/p2p-transport-adapter.ts` — verificar
- `packages/p2p-mesh-core/tests/p2p-transport-adapter.test.ts` — extender
- `apps/shelf-inventory/tests/p2p-authority.spec.ts` — extender test Playwright

### Acceptance Criteria
1. Solo el admin/master puede cambiar roles de otros peers
2. `CHANGE_ROLE` de non-master es rechazado con error y log
3. Invite flow: master invita → peer acepta → rol asignado → sincronización
4. Peer sin rol explícito obtiene `vendedor` por defecto (read-only + ventas)
5. Test: non-master intenta cambiar rol → rechazado
6. Test: master cambia rol → efectivo en sync
7. Test: invite + role propagation verificada E2E

### Dependencias
- types.ts (no modificar, roles ya definidos)

---

## Issue J13 — CRDT: re-harden entity ACL multi-peer

**ID:** SRC-CRDT-001 · **Prioridad:** P0 · **Feature % actual:** 95% · **Target:** 98%

### Gaps a cerrar
- "Optional further harden signed envelope requirement"
- Entity remote ACL tests con multi-peer

### Archivos
- `packages/p2p-mesh-core/src/database-sync.ts` — re-harden applyUpdate ACL gate
- `apps/shelf-inventory/tests/security-sync.spec.ts` — extender con multi-peer ACL test
- `apps/shelf-inventory/tests/p2p-conflict-resolution.spec.ts` — agregar caso ACL remote

### Acceptance Criteria
1. `applyUpdate` remoto verifica `canEdit*` para la entidad específica (products, sales, etc.)
2. Peer vendedor envía update de producto → revertido (no persiste)
3. Peer admin envía update de producto → aplicado
4. ACL check se ejecuta en ORIGEN remoto (no confía en flags del remitente)
5. Multi-peer test: 3 peers (admin, collaborator, vendedor) → solo admin/collaborator editan
6. Test: vendedor hace PUT de producto → check en database-sync → revert
7. Audit log de rejected mutations: peerId, entity, timestamp

### Dependencias
- database-sync.ts ya tiene `isTrustedRemoteWriter` — reforzar sin cambiar API

---

## Issue J14 — PWA: offline fallback for P2P signaling

**ID:** SRC-PWA-001 · **Prioridad:** P1 · **Feature % actual:** 90% · **Target:** 94%

### Gaps a cerrar
- "First P2P connect needs signaling online by design"
- Mejorar experiencia offline cuando no hay signaling server

### Archivos
- `apps/shelf-inventory/components/UpdateNotification.tsx` — agregar estado "P2P offline"
- `apps/shelf-inventory/components/P2PSyncManager.tsx` — offline fallback UI + LocalPeer mode
- `apps/shelf-inventory/hooks/usePersistedReducer.ts` — verificar persistencia offline
- `apps/shelf-inventory/cypress/e2e/pwa-offline.cy.ts` — extender con P2P offline test

### Acceptance Criteria
1. Cuando no hay conexión a PeerJS signaling server, la app muestra:
   - Banner informativo "Modo offline — P2P no disponible"
   - App funciona completamente en single-user mode
2. Cuando se restaura conexión, P2P reconnect automático
3. Todos los datos offline se sincronizan al reconectar
4. Test: mock offline → verifica banner + CRUD funciona
5. Test: mock online → verifica reconnect + sync automático
6. No rompe UpdateNotification existente (nueva versión SW)

### Dependencias
- P2PSyncManager.tsx — no cambiar lógica core, solo agregar UI wrapper

---

## Merge order (si hay conflicto)

| Orden | Issues | Razón |
|-------|--------|-------|
| 1 | J09, J10, J12, J13 (packages) | Core packages first — edge-mesh, p2p-mesh, gpu-agent |
| 2 | J04, J05 (auth) | Auth base — depende de localAuth que no se toca |
| 3 | J01, J02, J03, J06, J08 (app features) | Features de app — independientes entre sí |
| 4 | J07, J11 (cross-cutting) | Refactors globales — último para evitar re-work |
| 5 | J14 (PWA) | Capa final — wrapping de lo existente |

---

## Estimación de carga

| Issue | Archivos | Esfuerzo estimado | Complejidad |
|-------|----------|-------------------|-------------|
| J01 | 3 | 2-4 h | Media |
| J02 | 3 | 2-3 h | Baja |
| J03 | 2 | 1-2 h | Baja |
| J04 | 4 | 3-5 h | Alta |
| J05 | 4 | 3-4 h | Alta |
| J06 | 3 | 2-3 h | Media |
| J07 | ~15 | 3-5 h | Media |
| J08 | 3 | 2-3 h | Media |
| J09 | 3 | 4-6 h | Alta |
| J10 | 4 | 3-5 h | Alta |
| J11 | 5 | 1-2 h | Baja |
| J12 | 4 | 2-4 h | Media |
| J13 | 3 | 2-3 h | Media |
| J14 | 4 | 2-3 h | Media |

**Total estimado:** ~32-50 horas (paralelizable × 2-3 Jules = ~11-17 h)

---

## Impacto post-ejecución

| Feature | % Actual → Target | Gap principal resuelto |
|---------|------------------|-----------------------|
| SRC-FUN-001 | 96 → 96 | (multi-facet filters deferred, menor impacto) |
| SRC-FUN-002 | 97 → 99 | Scan-to-cart |
| SRC-FUN-003 | 92 → 97 | Charts reales en Dashboard |
| SRC-FUN-005 | 94 → 98 | Cancelled status + E2E |
| SRC-FUN-006 | 90 → 93 | (ya mejorado en Ola H; E2E ya existe) |
| SRC-FUN-007 | 86 → 92 | Tests + quality gate |
| SRC-FUN-008 | 88 → 93 | App lock + device list + recovery |
| SRC-FUN-010 | 90 → 96 | Hardcoded string sweep |
| SRC-FUN-014 | 94 → 98 | Rollback + batch validation |
| SRC-PQC-001 | 90 → 90 | (PQC-derived KDF fuera de scope) |
| SRC-P2P-001 | 90 → 94 | Invite authority |
| SRC-CRDT-001 | 95 → 98 | ACL multi-peer hardening |
| SRC-EDGE-001 | 88 → 93 | requireSignedEnvelopes |
| SRC-GPU-001 | 88 → 95 | WebGPU kernels reales |
| SRC-QA-001 | 87 → 94 | CI robustness + coverage |
| SRC-PWA-001 | 90 → 94 | Offline P2P fallback |

**Proyectado final:** ~94-95% (desde 91%)
