# Prompt para nueva sesión — Shelf + edge-mesh P2P (post A/B/C/D partial)

Copia todo lo que está entre las líneas `BEGIN_PROMPT` y `END_PROMPT` como primer mensaje de la nueva sesión.

---

BEGIN_PROMPT

## Contexto

Eres un agente en el monorepo **Shelf** (`E:\proyectosSWAL\shelf`) y el core multi-app **edge-mesh** (`E:\proyectosSWAL\edge-mesh`).  
Hoy es continuación de un full review + unificación P2P por fases.

**Lee primero (orden):**

1. `E:\proyectosSWAL\shelf\AGENTS.md` + `Claude.md`
2. `E:\proyectosSWAL\shelf\.gitcore\planning\PLAN-P2P-UNIFICATION.md`
3. `E:\proyectosSWAL\shelf\.gitcore\planning\TASK.md`
4. `E:\proyectosSWAL\shelf\.gitcore\features.json` (ya NO es 100%; avg ~79%)
5. `E:\proyectosSWAL\edge-mesh\docs\PHASE-D-ROADMAP.md`
6. `E:\proyectosSWAL\edge-mesh\features.json`

**Responde en español** a BELA; código en inglés.

---

## Lo que YA está hecho (no rehacer)

### Fase A — Hardening mínimo ✅
- Authz en `EdgeMesh.procesarSync` / rechazo AUTHZ remoto no-admin
- `signEnvelope` / `verifyEnvelopeSignature`; fix orden ML-DSA (`sign(msg,sk)`, `verify(sig,msg,pk)`)
- `createPeerHealthMonitor` + `getReconnectDelay` exportados
- `dbSync.applyUpdate` revierte mutaciones remotas no autorizadas
- EdgeMesh **sin** `peerId` en Shelf (no 2º PeerJS)
- MemoryTransport + tests security

### Fase B — Un Y.Doc ✅
- `EdgeMeshConfig.yDoc` + `YjsAdapter.ownsDoc` (no destruye doc host)
- `AppContext` inyecta `yDoc: dbSync.doc`
- Maps unificados sin prefijo `shelf_*` (`SHELF_EDGE_UNIFIED_DOC`)
- Bridge sin mirror AppState→Y; harness usa `dbSync.applyUpdate`

### Fase C — Un Transport ✅ (parcial en protocolo)
- `P2PManagerTransport` en `packages/p2p-mesh-core/src/p2p-transport-adapter.ts`
- Mensaje `EDGE_MESH_ENVELOPE` en el **mismo** PeerJS que `YJS_UPDATE`
- `EdgeMeshTransportBinder` late-bind
- `relayLocalYjs: false` (host hace YJS broadcast)

### Fase D — Partial 🟡
- CI skeleton: `edge-mesh/.github/workflows/ci.yml`
- Roadmap: `edge-mesh/docs/PHASE-D-ROADMAP.md`
- **NO** se movió Maloca ni se eliminó PeerJS de p2p-mesh-core (rompería producción)

### Features honestos
- Shelf avg ~**79%** (EDGE ~82%, P2P ~86%, CRDT ~90%, GPU ~22%, QA ~65%)
- edge-mesh avg ~**63%** (casi todo `partial`, no `hardened`)

---

## Arquitectura runtime actual (verdad)

```
UI / AppContext
  → dbSync.doc (Yjs)  ←── shared ──→  EdgeMesh.yjsAdapter.doc
  → p2pManager (único PeerJS + PQC handshake ML-KEM/ML-DSA)
       ├─ YJS_UPDATE     (inventario CRDT, branch filter, retries)
       └─ EDGE_MESH_ENVELOPE (protocolo EdgeMesh via P2PManagerTransport)
```

**System of record inventario:** `p2p-mesh-core` (`dbSync` + `p2pManager`).  
**Edge-mesh:** runtime multi-app compartido + authz/protocol path; en Shelf va cableado, no reemplaza aún el path YJS legacy.

---

## 🚨 Gaps críticos que faltan (priorizados)

### P0 — Correctness / seguridad

1. **YJS_UPDATE no cifrado a nivel app**  
   Solo se cifran authority/recovery (`isSensitive`). Inventario va en claro sobre DTLS WebRTC.  
   Archivo: `packages/p2p-mesh-core/src/p2p.ts` → `isSensitive`.

2. **PIN at-rest débil**  
   Fallback `default_secure_pin_123` en `packages/p2p-mesh-core/src/crypto.ts`.

3. **Dual message types**  
   `YJS_UPDATE` + `EDGE_MESH_ENVELOPE` conviven. Migrar YJS al envelope con flag + E2E.

4. **core/node.ts placeholders**  
   `enviar`/`transmitir`/`conectar` real siguen stub; IO real está en transport.

5. **Maloca insecure**  
   - `evidentia.verify()` siempre `true`  
   - JWT `maloca-gateway-default-secret-change-me`  
   Sacar Maloca del core o endurecer antes de usarlo en prod.

6. **GPU agent mock**  
   `packages/gpu-agent` → `SRC-GPU-001` ~22%, no production.

### P0 — Tooling / monorepo

7. **Vitest monorepo roto**  
   `Cannot find package '@vitest/utils'` en shelf root; tests unitarios edge-mesh corren bien en `E:\proyectosSWAL\edge-mesh` standalone.

