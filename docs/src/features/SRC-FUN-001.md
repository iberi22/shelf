# SRC-FUN-001: Inventory Management

- **ID:** SRC-FUN-001
- **Nombre:** Inventory Management
- **Prioridad:** P0 (Core)
- **Estado:** ✅ Implemented
- **Implementation:** 96%
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

## Descripción
CRUD completo de productos con nombre, SKU, cantidad, precio, costo e imágenes. Es el feature fundamental del sistema de inventario; todos los demás features dependen de este.

## Actor Principal
Dueño de Negocio / Administrador

## Dependencias
Ninguna

## User Story
> Como dueño de negocio, quiero gestionar mi inventario digitalmente para saber exactamente qué tengo en stock.

## Acceptance Criteria
1. Crear producto con nombre, SKU, cantidad, precio, costo, imagen
2. Editar producto existente
3. Eliminar producto
4. Listar productos con búsqueda y filtros
5. Cantidad se actualiza automáticamente al vender

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| React 19 | UI de formularios y listados |
| localStorage | Persistencia offline |
| Firestore | Sincronización cloud (Pro) |
| Context API | Estado global del inventario |

## Detalles Técnicos
- **Modelo de datos:** Product { id, name, sku, quantity, price, cost, image, createdAt, updatedAt }
- **Validación:** SKU único, cantidad >= 0, precio > 0
- **Almacenamiento local:** localStorage con clave `shelf-inventory:state`
- **Sync:** Push/Pull a Firestore cuando usuario Pro está autenticado

## Commits Relacionados
```
feat(inventory): implement SRC-FUN-001 - inventory management
```
