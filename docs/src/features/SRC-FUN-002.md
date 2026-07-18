# SRC-FUN-002: Sales Tracking

- **ID:** SRC-FUN-002
- **Nombre:** Sales Tracking
- **Prioridad:** P0 (Core)
- **Estado:** ✅ Implemented
- **Implementation:** 97%
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

## Descripción
Registro de ventas con decremento automático de stock. Cada venta resta del inventario y calcula revenue/profit automáticamente.

## Actor Principal
Vendedor / Cajero

## Dependencias
- **SRC-FUN-001** (Inventory Management) — necesita productos para registrar ventas

## User Story
> Como vendedor, quiero registrar ventas para que el stock se actualice automáticamente.

## Acceptance Criteria
1. Registrar venta seleccionando productos del inventario
2. Decremento automático de stock al confirmar venta
3. Historial de ventas con fecha, productos y total
4. Cálculo automático de revenue y profit por venta

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| React 19 | UI de punto de venta |
| localStorage | Persistencia offline de transacciones |
| Context API | Estado global de ventas |

## Detalles Técnicos
- **Transacciones atómicas:** La venta decrementa stock en misma operación
- **Rollback:** Si falla el decremento de stock, se cancela la venta
- **Historial:** Ordenado por fecha descendente
- **Profit:** Calculado como (precio_venta - precio_costo) * cantidad

## Commits Relacionados
```
feat(sales): implement SRC-FUN-002 - sales tracking with auto stock decrement
```
