# SRC-FUN-004: Contact Management

- **ID:** SRC-FUN-004
- **Nombre:** Contact Management
- **Prioridad:** P0 (Core)
- **Estado:** ✅ Implemented
- **Implementation:** 98%
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

## Descripción
Gestión unificada de clientes y proveedores desde un mismo componente genérico. Ahorra 300+ líneas de código eliminando duplicación entre las dos vistas.

## Actor Principal
Vendedor / Cajero

## Dependencias
Ninguna

## User Story
> Como usuario, quiero gestionar clientes y proveedores desde un mismo lugar.

## Acceptance Criteria
1. CRUD de clientes (nombre, teléfono, email)
2. CRUD de proveedores (nombre, teléfono, email)
3. Componente genérico ContactManagementPage (sin duplicación de código)
4. Refactorizado: ahorro de 300+ líneas de código duplicado

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| React 19 | UI genérica de contactos |
| localStorage | Persistencia offline |
| Firestore | Sincronización cloud (Pro) |

## Detalles Técnicos
- **Componente genérico:** `ContactManagementPage` recibe prop `type: 'client' | 'supplier'`
- **Campos compartidos:** nombre, teléfono, email, dirección
- **Filtro:** Por tipo de contacto usando tabs en UI

## Commits Relacionados
```
feat(contacts): implement SRC-FUN-004 - unified contact management
refactor(contacts): eliminate 300+ lines of duplicated code
```
