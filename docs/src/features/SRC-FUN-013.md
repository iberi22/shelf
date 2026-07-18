# SRC-FUN-013: Multi-user Access (Pyme Plan)

- **ID:** SRC-FUN-013
- **Nombre:** Multi-user Access (Pyme Plan)
- **Prioridad:** P2 (Nice to have)
- **Estado:** ⚠️ Partial
- **Implementation:** 58%
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Beta
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

> **Audit 2026-07-17:** Equipo/permisos vía P2P (no org multi-tenant cloud). Roles reales: admin/collaborator/vendedor/member (no editor/viewer del AC). Invite = mailto + peerId. Gate isPyme siempre true por hardcode de SubscriptionContext.

## Descripción
Acceso multi-usuario orientado a plan Pyme con roles y permisos vía **P2P** (`PeerPermissions`, team UI), invitación por email/peerId. No hay backend de organización multi-tenant cloud.

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
