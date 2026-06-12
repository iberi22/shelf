# SRC-FUN-013: Multi-user Access (Pyme Plan)

- **ID:** SRC-FUN-013
- **Nombre:** Multi-user Access (Pyme Plan)
- **Prioridad:** P2 (Nice to have)
- **Estado:** ✅ Implementado
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production

## Descripción
Acceso multi-usuario para plan Pyme con roles (admin, editor, viewer), invitación por email y separación de datos por usuario dentro de la misma organización.

## Actor Principal
Dueño de Negocio

## Dependencias
- **SRC-FUN-008** (Auth & Cloud Sync) — requiere autenticación

## User Story
> Como dueño de negocio, quiero invitar a mi equipo con roles y permisos específicos.

## Acceptance Criteria
1. Invitación de miembros del equipo por email
2. Roles con permisos específicos (admin, editor, viewer)
3. Separación de datos por usuario dentro de la misma organización
4. UI de gestión de equipo en settings

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| Firebase Auth | Autenticación multi-usuario |
| Firestore | Segregación de datos |
| React 19 | UI de gestión de equipo |

## Roles y Permisos
| Rol | Permisos |
|-----|----------|
| Admin | CRUD completo, invitar/remover miembros, cambiar planes |
| Editor | CRUD de productos, registro de ventas, reportes |
| Viewer | Solo lectura de dashboard y reportes |

## Detalles Técnicos
- **Invitación:** Firestore collection `invitations` + email trigger
- **Organización:** Grupo de usuarios comparten `organizationId`
- **Segregación:** Colecciones prefixeadas con `organizationId`

## Commits Relacionados
```
feat(team): implement SRC-FUN-013 - multi-user access (Pyme plan)
```
