# SKILL.md — shelf-edge-mesh

**Skill:** Edge Mesh Runtime
**Versión:** 1.0.0

---

## 📋 Descripción

Trabajo con `@shelf/edge-mesh` y `@shelf/edge-mesh-react`: el runtime P2P reutilizable de nueva generación.

## 🛠️ Herramientas

- Yjs (CRDT)
- PeerJS (WebRTC transport)
- Playwright (E2E harness)
- React (bindings)

## 📂 Alcance

| Área | Ruta |
|------|------|
| Paquete edge-mesh | `packages/edge-mesh/` |
| Paquete edge-mesh-react | `packages/edge-mesh-react/` |
| Tests E2E edge-mesh | `apps/shelf-inventory/tests/edge-mesh-sync.spec.ts` |
| Tests security | `apps/shelf-inventory/tests/security-sync.spec.ts` |

## 🎯 Tareas Comunes

```bash
# Tests del package
pnpm --dir packages/edge-mesh test

# Tests E2E con Playwright
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5187 pnpm --dir apps/shelf-inventory exec playwright test tests/edge-mesh-sync.spec.ts
```

## 📌 Conceptos Clave

- **Namespaces**: Documentos Yjs independientes (products, sales, clients, etc.)
- **Delta Sync**: Broadcast de updates CRDT como deltas codificados
- **Security Guard**: Autoriza mutaciones remotas antes de aplicar al estado
- **Self-Healing**: Revierte cambios CRDT no autorizados automáticamente
- **Remote Origin Tracking**: Metadatos `{ type: 'remote', peerId }` en cada update
- **namespace `shelf`**: Contiene todos los tipos de datos del negocio
