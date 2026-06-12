# Shelf — User Stories

> All user stories organized by actor role.

---

## 👤 Dueño de Negocio / Administrador

| # | Story | Feature | SRC ID |
|---|-------|---------|--------|
| 1 | Quiero gestionar mi inventario digitalmente para saber exactamente qué tengo en stock | Inventory Management | FUN-001 |
| 2 | Quiero ver un dashboard con mis métricas clave de un vistazo | Dashboard | FUN-003 |
| 3 | Quiero crear órdenes de compra y que el stock se actualice al recibirlas | Purchase Orders | FUN-005 |
| 4 | Quiero ver reportes detallados de mi negocio para tomar decisiones | Reports & Analytics | FUN-012 |
| 5 | Quiero invitar a mi equipo con roles y permisos específicos | Multi-user Access | FUN-013 |

## 🛒 Vendedor / Cajero

| # | Story | Feature | SRC ID |
|---|-------|---------|--------|
| 1 | Quiero registrar ventas para que el stock se actualice automáticamente | Sales Tracking | FUN-002 |
| 2 | Quiero escanear códigos de barras para no escribir SKUs manualmente | Barcode Scanner | FUN-006 |
| 3 | Quiero gestionar clientes y proveedores desde un mismo lugar | Contact Management | FUN-004 |

## 👨‍🔧 Usuario de Bodega

| # | Story | Feature | SRC ID |
|---|-------|---------|--------|
| 1 | Quiero importar mi inventario existente desde un archivo CSV | Data Import | FUN-014 |
| 2 | Quiero que los datos se sincronicen entre dispositivos sin servidor central | P2P Mesh | P2P-001 |
| 3 | Quiero que los cambios se sincronicen sin conflictos | CRDT Sync | CRDT-001 |

## 🆓 Usuario Free

| # | Story | Feature | SRC ID |
|---|-------|---------|--------|
| 1 | Quiero usar la app completa sin pagar, viendo anuncios | Monetization | FUN-009 |
| 2 | Quiero usar la app en mi idioma | Multi-language | FUN-010 |
| 3 | Quiero instalar la app y usarla sin internet | PWA & Offline | PWA-001 |
| 4 | Quiero configurar la app a mi gusto (moneda, backup, etc.) | Settings | FUN-011 |

## 💎 Usuario Pro

| # | Story | Feature | SRC ID |
|---|-------|---------|--------|
| 1 | Quiero crear una cuenta para sincronizar mis datos en la nube | Auth & Cloud Sync | FUN-008 |
| 2 | Quiero preguntarle a un AI sobre mi inventario en lenguaje natural | AI Assistant | FUN-007 |
| 3 | Quiero una experiencia sin anuncios | Monetization | FUN-009 |
| 4 | Quiero que mis datos estén protegidos contra computación cuántica | Post-Quantum Crypto | PQC-001 |

## 👨‍💻 Desarrollador

| # | Story | Feature | SRC ID |
|---|-------|---------|--------|
| 1 | Quiero tests automatizados para asegurar calidad del código | Testing | QA-001 |
| 2 | Quiero linting y formatting automáticos | Testing | QA-001 |
| 3 | Quiero CI/CD para deploys automáticos | Testing | QA-001 |
