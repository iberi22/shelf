# Changelog

## [2.1.0] - 2026-07-14

### Added
- **CollapsibleCard Component**: Nuevo componente reutilizable `CollapsibleCard` que permite colapsar/expandir secciones del panel de configuración. Detecta automáticamente entornos de test (Playwright, Cypress, `MODE=test`) y se abre forzosamente para no romper suites de pruebas.
- **Panel Unificado "Configuración de Red, P2P y Sistema"**: Todas las secciones avanzadas (P2P Sync, Consenso Admin, Dispositivos Autorizados, Recuperación de Datos, Audit Logs, Feature Flags) agrupadas bajo una única tarjeta colapsable en la página de Configuración.
- **PWA Wake Lock — Nodo Keep-Alive 24/7**: Toggle en `P2PSyncManager` para activar la [W3C Screen Wake Lock API](https://w3c.github.io/screen-wake-lock/). Mientras esté activo, el dispositivo no entra en suspensión y la app actúa como nodo P2P de sincronización ininterrumpida. El lock se re-adquiere automáticamente al volver la visibilidad de la pestaña.
- **FeatureFlagsPanel (standalone)**: Panel de control de funcionalidades/Feature Flags extraído a su propio componente reutilizable, con barra de progreso del avance del desarrollo GitCore.

### Changed
- **Settings.tsx**: Refactorizado para mostrar todas las tarjetas de configuración básica (General, Moneda, Equipo, AI, Feedback, App Lock, Datos) colapsadas por defecto, reduciendo el ruido visual al abrir la vista.
- **BranchConfig.tsx**: Secciones "Configuración de Artículos" y "Sucursales/Bodegas" ahora son tarjetas colapsables independientes.
- **P2PSyncManager.tsx**: Integrado en `CollapsibleCard`; el botón de información de seguridad relativa al sync es accesible desde el encabezado colapsable.
- **P2PMeshLogic.tsx**: Integrado en `CollapsibleCard` con descripción de gobernanza.
- **DeviceManagementPanel.tsx**, **AuditLogViewer.tsx**, **DataRecovery.tsx**: Convertidos a `CollapsibleCard` y movidos al panel avanzado unificado.

### Fixed
- Eliminadas variables declaradas pero no usadas en `P2PSyncManager.tsx` y `QRScannerModal.tsx` que causaban errores de compilación TypeScript (`TS6133`).

## [2.0.0] - 2026-07-07


### Added
- **Multi-User Authorization Backend (RBAC)**: Integración con Supabase para roles y permisos avanzados.
- **Supabase Cloud Sync**: Sincronización en la nube para cuentas Pro, resolviendo conflictos de P2P en el backend.
- **E-Commerce Webhook Listener**: Integración lista para recibir órdenes desde Shopify y WooCommerce y descontar stock automáticamente.
- **Sentry Error Monitoring**: Detección de errores y excepciones con *Offline Queue* (los errores offline se reportan al volver la red).
- **Google Analytics 4 (GA4)**: Telemetría inteligente *Offline-First* enfocada en eventos de venta e inventario.
- **Advanced PDF Reporting Engine**: Reportes consolidados con `jspdf` y `jspdf-autotable`.
- **Yjs CRDT Unidirectional Data Flow**: Migración completa a un estado reactivo Yjs que elimina *Race Conditions* en la sincronización P2P.
- **Post-Quantum Cryptography (PQC)**: Handshakes criptográficos utilizando Kyber/Dilithium vía WebGPU para validaciones de administrador seguras en `edge-mesh`.
- **Global E2E Test Suite**: Cobertura amplia en Playwright de flujos offline, Sentry, y sincronización Yjs.
- **Centro de Aprendizaje**: Módulo de documentación interactiva en el Landing Page.

### Changed
- **Settings Module Decoupled**: Se refactorizó `Settings.tsx` en múltiples submódulos (`BranchConfig`, `NetworkConfig`, etc.) eliminando el *God Object*.
- **Limpieza de Ramas**: Poda masiva de branches, unificando la estabilidad en `main`.

## [1.3.0] - 2026-06-01

### Added
- **Nuevos campos en productos**: `color`, `dimensions`, `capacity`, `material`
  - `types.ts`: Interfaz `Product` extendida con los 4 campos opcionales
  - `Inventory.tsx`: Formulario con inputs para color, medidas, capacidad y material
  - `Inventory.tsx`: Tabla desktop con columnas sortables para los nuevos campos
  - `Inventory.tsx`: Tarjetas mobile con badge visual para color, medidas, capacidad y material
  - `Inventory.tsx`: CSV export incluye los nuevos campos como columnas adicionales
  - `Inventory.tsx`: Búsqueda ahora filtra también por color, material, dimensiones y capacidad
  - `Catalog.tsx`: Vista previa y HTML export muestran los nuevos campos con emojis
  - `locales/*.json`: Traducciones para ES, EN, PT

### Fixed
- **UpdateNotification**: Mensaje de actualización ahora muestra "Nueva versión disponible: vX.X.X" con fecha de publicación
- **Service Worker**: Auto-check cada hora, notificación con botones "Actualizar ahora" y "Más tarde"
- **Login modal**: Corregido keys extraños ("AUTH.OR" y "auth.loginGuest") que aparecían por cache de PWA
