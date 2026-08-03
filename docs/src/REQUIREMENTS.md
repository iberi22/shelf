# Shelf - Functional Requirements (SRC-FUN)

> Honest audit 2026-07-18 (deep codebase scan): percentages reflect code + tests vs acceptance criteria (not aspirational 100%).
> **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`
> Project average (all 21 SRC): **~91%** · FUN avg **~92%** · 21 implemented / 0 partial / 0 skeleton
> Human-readable mirror: `apps/shelf-inventory/FEATURES_STATUS.md`

## Status Summary

| SRC ID | Feature | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
| SRC-FUN-001 | Inventory Management | P0 | Implemented | 96% |
| SRC-FUN-002 | Sales Tracking | P0 | Implemented | 97% |
| SRC-FUN-003 | Dashboard | P0 | Implemented | 92% |
| SRC-FUN-004 | Contact Management | P0 | Implemented | 98% |
| SRC-FUN-005 | Purchase Orders | P1 | Implemented | 94% |
| SRC-FUN-006 | Barcode/QR Scanner | P1 | Implemented | 90% |
| SRC-FUN-007 | AI Assistant | P2 | Implemented | 86% |
| SRC-FUN-008 | Authentication (Local) & Device Security | P0 | Implemented | 88% |
| SRC-FUN-009 | Monetization — Colaborador SWAL | P0 | Implemented | 90% |
| SRC-FUN-010 | Multi-language Support | P1 | Implemented | 90% |
| SRC-FUN-011 | Settings & Data Management | P1 | Implemented | 93% |
| SRC-FUN-012 | Reports & Analytics | P1 | Implemented | 92% |
| SRC-FUN-013 | Multi-user Access (P2P Team) | P2 | Implemented | 90% |
| SRC-FUN-014 | Data Import (CSV) | P2 | Implemented | 94% |


## SRC-FUN-001: Inventory Management

**Priority:** P0 | **Status:** Implemented | **Implementation:** 96%

**User Story:** Como dueno de negocio, quiero gestionar mi inventario digitalmente para saber exactamente que tengo en stock.

**Acceptance Criteria:**

1. CRUD completo de productos.
2. Campos: nombre, SKU, cantidad, precio, costo e imagen.
3. Busqueda y filtros en listado de productos.
4. Stock se actualiza automaticamente al registrar venta.

## SRC-FUN-002: Sales Tracking

**Priority:** P0 | **Status:** Implemented | **Implementation:** 97%

**User Story:** Como vendedor, quiero registrar ventas para que el stock se actualice automaticamente.

**Acceptance Criteria:**

1. Registrar venta seleccionando productos del inventario.
2. Decremento automatico de stock al confirmar venta.
3. Historial de ventas con fecha, productos y total.
4. Calculo automatico de revenue y profit por venta.

## SRC-FUN-003: Dashboard

**Priority:** P0 | **Status:** Implemented | **Implementation:** 92%

**User Story:** Como dueno, quiero ver un dashboard con mis metricas clave de un vistazo.

**Acceptance Criteria:**

1. Tarjetas con revenue, profit, ventas totales y productos totales.
2. Dashboard personalizable.
3. Graficos de ventas en el tiempo.
4. Top productos mas vendidos.

## SRC-FUN-004: Contact Management

**Priority:** P0 | **Status:** Implemented | **Implementation:** 98%

**User Story:** Como usuario, quiero gestionar clientes y proveedores desde un mismo lugar.

**Acceptance Criteria:**

1. CRUD de clientes.
2. CRUD de proveedores.
3. Componente generico `ContactManagementPage`.
4. Reduccion de duplicacion entre clientes y proveedores.

## SRC-FUN-005: Purchase Orders

**Priority:** P1 | **Status:** Implemented | **Implementation:** 94%

**User Story:** Como dueno, quiero crear ordenes de compra a proveedores y que el stock se actualice al recibirlas.

**Acceptance Criteria:**

1. Crear orden de compra seleccionando proveedor y productos.
2. Marcar orden como recibida incrementa el stock.
3. Listar ordenes activas e historicas.
4. Estado de orden: pendiente, recibida o cancelada.

## SRC-FUN-006: Barcode/QR Scanner

**Priority:** P1 | **Status:** Implemented | **Implementation:** 90%

**User Story:** Como usuario de bodega, quiero escanear codigos de barras para no escribir SKUs manualmente.

**Acceptance Criteria:**

1. Escaneo usando camara del dispositivo con `html5-qrcode`.
2. Parseo automatico de codigo a campo SKU.
3. Soporte para QR y codigos estandar.
4. Feedback visual de escaneo exitoso.

## SRC-FUN-007: AI Assistant

**Priority:** P2 | **Status:** Implemented | **Implementation:** 86%

**User Story:** Como usuario Pro, quiero preguntarle a un AI sobre mi inventario en lenguaje natural.

**Acceptance Criteria:**

1. Interfaz de chat integrada en reports.
2. Gemini API conectada via Firebase Cloud Function proxy.
3. Gated para usuarios Pro.
4. Respuestas sobre inventario, ventas y tendencias.

**Open Work:** Cloud-backed AI is not the final #87 target. Local WebLLM/StockBot, local OCR, and fully offline AI behavior remain pending.

## SRC-FUN-008: Authentication (Local) & Device Security

**Priority:** P0 | **Status:** Implemented | **Implementation:** 88%

**User Story:** Como usuario, quiero crear una cuenta para sincronizar mis datos.

**Runtime reality (Audit 2026-07-17):** Auth is **localAuth only** (no Firebase Auth SDK, no Firestore client). Cloud sync remains ROADMAP-003.

**Acceptance Criteria (historical / aspirational):**

1. Registro y login con email y password (AC original: Firebase Auth — **not runtime**).
2. Sync de estado local a Firestore (**not implemented**).
3. Restauracion de datos en otro dispositivo (P2P/backup JSON, not cloud login).
4. Segregacion de datos por usuario (local device profile only).

**Open Work:** Align ACs to localAuth; optional future cloud = ROADMAP-003. Guest tier must not hardcode pyme.

## SRC-FUN-009: Monetization — Colaborador SWAL

**Priority:** P0 | **Status:** Implemented | **Implementation:** 90%

**User Story:** Como usuario, quiero usar todas las features locales de forma gratuita y sin anuncios, participando activamente del ecosistema SWAL mediante un nodo si requiero capacidades multi-instancia avanzadas.

**Runtime reality (Audit 2026-07-17):** Se eliminaron los anuncios y las suscripciones obligatorias locales. Todas las features del core de la aplicación son gratuitas y offline-first. Las características premium/Pro se desbloquean mediante un nodo SWAL activo (not Stripe).

**Acceptance Criteria:**

1. Todas las features accesibles sin restricciones de planes locales.
2. Sin anuncios intrusivos en la UI (anuncios eliminados).
3. Estado Pro habilitado a través de un nodo SWAL activo (not Stripe).
4. Stripe configurado únicamente para transacciones opcionales: payouts de colaboradores bajo el modelo de reparto de ingresos (25/15/10% profit sharing), soporte voluntario de infraestructura en la nube o staking.
5. Verificación segura de firmas para webhooks de Stripe en backend para procesar estas transacciones auxiliares.

**Open Work:** Desacoplamiento final de componentes legacy de ads/checkout y migración al modelo 100% libre localmente.

## SRC-FUN-010: Multi-language Support

**Priority:** P1 | **Status:** Implemented | **Implementation:** 90%

**User Story:** Como usuario, quiero usar la app en mi idioma.

**Acceptance Criteria:**

1. Toggle de idioma en settings.
2. Traduccion completa de UI principal.
3. Persistencia de preferencia.
4. Sistema de traduccion via archivos locales.

## SRC-FUN-011: Settings & Data Management

**Priority:** P1 | **Status:** Implemented | **Implementation:** 93%

**User Story:** Como usuario, quiero configurar la app y gestionar mis datos.

**Acceptance Criteria:**

1. Backup y restore JSON.
2. Reset de datos con confirmacion.
3. Seleccion de moneda y formato numerico.
4. Configuracion de umbral de stock bajo.
5. Persistencia de configuraciones.

**Open Work:** Recent inventory configuration UX changes are local and must be validated before counting as deployed.

## SRC-FUN-012: Reports & Analytics

**Priority:** P1 | **Status:** Implemented | **Implementation:** 92%

**User Story:** Como dueno, quiero ver reportes detallados de mi negocio para tomar decisiones.

**Acceptance Criteria:**

1. Graficos de ventas en el tiempo.
2. Top productos mas vendidos.
3. Filtros avanzados.
4. Analisis de margenes.
5. Valor total de inventario.

## SRC-FUN-013: Multi-user Access (P2P Team)

**Priority:** P2 | **Status:** Implemented | **Implementation:** 90%

**User Story:** Como dueno de negocio, quiero invitar a mi equipo con roles y permisos especificos.

**Acceptance Criteria:**

1. Invitacion de miembros.
2. Roles con permisos.
3. Separacion de datos por usuario/organizacion.
4. UI de gestion de equipo.

**Open Work:** Backend enforcement, branch/warehouse context permissions (#134), admin consensus (#136), and authority metadata behavior remain incomplete.

## SRC-FUN-014: Data Import (CSV)

**Priority:** P2 | **Status:** Implemented | **Implementation:** 94%

**User Story:** Como usuario con inventario existente, quiero importarlo desde CSV.

**Acceptance Criteria:**

1. Upload de archivo CSV.
2. Parseo y mapeo de columnas.
3. Validacion de datos importados.
4. Feedback de progreso.
5. Rollback en errores criticos.
