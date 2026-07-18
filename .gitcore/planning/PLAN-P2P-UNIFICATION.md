# PLAN — Unificación del stack P2P (Shelf + edge-mesh)

**Fecha:** 2026-07-17  
**Prioridad:** P0  
**Estado:** approved-for-execution (fase hardening iniciada)  
**SRC relacionados:** SRC-P2P-001, SRC-CRDT-001, SRC-EDGE-001, SRC-PQC-001, ROADMAP-007/008/009/010  

---

## 1. Problema

Hoy coexisten **dos stacks** incompletos:

| Capa | Package | Rol real |
|------|---------|----------|
| Transport + roles + PQC handshake | `p2p-mesh-core` | **System of record** del inventario |
| CRDT inventario | `dbSync` (Y.Doc A) | Observado por `AppContext` |
| Runtime multi-app | `edge-mesh` | Segundo PeerJS + **Y.Doc B** espejo |
| Security Guard | `EdgeMeshWorkflowBridge` | Solo sobre Y.Doc B |

Consecuencias:

1. Dual PeerJS con el mismo `peerId` → inestabilidad.
2. Dual Y.Doc → divergencia y self-healing parcial.
3. Authz en app, no en core → otras apps no heredan seguridad.
4. Features/docs venden edge-mesh como runtime activo → desalineación.

---

## 2. Objetivo final

```
UI / reducer
    │
    ▼
Un solo Y.Doc (inventario)
    │
    ├─ observers → React state
    └─ onUpdate → envelope firmado → ITransport → peers
                         ▲
                         │
              NamespaceAuthorizer + peer key registry
```

**Reglas no negociables:**

1. **Un solo** PeerJS / transport activo por dispositivo.
2. **Un solo** Y.Doc de inventario por branch/namespace.
3. Toda mutación remota pasa por **authz + (idealmente) firma**.
4. `edge-mesh` es el core multi-app; Shelf es un adapter, no un segundo mesh.

---

## 3. Estrategia de migración (fases)

### Fase A — Hardening mínimo ✅ (2026-07-17)

**No rompe la app.** Prepara el core y cierra agujeros graves.

| # | Trabajo | Done when | Status |
|---|---------|-----------|--------|
| A1 | Features honestos (Shelf + edge-mesh) | `features.json` con % y gaps | ✅ |
| A2 | `ITransport` + `MemoryTransport` | Tests multi-nodo sin WebRTC | ✅ |
| A3 | Authz en `procesarSync` / rechazo AUTHZ remoto no firmado | Unit tests verdes | ✅ |
| A4 | Sign/verify envelopes + peer public keys | Roundtrip identity tests | ✅ |
| A5 | Export `createPeerHealthMonitor` / `getReconnectDelay` | `p2p-mesh-core` importa OK | ✅ |
| A6 | Guard en `dbSync.applyUpdate` remoto | Rechazo/revert de peer sin permiso | ✅ |
| A7 | Desactivar segundo PeerJS de EdgeMesh en Shelf (config) | Un solo peer id en runtime | ✅ |

### Fase B — Un Doc compartido ✅ (2026-07-17)

| # | Trabajo | Done when | Status |
|---|---------|-----------|--------|
| B1 | Inyectar `Y.Doc` de `dbSync` en `EdgeMesh.yjsAdapter` | Un solo doc en memoria | ✅ `config.yDoc` |
| B2 | Bridge deja de espejar; observa doc unificado | Sin mirror AppState→Y | ✅ |
| B3 | Maps unprefixed = dbSync (`products`, …) | Una schema de maps | ✅ `SHELF_EDGE_UNIFIED_DOC` |
| B4 | `detener()` no destruye doc host | Shared doc survives | ✅ `ownsDoc` |

### Fase C — Un Transport ✅ (2026-07-17)

| # | Trabajo | Done when | Status |
|---|---------|-----------|--------|
| C1 | EdgeMesh usa `P2PManagerTransport` adapter sobre `p2pManager` | Un Peer instance | ✅ |
| C2 | Protocolo `EDGE_MESH_ENVELOPE` en el mismo data channel que `YJS_UPDATE` | Un Peer + dual message types | ✅ parcial |
| C3 | Handshake PQC (ML-KEM) sigue en `p2pManager` (no duplicado) | Un solo crypto handshake | ✅ (host-owned) |

**Notas C2:** inventario CRDT sigue en `YJS_UPDATE` (compat + retries/branch filter). EdgeMesh protocol (heartbeat, SYNC firmado, AUTHZ) usa `EDGE_MESH_ENVELOPE` sobre el **mismo** PeerJS. Migrar YJS al 100% envelope queda para Fase D si se desea un solo message type.

