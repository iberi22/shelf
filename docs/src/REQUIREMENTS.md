# Shelf — Functional Requirements (SRC-FUN)

> All 14 functional features are **implemented** ✅
> Source of truth: `.gitcore/features.json`

---

## SRC-FUN-001: Inventory Management
**Priority:** P0 | **Status:** ✅ Implemented

**User Story:** Como dueño de negocio, quiero gestionar mi inventario digitalmente para saber exactamente qué tengo en stock.

**Acceptance Criteria:**
1. CRUD completo de productos (crear, leer, actualizar, eliminar)
2. Campos: nombre, SKU, cantidad, precio, costo, imagen
3. Búsqueda y filtros en listado de productos
4. Stock se actualiza automáticamente al registrar venta

---

## SRC-FUN-002: Sales Tracking
**Priority:** P0 | **Status:** ✅ Implemented

**User Story:** Como vendedor, quiero registrar ventas para que el stock se actualice automáticamente.

**Acceptance Criteria:**
1. Registrar venta seleccionando productos del inventario
2. Decremento automático de stock al confirmar venta
3. Historial de ventas con fecha, productos y total
4. Cálculo automático de revenue y profit por venta

---

## SRC-FUN-003: Dashboard
**Priority:** P0 | **Status:** ✅ Implemented

**User Story:** Como dueño, quiero ver un dashboard con mis métricas clave de un vistazo.

**Acceptance Criteria:**
1. Tarjetas con Revenue, Profit, Ventas totales, Productos totales
2. Dashboard personalizable (elegir qué stats mostrar)
3. Gráficos de ventas en el tiempo (chart.js)
4. Top productos más vendidos

---

## SRC-FUN-004: Contact Management
**Priority:** P0 | **Status:** ✅ Implemented

**User Story:** Como usuario, quiero gestionar clientes y proveedores desde un mismo lugar.

**Acceptance Criteria:**
1. CRUD de clientes (nombre, teléfono, email)
2. CRUD de proveedores (nombre, teléfono, email)
3. Componente genérico `ContactManagementPage` (sin duplicación de código)
4. Refactorizado: ahorro de 300+ líneas de código duplicado

---

## SRC-FUN-005: Purchase Orders
**Priority:** P1 | **Status:** ✅ Implemented

**User Story:** Como dueño, quiero crear órdenes de compra a proveedores y que el stock se actualice al recibirlas.

**Acceptance Criteria:**
1. Crear orden de compra seleccionando proveedor y productos
2. Marcar orden como "recibida" → stock se incrementa automáticamente
3. Listar órdenes activas e históricas
4. Estado de orden (pendiente, recibida, cancelada)

---

## SRC-FUN-006: Barcode/QR Scanner
**Priority:** P1 | **Status:** ✅ Implemented

**User Story:** Como usuario de bodega, quiero escanear códigos de barras para no escribir SKUs manualmente.

**Acceptance Criteria:**
1. Escaneo usando cámara del dispositivo (`html5-qrcode`)
2. Parseo automático de código de barras a campo SKU
3. Soporte para QR y códigos de barras estándar (EAN, UPC, Code128)
4. Feedback visual de escaneo exitoso

---

## SRC-FUN-007: AI Assistant
**Priority:** P2 | **Status:** ✅ Implemented (Pro)

**User Story:** Como usuario Pro, quiero preguntarle a un AI sobre mi inventario en lenguaje natural.

**Acceptance Criteria:**
1. Interfaz de chat integrada en reports page
2. Gemini API conectada vía Firebase Cloud Function (proxy)
3. Gated: solo visible para usuarios Pro
4. Capacidad de responder preguntas sobre datos de inventario, ventas, tendencias

---

## SRC-FUN-008: Authentication & Cloud Sync
**Priority:** P0 | **Status:** ✅ Implemented

**User Story:** Como usuario, quiero crear una cuenta para sincronizar mis datos en la nube.

**Acceptance Criteria:**
1. Registro y login con email y contraseña (Firebase Auth)
2. Sync de estado local (localStorage) a Firestore
3. Restauración de datos al iniciar sesión en otro dispositivo
4. Segregación completa de datos por usuario

---

## SRC-FUN-009: Monetization (Ads + Subscriptions)
**Priority:** P0 | **Status:** ✅ Implemented

**User Story:** Como negocio, quiero que la app genere ingresos vía anuncios y suscripciones.

**Acceptance Criteria:**
1. Anuncios para usuarios free (`DesktopAdColumn`, `MobileAdBars`)
2. Modal de suscripción con planes (Basic, Pro, Pyme)
3. Stripe integrado con webhooks en producción (verificación de firma)
4. Anuncios ocultos automáticamente para usuarios con suscripción activa
5. AdSense IDs configurados vía environment variables

---

## SRC-FUN-010: Multi-language Support
**Priority:** P1 | **Status:** ✅ Implemented

**User Story:** Como usuario, quiero usar la app en mi idioma.

**Acceptance Criteria:**
1. Toggle de idioma en settings: English, Español, Português
2. Traducción completa de toda la UI
3. Persistencia de preferencia de idioma (localStorage)
4. Sistema de traducción vía archivos de locales

---

## SRC-FUN-011: Settings & Data Management
**Priority:** P1 | **Status:** ✅ Implemented

**User Story:** Como usuario, quiero configurar la app y gestionar mis datos.

**Acceptance Criteria:**
1. Respaldo y restauración completa en JSON
2. Reset de datos con confirmación
3. Selección de moneda y formato numérico
4. Configuración de umbral de stock bajo (alertas)
5. Persistencia de todas las configuraciones

---

## SRC-FUN-012: Reports & Analytics
**Priority:** P1 | **Status:** ✅ Implemented

**User Story:** Como dueño, quiero ver reportes detallados de mi negocio para tomar decisiones.

**Acceptance Criteria:**
1. Gráficos de ventas en el tiempo (chart.js + react-chartjs-2)
2. Top productos más vendidos (lista rankeada)
3. Filtros avanzados por fecha, producto y cliente
4. Análisis de márgenes de ganancia
5. Valor total de inventario

---

## SRC-FUN-013: Multi-user Access (Pyme Plan)
**Priority:** P2 | **Status:** ✅ Implemented

**User Story:** Como dueño de negocio, quiero invitar a mi equipo con roles y permisos específicos.

**Acceptance Criteria:**
1. Invitación de miembros del equipo por email
2. Roles con permisos específicos (admin, editor, viewer)
3. Separación de datos por usuario dentro de la misma organización
4. UI de gestión de equipo en settings

---

## SRC-FUN-014: Data Import (CSV)
**Priority:** P2 | **Status:** ✅ Implemented

**User Story:** Como usuario con inventario existente, quiero importarlo desde un archivo CSV.

**Acceptance Criteria:**
1. Upload de archivo CSV
2. Parseo y mapeo de columnas automático
3. Validación de datos importados (errores visibles)
4. Feedback visual del progreso de importación
5. Rollback si hay errores críticos
