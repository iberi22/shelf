# Responsive Table Fix: Scroll horizontal en lugar de ocultar

**Fecha:** 2026-06-01
**Subagente:** frontend-subagent

## Problema

Las tablas desaparecían abruptamente en `md:768px` para mostrar cards mobile. No había transición suave entre tamaños de ventana.

## Cambios realizados

### 1. Tablas ahora visibles en todo rango >640px

En 5 componentes, se quitó `hidden md:block` del wrapper de la tabla:
- `components/Inventory.tsx`
- `components/Sales.tsx`
- `components/PurchaseOrders.tsx`
- `components/ContactManagementPage.tsx`
- `components/Arqueo.tsx`

Cada tabla ya tenía `overflow-x-auto` interno, así que ahora hace scroll horizontal suave entre 640-1024px en lugar de desaparecer.

### 2. Cards mobile pasaron de `md:hidden` a `sm:hidden`

El breakpoint para mostrar cards se cambió de 768px a 640px:
- `md:hidden` → `sm:hidden` en los 5 componentes

Esto significa:
- **>1024px**: Tabla completa (con columnas extra via `hidden lg:table-cell`)
- **640-1024px**: Misma tabla con scroll horizontal (overflow-x-auto)
- **<640px**: Cards mobile

### 3. Sin cambios de testids, colores, fondos ni bordes

Solo cambiaron clases de visibilidad en los wrappers.

## Build

`pnpm build` → ✅ compila sin errores.
