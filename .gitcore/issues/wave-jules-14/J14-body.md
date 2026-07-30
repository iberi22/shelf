## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `apps/shelf-inventory/components/UpdateNotification.tsx` | ✅ EXISTE | 215 | — |
| `vite.config.ts` (VitePWA) | ✅ EXISTE | — | — |

### Funcionalidad ya implementada
- [x] PWA instalable vía vite-plugin-pwa
- [x] Funciona 100% sin conexión (localStorage + IDB)
- [x] Service worker configurado para caching offline
- [x] UpdateNotification.tsx para actualizaciones automáticas
- [x] usePersistedReducer (IndexedDB)
- [x] Cypress E2E: pwa-offline.cy.ts

### Gaps a implementar (lo que FALTA)
- [ ] Primera conexión P2P necesita signaling server online (PeerJS broker)
- [ ] Si no hay internet, P2P no puede iniciar — no hay fallback UX
- [ ] feature.json gap: "First P2P connect needs signaling online by design"

---

## 📋 Descripción

**Problema:** PWA (SRC-PWA-001, 90%) funciona offline para datos locales, pero P2P sync requiere signaling server online para la primera conexión (PeerJS broker). Cuando el usuario está offline, no hay UX que explique que P2P no estará disponible y que los datos se sincronizarán cuando haya conexión.

**Solución:** Agregar offline fallback UX: cuando `navigator.onLine === false`, mostrar badge/mensaje "P2P disponible al reconectar". Encolar cambios P2P pendientes y sincronizar automáticamente cuando se restablezca la conexión. Reutilizar la cola existente en p2p-mesh-core.

**Contexto:** Gap de UX offline. PWA es 100% funcional offline para datos locales pero la falta de fallback P2P confunde a usuarios que esperan sync inmediato sin conexión.

---

## 🔍 Investigación Web

(Sin investigación web necesaria)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] UpdateNotification.tsx o P2PSyncManager.tsx: mostrar "P2P en espera ☁️" cuando offline
- [ ] Al reconectar, intentar sincronización automática de cambios encolados
- [ ] Cambios pendientes se encolan en IndexedDB si P2P no disponible
- [ ] `pnpm build` 0 errores
- [ ] Feature en `.gitcore/features.json` SRC-PWA-001 actualizada a 94%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `apps/shelf-inventory/components/UpdateNotification.tsx` | modificar | MED | +20 |
| `.gitcore/features.json` | actualizar SRC-PWA-001 a 94% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `packages/p2p-mesh-core/` — la cola de sync ya existe, no tocar
- `packages/edge-mesh/` — no involucrado

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 5 | J14 | PWA final, después de todas las features |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls apps/shelf-inventory/components/UpdateNotification.tsx` antes de modificar
2. NO inventar APIs — `navigator.onLine` es estándar
3. NO modificar packages/
4. Compilar antes de commitear

---

## ✅ Verification (POST-ejecución)

```bash
pnpm build
pnpm test:packages
git status --short
```

## 🔄 Failure Recovery

| Si pasa esto | Acción |
|-------------|--------|
| Test offline falla | Mock `navigator.onLine = false` en test |
| Cola P2P no vacía al reconectar | Verificar queue flush en p2p-mesh-core |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-PWA-001
agente_asignado: jules
```
