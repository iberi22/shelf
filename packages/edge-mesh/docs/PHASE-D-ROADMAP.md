# Phase D — Deprecación limpia (roadmap)

**Estado:** avanzada 2026-07-17 — D3 encrypt dual-ready + D1 wire collapse parcial (envelope-when-ready).

## D1 — Reducir p2p-mesh-core

| Item | Estado |
|------|--------|
| Un solo PeerJS | ✅ Phase C |
| Shared Y.Doc | ✅ Phase B |
| Dual-ready YJS encrypt | ✅ Phase D (ENCRYPTION_READY) |
| YJS → EDGE_MESH envelope when dual-ready | ✅ Phase E (`yjsWireMode=envelope-when-ready`) |
| Mover P2PManagerTransport a edge-mesh package | ⏳ residual |
| Extraer handshake PQC a edge-mesh | ⏳ residual |
| Thin p2pManager / shelf-domain split | ⏳ residual |

## D2 — Maloca fuera del core

⏳ deferred (evidentia/JWT debt)

## D3 — Hardened + CI

| Item | Estado |
|------|--------|
| CI edge-mesh | ✅ |
| Dual-ready encrypt | ✅ |
| Envelope-when-ready CRDT | ✅ |
| Coverage gates | ❌ |

## Wire path (actual)

```
local CRDT update
  ├─ if all peers dual-ready + edgeYjsRelay → EDGE_MESH_ENVELOPE (SYNC)
  └─ else → YJS_UPDATE (AES when dual-ready, else DTLS)
```
