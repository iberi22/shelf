## Problema
Necesitamos implementar un sistema de gestión de múltiples contextos (Sucursales y Bodegas) dentro de la red P2P de Shelf Inventory. El Host (Admin) es el dueño de la base de datos principal, pero ahora otros nodos o el mismo host deben poder tener o acceder a bases de datos particionadas lógicamente o contextos por "Sucursal" o "Bodega". 

## Solución Requerida (Jules)
Implementa la lógica central para el manejo de sucursales/bodegas:

1. **Selector de Contexto:** Agrega un selector de Sucursal / Bodega debajo del logo `[ Shelf. ]` en el componente `Sidebar.tsx`. Este selector debe permitir al usuario cambiar el contexto activo de la base de datos (por ejemplo, cambiar entre "Bodega Central", "Sucursal Norte", etc.).
2. **Configuración de Sucursales:** En el módulo de `Settings.tsx`, agrega una sección para que el Host (rol Admin) pueda crear, editar y eliminar Sucursales/Bodegas, asignándoles IDs únicos.
3. **Roles y Permisos por Sucursal:** Asegúrate de que los nodos colaboradores que se sincronicen puedan ser asignados a una sucursal específica para que la sincronización CRDT (Yjs / dbSync) maneje los datos de forma aislada o estructurada por `branchId`.
4. **Informes Consolidados (Reports):** Desde cualquier interfaz del menú (especialmente en `Reports.tsx`), añade la capacidad de "Unir" o consolidar el inventario de varias sucursales/bodegas para generar informes globales.

## Archivos a Modificar
- `apps/shelf-inventory/components/Sidebar.tsx`
- `apps/shelf-inventory/components/Settings.tsx`
- `apps/shelf-inventory/components/Reports.tsx`
- `apps/shelf-inventory/context/AppContext.tsx` (para manejar el estado global de `activeBranch`)
- `packages/p2p-mesh-core/src/database-sync.ts` (lógica de partición o metadatos de Yjs por sucursal)
