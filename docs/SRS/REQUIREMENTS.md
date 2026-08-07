# Software Requirements Specification — shelf

> **Protocol:** GitCore 3.8.0 · **Updated:** 2026-07-17  
> IEEE 830 reduced. Structure **100%**. Keep REQ-IDs in sync with code.

## REQ-001: Protocol compliance (GitCore)

- **Category:** Process  
- **Priority:** High  
- **SRS Estado:** `draft`  
- **Files:** `AGENTS.md`, `.gitcore/ARCHITECTURE.md`, `.git-core-protocol-version`, `SRC.md`, `docs/SRS/`

### Descripción
El repositorio cumple GitCore 3.8.0: lectura de agentes, planning local, SRC y SRS presentes.

### Criterios de aceptación
- [ ] `.git-core-protocol-version` = 3.8.0
- [ ] `AGENTS.md` define orden de lectura
- [ ] `.gitcore/planning/PLANNING.md` y `TASK.md` existen
- [ ] `SRC.md` completo (secciones obligatorias)
- [ ] `docs/SRS/{index,REQUIREMENTS,ARCHITECTURE}.md` existen

---

## REQ-002: Source map (SRC)

- **Category:** Documentation  
- **Priority:** High  
- **SRS Estado:** `draft`  
- **Files:** `SRC.md`

### Descripción
SRC.md describe árbol real, build/test, y enlaces a SRS/.gitcore.

### Criterios de aceptación
- [ ] Tree refleja módulos reales
- [ ] Comandos build/test documentados
- [ ] Cross-links a docs/SRS y AGENTS.md

---

## REQ-003: SWAL node Pro gate (product apps)

- **Category:** Functional  
- **Priority:** High (N/A for pure libraries)  
- **SRS Estado:** `draft`  
- **Files:** *(app-specific Pro gate modules)*

### Descripción
Funciones Pro se habilitan solo con **nodo SWAL activo**. No Stripe para Pro.

### Criterios de aceptación
- [ ] No hay Checkout/webhook Stripe como unlock Pro
- [ ] Gate documentado Free vs Pro
- [ ] Heartbeat/identidad de nodo definido o planificado

---

## REQ-004: Instance isolation (mesh / multi-workspace)

- **Category:** Functional  
- **Priority:** High (N/A if single-tenant tool)  
- **SRS Estado:** `draft`  
- **Files:** *(storage / mesh namespace modules)*

### Descripción
Dos instancias de la misma app no mezclan datos de negocio por defecto. Namespace `swal/{app_id}/{instance_id}`.

### Criterios de aceptación
- [ ] `instance_id` persistido por workspace
- [ ] Sync cruzado solo con vínculo opt-in
- [ ] Memoria Xavier namespaced por instance

---

## REQ-005: Agentic memory (Xavier)

- **Category:** Functional  
- **Priority:** High  
- **SRS Estado:** `draft`  
- **Files:** *(xavier client / config)*

### Descripción
Memoria agentic vía Xavier HTTP (`:8006`) y/o **MCP**, fuera de la BD de negocio.

### Criterios de aceptación
- [ ] Paths de memoria documentados
- [ ] No se persiste working memory agentic solo en DB de dominio
- [ ] Fallo de Xavier no corrompe datos de negocio

---

## REQ-006: Security & secrets

- **Category:** Non-functional  
- **Priority:** High  
- **SRS Estado:** `draft`  
- **Files:** `.gitignore`, `.env.example`, `SECURITY.md` (if any)

### Descripción
Sin secretos en git; `.env.example` sin valores reales.

### Criterios de aceptación
- [ ] `.env` gitignored
- [ ] No API keys en docs de ejemplo
- [ ] Repo **private** salvo excepción documentada

---

## REQ-007: Local CI preference

- **Category:** Process  
- **Priority:** Medium  
- **SRS Estado:** `draft`  
- **Files:** `.github/workflows.disabled/` (if present)

### Descripción
GitHub Actions desactivados por defecto en era privada SWAL; tests locales preferidos.

### Criterios de aceptación
- [ ] Workflows no se ejecutan en GitHub (disabled/moved)
- [ ] Comandos de test locales en SRC.md

---

*Add domain-specific REQ-008+ below. Keep numbering stable.*

---

## REQ-008: Inventory Management (feature SRC-FUN-001)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/Inventory.tsx`, `apps/shelf-inventory/lib/productVariants.ts`, `apps/shelf-inventory/context/AppContext.tsx`, `packages/p2p-mesh-core/src/types.ts`

### User story
- **US:** Como dueño de negocio, quiero gestionar mi inventario digitalmente para saber exactamente qué tengo en stock

### Description
CRUD completo de productos con nombre, SKU, cantidad, precio, costo e imágenes; variantes empaquetables (colores, medidas, versiones/modelos) con catálogos configurables; listas paginadas para inventarios grandes

*Feature: `SRC-FUN-001` · status: implemented*

## REQ-009: Sales Tracking (feature SRC-FUN-002)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/Sales.tsx`, `apps/shelf-inventory/context/AppContext.tsx`

