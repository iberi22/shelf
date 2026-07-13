# SKILL.md — shelf-p2p-mesh

**Skill:** Desarrollo P2P Mesh
**Versión:** 1.0.0

---

## 📋 Descripción

Trabajo con `@shelf/p2p-mesh-core`: el motor P2P legacy basado en PeerJS (WebRTC) + Yjs (CRDT) + criptografía post-cuántica.

## 🛠️ Herramientas

- PeerJS, WebRTC
- Yjs (CRDT)
- @noble/post-quantum (ML-KEM-768, ML-DSA-65)
- AES-GCM

## 📂 Alcance

| Área | Ruta |
|------|------|
| Paquete | `packages/p2p-mesh-core/` |
| Tests E2E P2P | `apps/shelf-inventory/tests/p2p-sync.spec.ts` |

## 🎯 Tareas Comunes

```bash
# Tests
pnpm dlx peer --port 9000 --path /  # peer server
pnpm --dir apps/shelf-inventory exec playwright test tests/p2p-sync.spec.ts
```

## 📌 Conceptos Clave

- **Topología mesh**: Cada nodo se conecta a todos los peers
- **Admin Node**: Primer peer, coordina la red
- **PQC Handshake**: Intercambio de llaves ML-KEM-768 antes de conexión WebRTC
- **CRDT Sync**: Yjs para consistencia eventual sin conflictos
- **Delta sync**: Solo cambios, no snapshots completos
