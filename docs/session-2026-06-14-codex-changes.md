# Bitacora de cambios Codex - 2026-06-14

Esta bitacora documenta los cambios implementados durante la sesion de trabajo con Codex en el repo `iberi22/shelf`.

## Resumen ejecutivo

Durante la sesion se avanzo en tres frentes:

- Robustecer la sincronizacion P2P/CRDT con enfoque library-first.
- Mejorar la UX responsive de Settings, logs, P2P manager y paneles relacionados.
- Validar y desplegar a produccion los cambios principales.

Produccion quedo desplegada en:

- `https://estante-inventario.vercel.app`
- Deployment directo final: `https://shelf-b2oob265d-iberi22s-projects.vercel.app`

## Commits creados

### `077f6b9` - Improve inventory sync and responsive product settings

Alcance principal:

- Mejoras responsive en modales y paneles de producto.
- Ajustes al formulario de inventario para historial, variantes y configuracion visual.
- Mejoras en `P2PSyncStatusHeader`, `Settings`, `AuditLogViewer` y `MergeResolutionModal`.
- Agregado test `product-history.spec.ts`.
- Ajustes en `p2p-mesh-core` para soportar historial/cambios de productos.

### `fcfd814` - Add library-first edge mesh primitives

Alcance principal:

- Se trato `packages/edge-mesh` como la libreria base reusable.
- Se agregaron primitivas library-first:
  - `createCrdtSyncLayer`
  - op-log
  - snapshots
  - namespace authorizer
  - governance manager
  - presence timeline
  - namespaces/partitions
- Se agregaron pruebas unitarias en `packages/edge-mesh/tests/library-first.test.ts`.
- Se extendieron traducciones de landing page.
- Se cerro el trabajo de landing page relacionado con #114.

### `383daa6` - Harden CRDT sync lifecycle and peer health

Alcance principal:

- Se formalizo el lifecycle de sincronizacion:
  - cargar estado local
  - marcar `dbSync.isReady`
  - anunciar/sincronizar despues de estar listo
- `p2p-mesh-core` dejo de usar `STATE_UPDATE` como canal normal de sincronizacion.
- Se agrego `YJS_SYNC_REQUEST` basado en state vectors y diffs.
- Se agregaron metodos en `DatabaseSyncManager`:
  - `onReady`
  - `getStateVector`
  - `getDiff`
- Se agrego health/backoff en `edge-mesh`.
- Se cerro el bug critico #118.

### `dcc2ef8` - Surface peer health diagnostics in P2P sync

Alcance principal:

- `p2p-mesh-core` empezo a consumir `createPeerHealthMonitor` y `getReconnectDelay` desde `edge-mesh`.
- Se expusieron APIs:
  - `onPeerHealthChange`
  - `getPeerHealth`
  - `getPeerHealthList`
- `P2PSyncManager` muestra estado de salud de peers.
- Se cerro el issue #123.

### `0e29f8a` - Allow clean collaborator product sync

Alcance principal:

- Se corrigio la logica de edicion de productos por colaboradores.
- Las ediciones limpias con `__baseUpdatedAt` compatible aplican directo.
- Las ediciones con base stale se enrutan a `pendingEdits`.
- `AppContext` pasa `__baseUpdatedAt` en rutas de actualizacion de productos.
- `DatabaseSyncManager` elimina `__baseUpdatedAt` antes de persistir en Yjs.
- Se agregaron pruebas unitarias para:
  - update limpio de colaborador
  - update stale enviado a pendientes
- Se dejo comentario de avance en #139.

### `401c971` - Improve P2P CRDT sync and responsive settings panels

Alcance principal:

- Se agrego resincronizacion manual bidireccional en `p2p-mesh-core`.
- `YJS_SYNC_REQUEST` ahora soporta `respondWithRequest`.
- `P2PManager.requestFullSync(peerId?)` solicita catch-up CRDT con state vectors y diffs.
- Se agrego boton `Forzar sync` en `P2PSyncManager`.
- Los helpers E2E dejaron de hacer broadcast manual de `YJS_UPDATE`.
- El E2E principal valida sincronizacion sin auditoria:
  - dos nodos conectan
  - ambos insertan productos por CRDT
  - un colaborador actualiza un producto del host
  - el host converge al precio nuevo
  - no se crea `pendingEdits`
  - el boton `Forzar sync` queda habilitado
- Se mejoro layout responsive de:
  - `AuditLogViewer`
  - `DeviceManagementPanel`
  - `P2PSyncManager`
  - `Settings`
  - tablas responsive en `styles.css`