### User story
- **US:** Como vendedor, quiero registrar ventas para que el stock se actualice automáticamente

### Description
Registro de ventas con decremento automático de stock

*Feature: `SRC-FUN-002` · status: implemented*

## REQ-010: Dashboard (feature SRC-FUN-003)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/Dashboard.tsx`, `apps/shelf-inventory/components/ProChartsTeaserCard.tsx`, `apps/shelf-inventory/components/Reports.tsx`

### User story
- **US:** Como dueño, quiero ver un dashboard con mis métricas clave de un vistazo

### Description
Panel principal con métricas clave del negocio en tiempo real

*Feature: `SRC-FUN-003` · status: implemented*

## REQ-011: Contact Management (feature SRC-FUN-004)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/ContactManagementPage.tsx`, `apps/shelf-inventory/components/Clients.tsx`, `apps/shelf-inventory/components/Suppliers.tsx`

### User story
- **US:** Como usuario, quiero gestionar clientes y proveedores desde un mismo lugar

### Description
Gestión unificada de clientes y proveedores

*Feature: `SRC-FUN-004` · status: implemented*

## REQ-012: Purchase Orders (feature SRC-FUN-005)

- **Category:** Functional
- **Priority:** P1
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/PurchaseOrders.tsx`, `packages/p2p-mesh-core/src/types.ts`

### User story
- **US:** Como dueño, quiero crear órdenes de compra a proveedores y que el stock se actualice al recibirlas

### Description
Órdenes de compra a proveedores con actualización automática de stock al recibirlas

*Feature: `SRC-FUN-005` · status: implemented*

## REQ-013: Barcode/QR Scanner (feature SRC-FUN-006)

- **Category:** Functional
- **Priority:** P1
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/BarcodeScanner.tsx`, `apps/shelf-inventory/components/Inventory.tsx`

### User story
- **US:** Como usuario de bodega, quiero escanear códigos de barras para no escribir SKUs manualmente

### Description
Escaneo de códigos de barras y QR para entrada rápida de SKU usando cámara del dispositivo

*Feature: `SRC-FUN-006` · status: implemented*

## REQ-014: AI Assistant (feature SRC-FUN-007)

- **Category:** Functional
- **Priority:** P2
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/AIChat.tsx`, `apps/shelf-inventory/hooks/useWebLLM.ts`, `apps/shelf-inventory/components/Reports.tsx`

### User story
- **US:** Como usuario, quiero preguntarle a un AI sobre mi inventario en lenguaje natural

### Description
Asistente IA para análisis de inventario y preguntas en lenguaje natural (DeepSeek v4 Flash via OpenRouter proxy)

*Feature: `SRC-FUN-007` · status: implemented*

## REQ-015: Authentication (Local) & Device Security (feature SRC-FUN-008)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/context/AuthContext.tsx`, `apps/shelf-inventory/lib/localAuth.ts`, `apps/shelf-inventory/components/LocalLoginModal.tsx`, `apps/shelf-inventory/firestore.rules`

### User story
- **US:** Como usuario, quiero crear una cuenta para sincronizar mis datos en la nube

### Description
Autenticación offline-first con localAuth, app lock, devices y seed recovery. Cloud sync = ROADMAP-003.

*Feature: `SRC-FUN-008` · status: implemented*

## REQ-016: Monetization — Colaborador SWAL (feature SRC-FUN-009)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/context/SubscriptionContext.tsx`, `apps/shelf-inventory/components/SubscriptionModal.tsx`, `apps/shelf-inventory/components/Ads.tsx`, `apps/shelf-inventory/MainApp.tsx`

### User story
- **US:** Como usuario, quiero usar todas las features sin restricciones de tier

### Description
Modelo Colaborador SWAL: todas las features gratis localmente, revenue via profit share (25/15/10%). Sin suscripciones ni ads.

*Feature: `SRC-FUN-009` · status: implemented*

## REQ-017: Multi-language Support (feature SRC-FUN-010)

