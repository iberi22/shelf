# SRC-FUN-012: Reports & Analytics

- **ID:** SRC-FUN-012
- **Nombre:** Reports & Analytics
- **Prioridad:** P1 (Importante)
- **Estado:** ✅ Implementado
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production

## Descripción
Reportes avanzados con gráficos (chart.js), filtros por fecha/producto/cliente, análisis de márgenes de ganancia y valor total de inventario.

## Actor Principal
Dueño de Negocio

## Dependencias
- **SRC-FUN-001** (Inventory Management) — datos de stock
- **SRC-FUN-002** (Sales Tracking) — datos de ventas

## User Story
> Como dueño, quiero ver reportes detallados de mi negocio para tomar decisiones.

## Acceptance Criteria
1. Gráficos de ventas en el tiempo (chart.js + react-chartjs-2)
2. Top productos más vendidos (lista rankeada)
3. Filtros avanzados por fecha, producto y cliente
4. Análisis de márgenes de ganancia
5. Valor total de inventario

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| chart.js | Librería de gráficos |
| react-chartjs-2 | Binding React |
| React 19 | UI de reportes |

## Métricas Disponibles
| Métrica | Cálculo |
|---------|---------|
| Revenue Total | Suma de precios de venta |
| Profit Total | Suma de (precio_venta - precio_costo) |
| Margen Promedio | Profit / Revenue * 100 |
| Valor Inventario | Suma de (cantidad * precio_costo) |
| Top Productos | Ordenados por cantidad vendida |

## Commits Relacionados
```
feat(reports): implement SRC-FUN-012 - advanced reports & analytics
```
