# Shelf - Functional Requirements (SRC-FUN)

> Base CRUD and operational features are implemented, but the full strategic roadmap is not 100% complete.
> Current percentages are tracked in `apps/shelf-inventory/FEATURES_STATUS.md`.
> Source of truth for generated feature definitions: `.gitcore/features.json`.

## Status Summary

| SRC ID | Feature | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
| SRC-FUN-001 | Inventory Management | P0 | Implemented | 100% |
| SRC-FUN-002 | Sales Tracking | P0 | Implemented | 100% |
| SRC-FUN-003 | Dashboard | P0 | Implemented | 100% |
| SRC-FUN-004 | Contact Management | P0 | Implemented | 100% |
| SRC-FUN-005 | Purchase Orders | P1 | Implemented | 100% |
| SRC-FUN-006 | Barcode/QR Scanner | P1 | Implemented | 100% |
| SRC-FUN-007 | AI Assistant | P2 | Partial | 80% |
| SRC-FUN-008 | Authentication & Cloud Sync | P0 | Partial | 65% |
| SRC-FUN-009 | Monetization (Ads + Subscriptions) | P0 | Partial | 75% |
| SRC-FUN-010 | Multi-language Support | P1 | Implemented | 100% |
| SRC-FUN-011 | Settings & Data Management | P1 | Implemented | 95% |
| SRC-FUN-012 | Reports & Analytics | P1 | Implemented | 100% |
| SRC-FUN-013 | Multi-user Access (Pyme Plan) | P2 | Partial | 70% |
| SRC-FUN-014 | Data Import (CSV) | P2 | Implemented | 100% |

## SRC-FUN-001: Inventory Management

**Priority:** P0 | **Status:** Implemented | **Implementation:** 100%

**User Story:** Como dueno de negocio, quiero gestionar mi inventario digitalmente para saber exactamente que tengo en stock.

**Acceptance Criteria:**

1. CRUD completo de productos.
2. Campos: nombre, SKU, cantidad, precio, costo e imagen.
3. Busqueda y filtros en listado de productos.
4. Stock se actualiza automaticamente al registrar venta.

## SRC-FUN-002: Sales Tracking

**Priority:** P0 | **Status:** Implemented | **Implementation:** 100%

**User Story:** Como vendedor, quiero registrar ventas para que el stock se actualice automaticamente.

**Acceptance Criteria:**

1. Registrar venta seleccionando productos del inventario.
2. Decremento automatico de stock al confirmar venta.
3. Historial de ventas con fecha, productos y total.
4. Calculo automatico de revenue y profit por venta.

## SRC-FUN-003: Dashboard

**Priority:** P0 | **Status:** Implemented | **Implementation:** 100%

**User Story:** Como dueno, quiero ver un dashboard con mis metricas clave de un vistazo.

**Acceptance Criteria:**

1. Tarjetas con revenue, profit, ventas totales y productos totales.
2. Dashboard personalizable.
3. Graficos de ventas en el tiempo.
4. Top productos mas vendidos.

## SRC-FUN-004: Contact Management

**Priority:** P0 | **Status:** Implemented | **Implementation:** 100%

**User Story:** Como usuario, quiero gestionar clientes y proveedores desde un mismo lugar.

**Acceptance Criteria:**

1. CRUD de clientes.
2. CRUD de proveedores.
3. Componente generico `ContactManagementPage`.
4. Reduccion de duplicacion entre clientes y proveedores.

## SRC-FUN-005: Purchase Orders

**Priority:** P1 | **Status:** Implemented | **Implementation:** 100%

**User Story:** Como dueno, quiero crear ordenes de compra a proveedores y que el stock se actualice al recibirlas.

**Acceptance Criteria:**

1. Crear orden de compra seleccionando proveedor y productos.
2. Marcar orden como recibida incrementa el stock.
3. Listar ordenes activas e historicas.
4. Estado de orden: pendiente, recibida o cancelada.

## SRC-FUN-006: Barcode/QR Scanner

**Priority:** P1 | **Status:** Implemented | **Implementation:** 100%

**User Story:** Como usuario de bodega, quiero escanear codigos de barras para no escribir SKUs manualmente.

**Acceptance Criteria:**