- **Category:** Functional
- **Priority:** P1
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/context/I18nContext.tsx`, `apps/shelf-inventory/locales/*.json`

### User story
- **US:** Como usuario, quiero usar la app en mi idioma

### Description
Soporte multi-idioma (20 locales) con persistencia de preferencia

*Feature: `SRC-FUN-010` · status: implemented*

## REQ-018: Settings & Data Management (feature SRC-FUN-011)

- **Category:** Functional
- **Priority:** P1
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/NetworkConfig.tsx`, `apps/shelf-inventory/context/CurrencyContext.tsx`

### User story
- **US:** Como usuario, quiero configurar la app y gestionar mis datos

### Description
Configuraciones de usuario (moneda, umbral stock bajo) y gestión de datos (backup/restore JSON, reset)

*Feature: `SRC-FUN-011` · status: implemented*

## REQ-019: Reports & Analytics (feature SRC-FUN-012)

- **Category:** Functional
- **Priority:** P1
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/Reports.tsx`

### User story
- **US:** Como dueño, quiero ver reportes detallados de mi negocio para tomar decisiones

### Description
Reportes avanzados con gráficos (chart.js), filtros, análisis de márgenes y valor de inventario

*Feature: `SRC-FUN-012` · status: implemented*

## REQ-020: Multi-user Access (P2P Team) (feature SRC-FUN-013)

- **Category:** Functional
- **Priority:** P2
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/InviteMemberModal.tsx`, `apps/shelf-inventory/components/NetworkConfig.tsx`, `packages/p2p-mesh-core/src/types.ts`

### User story
- **US:** Como dueño de negocio, quiero invitar a mi equipo con roles y permisos específicos

### Description
Equipo e invitaciones P2P con roles admin/collaborator/vendedor y PeerPermissions.

*Feature: `SRC-FUN-013` · status: implemented*

## REQ-021: Data Import (CSV) (feature SRC-FUN-014)

- **Category:** Functional
- **Priority:** P2
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/components/ImportCSVModal.tsx`, `apps/shelf-inventory/public/template.csv`

### User story
- **US:** Como usuario con inventario existente, quiero importarlo desde un archivo CSV

### Description
Importación CSV con aliases de columnas, validación por fila, template y E2E.

*Feature: `SRC-FUN-014` · status: implemented*

## REQ-022: Post-Quantum Cryptography (feature SRC-PQC-001)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `packages/p2p-mesh-core/src/crypto-pqc.ts`, `packages/p2p-mesh-core/src/crypto.ts`, `packages/p2p-mesh-core/src/p2p.ts`

### User story
- **US:** Como usuario, quiero que mis datos estén protegidos incluso contra computación cuántica

### Description
ML-KEM-768 handshake + ML-DSA-65 firmas; AES-GCM at-rest (PIN/device); dual-ready YJS + EDGE_MESH_ENVELOPE app-AES; authority AES

*Feature: `SRC-PQC-001` · status: implemented*

## REQ-023: P2P Mesh Network (feature SRC-P2P-001)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `packages/p2p-mesh-core/src/p2p.ts`, `apps/shelf-inventory/components/EdgeMeshTransportBinder.tsx`

### User story
- **US:** Como usuario, quiero que los datos se sincronicen entre mis dispositivos sin servidor central

### Description
Red mesh P2P vía WebRTC (PeerJS) offline-first; un solo PeerJS en Shelf (Phase C)

*Feature: `SRC-P2P-001` · status: implemented*

## REQ-024: CRDT Sync (Yjs) (feature SRC-CRDT-001)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `packages/p2p-mesh-core/src/database-sync.ts`, `apps/shelf-inventory/context/AppContext.tsx`

### User story
- **US:** Como usuario, quiero que los cambios se sincronicen sin conflictos entre dispositivos

### Description
Sincronización CRDT Yjs con doc compartido (Phase B); ACL remota de entidades relajada

*Feature: `SRC-CRDT-001` · status: implemented*

## REQ-025: Edge Mesh Runtime (feature SRC-EDGE-001)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `packages/edge-mesh/`, `packages/edge-mesh-react/`, `apps/shelf-inventory/components/EdgeMeshWorkflowBridge.tsx`, `apps/shelf-inventory/components/EdgeMeshTransportBinder.tsx`

### User story
- **US:** Como desarrollador, quiero un runtime P2P reutilizable que encapsule la logica mesh en un package independiente

### Description
Runtime P2P reutilizable con namespaces, authz, Y.Doc compartido, transport late-bind, ACL remota por colección en path primario, crypto universal (Web Crypto API) y rate limiter

*Feature: `SRC-EDGE-001` · status: implemented*

## REQ-026: GPU Agent (WebGPU edge compute) (feature SRC-GPU-001)

- **Category:** Functional
- **Priority:** P1
- **SRS Status:** `active`
- **Files:** `packages/gpu-agent/src/gpu-agent.ts`

### User story
- **US:** Como desarrollador, quiero delegar tareas intensivas al WebGPU local via un package reutilizable

### Description
Edge compute kernels via WebGPU (scale/dot) with CPU fallback; optional EdgeMesh capacity; WebLLM remains app-owned

*Feature: `SRC-GPU-001` · status: implemented*

## REQ-027: Testing Infrastructure (feature SRC-QA-001)

- **Category:** Functional
- **Priority:** P1
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/tests/`, `apps/shelf-inventory/cypress/`, `.github/workflows/ci.yml`

### User story
- **US:** Como desarrollador, quiero tests automatizados para asegurar calidad del código

### Description
Playwright fuerte + Cypress E2E; Biome; GHA file existe; CI runners a veces no ejecutan

*Feature: `SRC-QA-001` · status: implemented*

## REQ-028: PWA & Offline Support (feature SRC-PWA-001)

- **Category:** Functional
- **Priority:** P0
- **SRS Status:** `active`
- **Files:** `apps/shelf-inventory/vite.config.ts`, `apps/shelf-inventory/components/UpdateNotification.tsx`, `apps/shelf-inventory/hooks/usePersistedReducer.ts`

### User story
- **US:** Como usuario, quiero instalar la app y usarla sin internet

### Description
Progressive Web App con soporte offline (Service Worker, localStorage, IndexedDB, vite-plugin-pwa)

*Feature: `SRC-PWA-001` · status: implemented*
