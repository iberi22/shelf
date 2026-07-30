## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `packages/p2p-mesh-core/src/database-sync.ts` | ✅ EXISTE | 1547 | — |
| `packages/p2p-mesh-core/src/p2p.ts` | ✅ EXISTE | 1463 | multi-peer + three-node |
| `packages/p2p-mesh-core/tests/security.test.ts` | ✅ EXISTE | 457 | — |

### Funcionalidad ya implementada
- [x] Yjs CRDT sync con Y.Maps + encodeStateAsUpdate
- [x] ACL remota: isTrustedRemoteWriter hard gate
- [x] canEdit* entity revert + privilege maps
- [x] Multi-peer E2E tests (8/8 green Ola H)
- [x] offline-sync + conflict-resolution E2E

### Gaps a implementar (lo que FALTA)
- [ ] ACL hardening multi-peer: remote mutations on secondary collections
- [ ] isTrustedRemoteWriter solo cubre path primario
- [ ] feature.json 95% — gap de hardening ACL multi-peer

---

## 📋 Descripción

**Problema:** CRDT Sync (SRC-CRDT-001, 95%) tiene ACL en el path primario (isTrustedRemoteWriter + canEdit* revert) pero no cubre mutaciones remotas en colecciones secundarias (clients, suppliers, purchase orders). Un peer autorizado en productos podría modificar clientes sin restricción.

**Solución:** Extender `isTrustedRemoteWriter` para cubrir colecciones secundarias, agregando un permission map por colección. Unit tests multi-peer que verifiquen que un peer con permisos solo en "products" no puede modificar "clients".

**Contexto:** Hardening de ACL post Ola I. El path primario está protegido pero las colecciones secundarias no. Este es el último gap para CRDT hardening (98%).

---

## 🔍 Investigación Web

(Sin investigación web necesaria)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] `isTrustedRemoteWriter` extendido para aceptar `collection` parameter
- [ ] Permission map por colección: `CollectionPermissions`
- [ ] Unit test: peer con permiso solo "products" → mutación en "clients" rechazada
- [ ] Unit test: peer con permiso en "products" + "clients" → ambos aceptados
- [ ] Multi-peer E2E test: 3 nodos con permisos diferentes
- [ ] `pnpm build` 0 errores
- [ ] `pnpm test:packages` pasa

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|--------|--------|--------|--------|
| `packages/p2p-mesh-core/src/database-sync.ts` | modificar | MED | +40 |
| `packages/p2p-mesh-core/tests/security.test.ts` | modificar | LOW | +50 |
| `.gitcore/features.json` | actualizar SRC-CRDT-001 a 98% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `apps/` — no involucrado
- `packages/edge-mesh/` — issue paralelo

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 1 | J13 | Core package, merge en paralelo con J09/J10/J12 |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls packages/p2p-mesh-core/src/database-sync.ts` antes de modificar
2. NO inventar APIs — extender isTrustedRemoteWriter existente
3. NO romper tests multi-peer existentes
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
| Multi-peer test falla | Ajustar permission map sin romper authorization existente |
| isTrustedRemoteWriter firma cambia | Verificar todos los callers en database-sync.ts y p2p.ts |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-CRDT-001
agente_asignado: jules
```