1. Escaneo usando camara del dispositivo con `html5-qrcode`.
2. Parseo automatico de codigo a campo SKU.
3. Soporte para QR y codigos estandar.
4. Feedback visual de escaneo exitoso.

## SRC-FUN-007: AI Assistant

**Priority:** P2 | **Status:** Partial | **Implementation:** 80%

**User Story:** Como usuario Pro, quiero preguntarle a un AI sobre mi inventario en lenguaje natural.

**Acceptance Criteria:**

1. Interfaz de chat integrada en reports.
2. Gemini API conectada via Firebase Cloud Function proxy.
3. Gated para usuarios Pro.
4. Respuestas sobre inventario, ventas y tendencias.

**Open Work:** Cloud-backed AI is not the final #87 target. Local WebLLM/StockBot, local OCR, and fully offline AI behavior remain pending.

## SRC-FUN-008: Authentication & Cloud Sync

**Priority:** P0 | **Status:** Partial | **Implementation:** 65%

**User Story:** Como usuario, quiero crear una cuenta para sincronizar mis datos.

**Acceptance Criteria:**

1. Registro y login con email y password.
2. Sync de estado local a Firestore.
3. Restauracion de datos en otro dispositivo.
4. Segregacion de datos por usuario.

**Open Work:** Full cloud sync is not fully verified as the strategic direction. The #87 local-only pivot may require reducing or degrading cloud dependencies.

## SRC-FUN-009: Monetization (Ads + Subscriptions)

**Priority:** P0 | **Status:** Partial | **Implementation:** 75%

**User Story:** Como negocio, quiero que la app genere ingresos via anuncios y suscripciones.

**Acceptance Criteria:**

1. Anuncios para usuarios free.
2. Modal de suscripcion con planes.
3. Stripe integrado con webhooks en produccion.
4. Anuncios ocultos para usuarios con suscripcion activa.
5. AdSense IDs configurados via environment variables.

**Open Work:** Environment variables, backend deployment, and production webhook verification remain required before this should be counted as complete.

## SRC-FUN-010: Multi-language Support

**Priority:** P1 | **Status:** Implemented | **Implementation:** 100%

**User Story:** Como usuario, quiero usar la app en mi idioma.

**Acceptance Criteria:**

1. Toggle de idioma en settings.
2. Traduccion completa de UI principal.
3. Persistencia de preferencia.
4. Sistema de traduccion via archivos locales.

## SRC-FUN-011: Settings & Data Management

**Priority:** P1 | **Status:** Implemented | **Implementation:** 95%

**User Story:** Como usuario, quiero configurar la app y gestionar mis datos.

**Acceptance Criteria:**

1. Backup y restore JSON.
2. Reset de datos con confirmacion.
3. Seleccion de moneda y formato numerico.
4. Configuracion de umbral de stock bajo.
5. Persistencia de configuraciones.

**Open Work:** Recent inventory configuration UX changes are local and must be validated before counting as deployed.

## SRC-FUN-012: Reports & Analytics

**Priority:** P1 | **Status:** Implemented | **Implementation:** 100%

**User Story:** Como dueno, quiero ver reportes detallados de mi negocio para tomar decisiones.

**Acceptance Criteria:**

1. Graficos de ventas en el tiempo.
2. Top productos mas vendidos.
3. Filtros avanzados.
4. Analisis de margenes.
5. Valor total de inventario.

## SRC-FUN-013: Multi-user Access (Pyme Plan)

**Priority:** P2 | **Status:** Partial | **Implementation:** 70%

**User Story:** Como dueno de negocio, quiero invitar a mi equipo con roles y permisos especificos.

**Acceptance Criteria:**

1. Invitacion de miembros.
2. Roles con permisos.
3. Separacion de datos por usuario/organizacion.
4. UI de gestion de equipo.

**Open Work:** Backend enforcement, branch/warehouse context permissions (#134), admin consensus (#136), and authority metadata behavior remain incomplete.

## SRC-FUN-014: Data Import (CSV)

**Priority:** P2 | **Status:** Implemented | **Implementation:** 100%

**User Story:** Como usuario con inventario existente, quiero importarlo desde CSV.

**Acceptance Criteria:**

1. Upload de archivo CSV.
2. Parseo y mapeo de columnas.
3. Validacion de datos importados.
4. Feedback de progreso.
5. Rollback en errores criticos.
