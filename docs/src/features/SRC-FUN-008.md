# SRC-FUN-008: Authentication & Cloud Sync

- **ID:** SRC-FUN-008
- **Nombre:** Authentication & Cloud Sync
- **Prioridad:** P0 (Core)
- **Estado:** ⚠️ Partial
- **Implementation:** 88%
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Hardening
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

> **Audit 2026-07-18:** 88% · implemented · maturity `integrated`. SSOT: `.gitcore/features.json`.

## Descripción
Autenticación **local offline-first** (`localAuth`) con email/contraseña, hash de password, seed de recuperación y lista de dispositivos. **No hay Firebase Auth ni sync Firestore en runtime.** La sincronización multi-dispositivo se apoya en P2P/backup JSON; sync cloud completo queda en roadmap.

## Actor Principal
Usuario Pro

## Dependencias
Ninguna

## User Story
> Como usuario, quiero crear una cuenta para sincronizar mis datos en la nube.

## Acceptance Criteria
**Runtime actual (honesto):**
1. Registro y login local con email y contraseña (`localAuth`)
2. Persistencia de perfil/sesión en localStorage (sin cloud push/pull)
3. Recuperación vía seed / dispositivos locales
4. Multi-dispositivo vía P2P mesh o backup JSON (no login cloud)

**ACs históricos (no implementados — no reportar como done):**
1. ~~Registro y login con Firebase Auth~~
2. ~~Sync de estado local a Firestore~~
3. ~~Restauración de datos al iniciar sesión cloud en otro dispositivo~~
4. ~~Segregación de colecciones por `userId` en Firestore~~

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| localAuth (`lib/localAuth.ts`) | Auth offline-first real |
| localStorage | Perfil, sesión, devices |
| WebAuthn (opcional) | Auth alternativa experimental |
| P2P / backup JSON | Multi-device restore (no cloud) |

## Detalles Técnicos
- **Runtime auth:** `AuthContext.tsx` → `localAuthManager` only
- **No Firebase Auth SDK** en el path de producción de la app
- **No Firestore client** — `firestore.rules` puede existir pero no hay cliente activo
- **Token:** `getIdToken` devuelve dummy `local-token` (no JWT Firebase)
- **Cloud sync:** ROADMAP-003 (pending)
- **Guest:** no debe mapearse silenciosamente a tier pyme

## Commits Relacionados
```
feat(auth): localAuth offline-first (SRC-FUN-008)
docs: honest audit — Firebase Auth not runtime (SRC-FUN-008)
```