### Fase D — Deprecación limpia 🟡 (2026-07-17, partial)

| # | Trabajo | Done when | Status |
|---|---------|-----------|--------|
| D0 | Documentar roadmap + SSOT + gaps | `docs/PHASE-D-ROADMAP.md` | ✅ |
| D1 | `p2p-mesh-core` sin PeerJS propio | Thin domain only | ⏳ deferred (rompe app si se hace ya) |
| D2 | Maloca → package separado | Core genérico | ⏳ deferred (plan en PHASE-D-ROADMAP) |
| D3a | CI standalone edge-mesh | Workflow existe | ✅ skeleton |
| D3b | Coverage gates + maturity hardened | CI verde + % | ⏳ pending |
| D3c | Un solo message type (YJS→envelope) | Flag + E2E | ⏳ pending |

Ver: `E:\proyectosSWAL\edge-mesh\docs\PHASE-D-ROADMAP.md` y handoff `SESSION_PROMPT_P2P_NEXT.md`.

---

## 4. Decisiones de diseño

### 4.1 ¿Quién es el dueño del Doc?

**Recomendación:** migrar hacia **edge-mesh `YjsAdapter`** como dueño, con adapter Shelf que registra collections.  
**Puente corto (Fase B):** inyectar el `Y.Doc` existente de `dbSync` en EdgeMesh para evitar reescritura grande.

```ts
// target API
new EdgeMesh({
  nodoId,
  yDoc: dbSync.getDoc(), // shared
  transport: 'external' | MemoryTransport | PeerJSTransport,
});
```

### 4.2 ¿Quién es el dueño del Transport?

**Corto plazo (A7):** Shelf configura EdgeMesh **sin** `peerId` (sin abrir PeerJS).  
**Medio plazo (C):** EdgeMesh transport adapter:

```ts
interface ITransport {
  enviar(destino: NodoId, env: Envolvente): Promise<void>;
  transmitir(env: Envolvente): Promise<void>;
  onMensaje(handler: (env: Envolvente, from: NodoId) => void): void;
  conectar?(): Promise<void>;
  cerrar(): Promise<void>;
}
```

### 4.3 Authz model

- Grants locales en `NamespaceAuthorizer` (ya existe).
- **Remoto:** no aceptar `conceder` sin firma del master/admin y clave en registry.
- **Sync:** `aplicar update` solo si `verificarCapacidad(namespace, origen, 'write'|'sync')` **o** política `open` explícita en tests.
- Shelf mapea `PeerPermissions` → capacidades por collection (`shelf:products`, etc.).

### 4.4 Crypto

| Capa | Ahora | Target |
|------|-------|--------|
| Handshake | p2p-mesh-core ML-KEM | edge-mesh o shared module |
| Firma mensajes | parcial | envelope.firma ML-DSA obligatorio en sync/authz |
| YJS payload | plaintext app-layer | AES post-handshake (ROADMAP-010) |

---

## 5. Plan de pruebas

| Tipo | Caso | Fase |
|------|------|------|
| Unit | MemoryTransport A↔B aplica delta Yjs autorizado | A |
| Unit | Peer sin `write` no muta mapa remoto | A |
| Unit | AUTHZ remoto sin firma se rechaza | A |
| Unit | identity sign/verify roundtrip | A |
| Unit | `dbSync.applyUpdate` revierte peer sin permiso | A |
| Playwright | multi-peer inventory sync (regresión) | A/B |
| Playwright | remote unauthorized inject no persiste | B |
| Integration | un solo `Peer` en `chrome://webrtc-internals` / counters | C |

---

## 6. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Regresión sync multi-peer | No apagar p2p-mesh-core hasta B/C verdes |
| Flaky PeerJS en CI | MemoryTransport para unit; PeerServer solo E2E |
| Drift de copias edge-mesh | SSOT = `E:\proyectosSWAL\edge-mesh`; sync a monorepo en cada release |
| Over-hardening rompe tests E2E | Flag `requireSignedSync` / grants auto en test runtime |

---

## 7. Criterios de salida de unificación

- [ ] Un Y.Doc de inventario
- [ ] Un transport PeerJS
- [ ] Authz en apply path (core + app)
- [ ] Features EDGE/P2P ≥ 85% maturity `integrated` o `hardened`
- [ ] Vitest + coverage gate en authz/sync/identity/transport
- [ ] Playwright multi-peer + privilege escalation en verde

---

## 8. Orden de ejecución inmediato

1. ~~Features honesty~~ → este plan  
2. Hardening A2–A7 en edge-mesh + p2p-mesh-core + Shelf config  
3. PR/tests  
4. Fase B cuando A esté verde  

**Owner sugerido:** core edge-mesh (A2–A5), shelf app (A6–A7, B).