- Se amplio `settings-mobile-layout.spec.ts` para validar que las tarjetas y logs no desborden en mobile.

## Cambios por area

### `packages/edge-mesh`

- Nueva capa CRDT segura con state vectors, diffs, op-log y snapshots.
- Nuevas abstracciones genericas para authz, governance, presence timeline y namespaces.
- Health monitor reusable con eventos para peers saludables, stale/offline y errores de sync.

### `packages/p2p-mesh-core`

- `DatabaseSyncManager` ahora evita anunciar estado antes de estar listo.
- Sincronizacion normal basada en Yjs update/diff, no en snapshots completos de `AppState`.
- `P2PManager` ahora:
  - solicita sync por state vector al conectarse
  - responde con diff
  - puede forzar catch-up bidireccional con `requestFullSync`
  - evita re-broadcast loops
  - expone diagnostico de health
- Conflictos de producto:
  - clean updates aplican
  - stale updates van a `pendingEdits`

### `apps/shelf-inventory`

- `P2PSyncManager`:
  - muestra health de peers
  - incluye boton `Forzar sync`
  - conserva layout responsive en mobile
- `Settings`:
  - tarjetas homogeneizadas para ancho mobile
  - logs y tablas contenidas dentro de la tarjeta
- `AuditLogViewer`:
  - tabla responsive con labels por celda
  - scroll interno y sin overflow horizontal en mobile
- `DeviceManagementPanel`:
  - layout responsive con min/max width corregidos
- `AppContext`:
  - sync quirurgico de productos con `__baseUpdatedAt`
  - actualizaciones limpias de colaboradores sin mandar todo a pendientes
- Landing/traducciones:
  - textos y claves de landing actualizados en multiples locales durante el trabajo de #114.

## Issues abordados

### Cerrados o abordados con commit

- #114 - Landing page text, Learn More y traducciones.
- #118 - Race `YJS_UPDATE/initWithState`; se corrigio lifecycle ready -> sync.
- #123 - Health, GC coordination parcial, reconnect backoff, ping/pong y diagnostico.

## Porcentaje documental de implementacion

Estos porcentajes son estimaciones de avance al 2026-06-14. No significan cierre de issue mientras GitHub mantenga el issue abierto.

| Area / issue | Estado | Implementacion | Base existente | Falta para cierre |
| --- | --- | ---: | --- | --- |
| Inventario/configuracion UX reciente | Parcial | 85% | Configuracion de campos, variantes, validaciones y ajustes responsive con cambios locales. | Validar, confirmar y desplegar cambios locales no commiteados. |
| #139 CRDT segura / edge-mesh library-first | Parcial | 70% | State vectors, diff sync, op-log, snapshots, authz, health/backoff y force sync. | Migrar Shelf a `createCrdtSyncLayer`, formalizar ack/retry y agregar E2E 2/3 nodos sin helpers manuales. |
| #134 Sucursales/bodegas P2P | Parcial | 25% | Namespaces/partitions genericos en `edge-mesh`. | Selector UI, CRUD en Settings, `activeBranch/warehouse`, permisos por contexto y reportes consolidados. |
| #135 Historial de nodos/failover | Parcial | 45% | Presence timeline, peer health y diagnostico visible. | Persistencia historica, UI de timeline y sucesion conectada a governance/authority metadata. |
| #136 Consenso admin | Parcial | 35% | `createGovernanceManager` con candidaturas, votos y politicas de unanimidad. | UI Shelf, sincronizacion convergente de votos y aplicacion segura sobre metadata/authority. |
| #87 Offline/local AI | Parcial | 25% | Base local-first/P2P y extensiones `edge-mesh`. | OCR local, WebLLM/StockBot local, perfil local-only y reduccion de dependencias cloud. |
| QA/despliegue | Parcial | 80% | Build/lint/E2E principales y deploy productivo pasaron. | Reparar E2E avanzado, desbloquear verificacion manual y auditar vulnerabilidades. |

### Avanzados pero no completamente cerrados

- #139 - Fase 2 CRDT segura:
  - ya existen state vectors, diff sync, op-log, snapshots, authz y API base en `edge-mesh`.
  - falta terminar migracion completa de Shelf hacia `createCrdtSyncLayer` como fuente principal.
- #136 - Consenso admin:
  - primitives de governance existen en `edge-mesh`.
  - falta UI Shelf y aplicacion final sobre authority metadata.
- #135 - Historial/failover:
  - presence timeline existe en `edge-mesh`.
  - falta UI Shelf y flujo completo de sucesion/failover.
