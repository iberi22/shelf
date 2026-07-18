# SRC-FUN-003: Dashboard

- **ID:** SRC-FUN-003
- **Nombre:** Dashboard
- **Prioridad:** P0 (Core)
- **Estado:** ⚠️ Partial
- **Implementation:** 68%
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

> **Audit 2026-07-17:** Charts del Dashboard son teaser con datos fake (`ProChartsTeaserCard`); top productos viven en Reports, no en Dashboard; card totalProducts suma cantidades, no cuenta SKUs.

## Descripción
Panel principal con métricas clave del negocio en tiempo real: Revenue, Profit, Ventas totales, Productos totales. Incluye gráficos de ventas en el tiempo y top productos más vendidos.

## Actor Principal
Dueño de Negocio / Administrador

## Dependencias
- **SRC-FUN-001** (Inventory Management) — datos de productos
- **SRC-FUN-002** (Sales Tracking) — datos de ventas

## User Story
> Como dueño, quiero ver un dashboard con mis métricas clave de un vistazo.

## Acceptance Criteria
1. Tarjetas con Revenue, Profit, Ventas totales, Productos totales
2. Dashboard personalizable (elegir qué stats mostrar)
3. Gráficos de ventas en el tiempo (chart.js)
4. Top productos más vendidos

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| React 19 | UI del dashboard |
| chart.js 4 | Gráficos de ventas |
| react-chartjs-2 | Binding React para chart.js |

## Detalles Técnicos
- **Métricas en vivo:** Se recalculan al cambiar estado de inventario/ventas
- **Persistencia:** Preferencias de dashboard guardadas en localStorage
- **Gráficos:** Línea (ventas en tiempo), Barra (top productos), Tarjetas (KPIs)

## Commits Relacionados
```
feat(dashboard): implement SRC-FUN-003 - business metrics dashboard
```
