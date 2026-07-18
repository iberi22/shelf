# SRC-FUN-005: Purchase Orders

- **ID:** SRC-FUN-005
- **Nombre:** Purchase Orders
- **Prioridad:** P1 (Importante)
- **Estado:** ⚠️ Partial
- **Implementation:** 94%
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

> **Audit 2026-07-18:** 94% · implemented · maturity `integrated`. SSOT: `.gitcore/features.json`.

## Descripción
Órdenes de compra a proveedores con estados (pendiente, recibida, cancelada). Al marcar como recibida, el stock se incrementa automáticamente.

## Actor Principal
Dueño de Negocio

## Dependencias
- **SRC-FUN-001** (Inventory Management) — productos a ordenar
- **SRC-FUN-004** (Contact Management) — proveedores

## User Story
> Como dueño, quiero crear órdenes de compra a proveedores y que el stock se actualice al recibirlas.

## Acceptance Criteria
1. Crear orden de compra seleccionando proveedor y productos
2. Marcar orden como recibida → stock se incrementa automáticamente
3. Listar órdenes activas e históricas
4. Estado de orden: pendiente, recibida, cancelada

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| React 19 | UI de órdenes |
| localStorage | Persistencia offline |
| Context API | Estado global |

## Detalles Técnicos
- **Flujo:** Crear orden → estado "pendiente" → recibir productos → estado "recibida" + incrementar stock
- **Validación:** No se puede recibir una orden ya recibida o cancelada
- **Historial:** Todas las órdenes visibles con filtro por estado

## Commits Relacionados
```
feat(purchases): implement SRC-FUN-005 - purchase orders with auto stock update
```
