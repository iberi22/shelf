# SRC-FUN-011: Settings & Data Management

- **ID:** SRC-FUN-011
- **Nombre:** Settings & Data Management
- **Prioridad:** P1 (Importante)
- **Estado:** ✅ Implementado
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production

## Descripción
Configuraciones de usuario (moneda, umbral de stock bajo, formato numérico) y gestión de datos (backup/restore JSON, reset total con confirmación).

## Actor Principal
Usuario Free

## Dependencias
Ninguna

## User Story
> Como usuario, quiero configurar la app y gestionar mis datos.

## Acceptance Criteria
1. Respaldo y restauración completa en JSON
2. Reset de datos con confirmación doble
3. Selección de moneda y formato numérico
4. Configuración de umbral de stock bajo (alertas visuales)
5. Persistencia de todas las configuraciones

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| React 19 | UI de settings |
| File API (JSON) | Backup/restore |
| localStorage | Persistencia de config |

## Detalles Técnicos
- **Backup JSON:** Exporta todo el estado (productos, ventas, contactos, settings)
- **Restore:** Importa y reemplaza estado actual (con confirmación)
- **Monedas:** Soportadas vía configuración (USD, COP, EUR, BRL, MXN)
- **Umbral stock bajo:** Configurable, resalta productos en rojo en UI

## Commits Relacionados
```
feat(settings): implement SRC-FUN-011 - settings & data management
```