- #134 - Sucursales/bodegas P2P:
  - namespaces/partitions existen en `edge-mesh`.
  - falta adapter/UI de Shelf para `branchId`/`warehouseId`.
- #87 - Offline/local AI:
  - sigue siendo amplio y debe dividirse en subtareas.

## Pruebas ejecutadas

### Pasaron

- `pnpm --filter edge-mesh build`
- `pnpm --filter p2p-mesh-core test`
- `pnpm --filter p2p-mesh-core build`
- `pnpm --filter shelf-inventory lint`
- `pnpm --filter shelf-inventory build`
- `pnpm build`
- `pnpm --filter shelf-inventory exec playwright test tests/p2p-sync.spec.ts --project=chromium --workers=1`
- `pnpm --filter shelf-inventory exec playwright test tests/settings-mobile-layout.spec.ts --project=chromium --workers=1`
- `pnpm dlx vercel@latest build --prod`
- `pnpm --filter shelf-inventory vercel:deploy:production`

### Fallos o riesgos observados

- `tests/p2p-sync-advanced.spec.ts` falla por problemas heredados del test:
  - usa `addOverlayBlocker`
  - ese helper elimina `.fixed.inset-0`
  - los modales de producto/conexion tambien usan esa estructura
  - el test termina eliminando los modales que intenta usar
- Verificacion manual con navegador integrado quedo bloqueada para sesion sin flags por bug existente:
  - `LandingPage`: `t(...).map is not a function`
  - los E2E lo evitan configurando `hasVisited` y `shelfWelcomeSeen`
- GitHub reporto vulnerabilidades Dependabot existentes al hacer push:
  - 47 vulnerabilidades
  - 23 high
  - 19 moderate
  - 5 low

## Deploys realizados

### Deploy previo

- URL production: `https://estante-inventario.vercel.app`
- Deployment directo: `https://shelf-bxb2q00el-iberi22s-projects.vercel.app`

### Deploy final de la sesion

- Commit desplegado: `401c971`
- Deployment ID: `dpl_4vdfveYfDdvc5pg9XARp1ft9EMXH`
- Deployment directo: `https://shelf-b2oob265d-iberi22s-projects.vercel.app`
- Alias production: `https://estante-inventario.vercel.app`
- Estado: `READY`

## Estado git al crear este documento

Antes de crear esta bitacora, `main` estaba sincronizado con `origin/main`, pero habia cambios locales no confirmados en:

- `apps/shelf-inventory/components/Inventory.tsx`
- `apps/shelf-inventory/components/Settings.tsx`
- `apps/shelf-inventory/lib/inventoryConfig.ts`
- `packages/p2p-mesh-core/tests/database-sync.test.ts`

Esos cambios no forman parte del commit `401c971` ni del deploy final documentado aqui.

Nota posterior de documentacion: al revisar el worktree para actualizar porcentajes tambien aparecen cambios locales en `apps/shelf-inventory/tests/crud-operations.spec.ts` y `apps/shelf-inventory/tests/product-history.spec.ts`. Tambien deben tratarse como no desplegados/no confirmados hasta validarlos.

## Pendientes completos para abordar

1. Corregir `LandingPage` para tolerar `t(...)` como string o array.
2. Arreglar `addOverlayBlocker` para que no elimine modales funcionales en E2E.
3. Completar #139 migrando Shelf al nuevo sync layer de `edge-mesh`.
4. Implementar E2E 2 y 3 nodos sin re-broadcast manual.
5. Completar ack/retry formal del protocolo CRDT seguro.
6. Implementar #134: selector de sucursal/bodega, CRUD en Settings, permisos por contexto, `activeBranch/warehouse` y reportes consolidados.
7. Implementar #135: persistencia del timeline, UI historica y failover/promocion asistida sin split-brain.
8. Implementar #136: UI de postulaciones/votos, auditoria y aplicacion del resultado a authority metadata.
9. Dividir #87 en subtareas: local OCR, WebLLM local, perfil/auth local-only y remocion o degradacion offline de dependencias cloud.
10. Auditar Dependabot antes de un release publico amplio.
11. Validar y documentar los cambios locales actuales antes de considerarlos parte del porcentaje implementado.

## Siguientes pasos recomendados

- Corregir `LandingPage` para que no reviente cuando `t(...)` devuelve string y se espera array.
- Separar o arreglar `addOverlayBlocker` para que no destruya modales funcionales en E2E.
- Completar #139 migrando Shelf de forma mas profunda hacia `edge-mesh`.
- Implementar UI para #136, #135 y #134 sobre las primitivas ya creadas.
- Auditar vulnerabilidades Dependabot antes del siguiente release publico amplio.
