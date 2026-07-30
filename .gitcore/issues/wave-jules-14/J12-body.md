## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `packages/p2p-mesh-core/src/p2p.ts` | ✅ EXISTE | 1463 | multi-peer tests |
| `packages/p2p-mesh-core/src/database-sync.ts` | ✅ EXISTE | 1547 | — |
| `packages/p2p-mesh-core/src/p2p-transport-adapter.ts` | ✅ EXISTE | 231 | — |
| `packages/p2p-mesh-core/tests/security.test.ts` | ✅ EXISTE | 457 | — |

### Funcionalidad ya implementada
- [x] Red mesh P2P vía PeerJS + WebRTC
- [x] Admin Node designado para coordinación
- [x] Reconexión automática
- [x] Invitación de miembros vía mailto + peerId deep link
- [x] cryptographically provable invite authority

### Gaps a implementar (lo que FALTA)
- [ ] PeerJSON type: `admin | collaborator | vendedor` roles pueden tener residual type narrowing
- [ ] invite authority bootstrap existe pero falta verificación E2E de que peers no-admin no pueden invitar
- [ ] feature.json 90% — gap de hardening en autoridad de invitación

---

## 📋 Descripción

**Problema:** P2P Mesh (SRC-P2P-001, 90%) tiene invite authority bootstrap implementado pero no hay enforcement E2E de que solo peers admin puedan invitar. Un peer collaborator podría potencialmente invitar nuevos miembros si hay un gap en el type narrowing de roles.

**Solución:** Revisar el type narrowing de PeerJSON.role en p2p.ts (líneas ~400-600), asegurar que `canInvite()` solo retorna true para admin, agregar unit test que verifique que collaborator/vendedor NO pueden invitar, y agregar E2E test de three-node que pruebe el escenario.

**Contexto:** Gap de hardening identificado en sesión Ola H. La bootstrap de invite authority se implementó pero queda residual por verificar/cubrir con tests.

---

## 🔍 Investigación Web

(Sin investigación web necesaria)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] `canInvite(role)` en p2p.ts retorna true solo para `admin`
- [ ] Unit test: collaborator intenta invite → rechazado
- [ ] Unit test: vendedor intenta invite → rechazado
- [ ] `pnpm build` 0 errores
- [ ] `pnpm test:packages` pasa (multi-peer, three-node, security)
- [ ] Feature en `.gitcore/features.json` SRC-P2P-001 actualizada a 94%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `packages/p2p-mesh-core/src/p2p.ts` | modificar | LOW | +10 |
| `packages/p2p-mesh-core/tests/security.test.ts` | modificar | LOW | +30 |
| `.gitcore/features.json` | actualizar SRC-P2P-001 a 94% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `apps/` — no involucrado
- `packages/edge-mesh/` — issue paralelo

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 1 | J12 | Core package, merge en paralelo con J09/J10/J13 |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls packages/p2p-mesh-core/src/p2p.ts` antes de modificar
2. NO inventar APIs — canInvite debe usar el role type existente
3. NO romper tests existentes (multi-peer, three-node)
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
| Role type no tiene admin | Verificar PeerJSON.type en types |
| Test de three-node falla | Verificar que cambios no rompen authorization flow actual |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-P2P-001
agente_asignado: jules
```
