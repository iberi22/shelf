# SRC-FUN-008: Authentication & Cloud Sync

- **ID:** SRC-FUN-008
- **Nombre:** Authentication & Cloud Sync
- **Prioridad:** P0 (Core)
- **Estado:** ✅ Implementado
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production

## Descripción
Autenticación Firebase (email + contraseña) con sincronización cloud de datos locales a Firestore. Permite restaurar datos al iniciar sesión en otro dispositivo.

## Actor Principal
Usuario Pro

## Dependencias
Ninguna

## User Story
> Como usuario, quiero crear una cuenta para sincronizar mis datos en la nube.

## Acceptance Criteria
1. Registro y login con email y contraseña (Firebase Auth)
2. Sync de estado local (localStorage) a Firestore
3. Restauración de datos al iniciar sesión en otro dispositivo
4. Segregación completa de datos por usuario

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| Firebase Auth | Autenticación |
| Firestore | Base de datos cloud |
| localStorage | Caché local offline |

## Detalles Técnicos
- **Sync unidireccional:** Local → Cloud (push al hacer cambios)
- **Restauración:** Cloud → Local al iniciar sesión
- **Segregación:** Colecciones por `userId` en Firestore
- **Offline:** Todos los datos existen primero en localStorage; cloud es backup/sync

## Commits Relacionados
```
feat(auth): implement SRC-FUN-008 - Firebase auth & cloud sync
```