8. **Junction/node_modules STALE**  
   `packages/p2p-mesh-core/node_modules/edge-mesh` → junction a  
   `E:\scripts-python\shelf\packages\edge-mesh`  
   **NO** a `E:\proyectosSWAL\shelf\packages\edge-mesh`.  
   Riesgo: builds/tests usan código viejo de otra ruta.  
   **Acción:** `pnpm install` / recrear links; no confiar en dist huérfano.

9. **Dos copias de edge-mesh**  
   - SSOT preferido: `E:\proyectosSWAL\edge-mesh`  
   - Copia monorepo: `shelf/packages/edge-mesh`  
   Sync manual tras cambios; falta política automatizada (submodule/workspace protocol).

### P1 — Fase D restante

10. Extraer `@edge-mesh/maloca` (adapters salud/veeduria/xavier fuera del core).  
11. Reducir `p2p-mesh-core` a dominio Shelf (types + dbSync maps); Peer/PQC → edge-mesh o adapter.  
12. Coverage gates en edge-mesh CI.  
13. Playwright: privilege escalation remoto real vía `YJS_UPDATE` hostil (ya hay authz en applyUpdate; falta E2E de regresión).  
14. Verificar CI edge-mesh verde en GitHub.

### P1 — Producto Shelf no-P2P

15. SRC-FUN-008/013 cloud + multi-user backend (roadmap ROADMAP-003/004).  
16. QA: Cypress P2P es smoke; flaky settings/nav en Playwright.

### P2 — Nice-to-have

17. Cifrar `YJS_UPDATE` con AES post-handshake o documentar solo DTLS.  
18. Scope npm `@shelf/*` vs nombres unscoped.  
19. Docs architecture.md edge-mesh siguen overselling data-path (actualizar honesty).  
20. `useEdgeMeshShelfAdapter` sigue poco usado; cablear o borrar.

---

## Archivos clave tocados en esta racha

| Path | Rol |
|------|-----|
| `edge-mesh/src/edge-mesh.ts` | yDoc share, transport late-bind, authz sync, relayLocalYjs |
| `edge-mesh/src/transport/memory.ts` | Multi-node tests |
| `edge-mesh/src/presence/peer-health.ts` | Health API for p2p-core |
| `edge-mesh/src/identity/index.ts` | ML-DSA sign order + serialize |
| `edge-mesh/src/protocol/index.ts` | sign/verify envelopes |
| `edge-mesh/.github/workflows/ci.yml` | CI skeleton |
| `shelf/packages/p2p-mesh-core/src/p2p-transport-adapter.ts` | ITransport over p2pManager |
| `shelf/packages/p2p-mesh-core/src/p2p.ts` | EDGE_MESH_ENVELOPE + host APIs |
| `shelf/packages/p2p-mesh-core/src/database-sync.ts` | Remote applyUpdate authz revert |
| `shelf/apps/.../EdgeMeshTransportBinder.tsx` | Late-bind transport |
| `shelf/apps/.../EdgeMeshWorkflowBridge.tsx` | Unified doc status + security |
| `shelf/apps/.../context/AppContext.tsx` | yDoc + config |
| `shelf/.gitcore/features.json` | % honestos |
| `shelf/.gitcore/planning/PLAN-P2P-UNIFICATION.md` | Plan A–D |

---

## Cómo validar (comandos)

```bash
# edge-mesh standalone (vitest OK aquí)
cd E:\proyectosSWAL\edge-mesh
node ./node_modules/vitest/vitest.mjs run tests/security tests/sync tests/transport/late-bind.test.ts tests/identity/sign-verify.test.ts tests/presence/peer-health.test.ts

# adapter unit (mock edge-mesh)
cd E:\proyectosSWAL\shelf\packages\p2p-mesh-core
node E:\proyectosSWAL\edge-mesh\node_modules\vitest\vitest.mjs run tests/p2p-transport-adapter.test.ts

# E2E P2P (requiere peer-server + dev)
cd E:\proyectosSWAL\shelf
pnpm peer-server   # terminal 1
pnpm --dir apps/shelf-inventory dev   # terminal 2
pnpm --dir apps/shelf-inventory exec playwright test tests/p2p-sync.spec.ts tests/edge-mesh-sync.spec.ts
```

---

## Objetivo de ESTA sesión (elige o prioriza)

Trabaja en este orden salvo que el usuario diga lo contrario:

1. **Reparar monorepo links + vitest** (`pnpm install`, junction edge-mesh → `proyectosSWAL`, no `scripts-python`).
2. **E2E regresión P2P** post unificación (sync multi-peer + unauthorized remote inject).
3. **Cifrar YJS_UPDATE** o documentar + ticket; quitar PIN default.
4. **Fase D2 Maloca extract** (package separado) **o** D1 thin p2p (solo si E2E verdes).
5. **Coverage + CI verde** en edge-mesh remoto.

No marques features al 100%. Actualiza `features.json` con `partial`/`gaps` cuando toques código.

**No** force-push, no commits a main sin PR, no borrar DBs locales, no tocar `.env`.

END_PROMPT

---

## Checklist rápido para el humano (BELA)

- [ ] Correr Playwright multi-peer en tu máquina tras pull
- [ ] Arreglar junction `scripts-python` → `proyectosSWAL`
- [ ] Decidir: ¿siguiente = seguridad crypto YJS o Maloca extract?
- [ ] Commit/PR de la rama actual (`fix-pwa-update-freeze` tiene mucho work uncommitted — revisar `git status`)
