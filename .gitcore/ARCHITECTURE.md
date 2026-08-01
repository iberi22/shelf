# Shelf Architecture — GitCore

**Protocol Version:** 3.8.0
**Updated:** 2026-08-01
**App Version:** 2.0.5

## Stack
- **Monorepo:** pnpm workspaces + Turborepo 2
- **Frontend:** React 19 (Vite 8), TypeScript 6
- **Styling:** Tailwind CSS 4, PostCSS, Biome
- **State Management:** React Context (`useReducer`)
- **Persistence:** localStorage (all data local-first)
- **Edge Mesh Runtime (SRC-EDGE-001):** Yjs (CRDT), PeerJS (WebRTC), WebGPU stack
- **Packages:**
  - `@shelf/edge-mesh`: Reusable P2P browser runtime (Yjs, CRDT, authz)
  - `@shelf/edge-mesh-react`: React provider + hooks for edge-mesh
  - `@shelf/gpu-agent`: WebGPU agent integration surface
  - `@shelf/p2p-mesh-core`: Core P2P engine (PQC, roles, app state contract)
- **Security:** ML-KEM-768 (PQC), ML-DSA-65 (signatures), AES-GCM
- **AI:** DeepSeek v4 Flash via OpenRouter backend proxy
- **Testing:** Playwright E2E (edge-mesh), Cypress E2E (UI), Biome linting
- **CI/CD:** GitHub Actions, Vercel (preview + production)
- **Payments:** None — all features free (Colaborador SWAL model)
- **Auth:** Local-first (LocalAuth + device security)

## Project Structure
```
shelf/
├── apps/
│   ├── shelf-inventory/     # Main app (React 19 + Vite 8)
│   │   ├── components/      # Feature-specific React components
│   │   ├── context/         # React Context (AppState, Auth, UI)
│   │   ├── hooks/           # Custom React hooks (Edge Mesh adapters)
│   │   ├── lib/             # Core logic (Edge Mesh Workflow Bridge)
│   │   ├── locales/         # i18n translations (20 languages)
│   │   ├── tests/           # Playwright E2E + unit tests
│   │   └── App.tsx          # Main entry and routing
│   └── docs/                # VitePress documentation
│       └── guide/           # User guides
├── packages/
│   ├── p2p-mesh-core/       # Legacy P2P engine (WebRTC, Yjs, PQC)
│   ├── edge-mesh/           # Reusable P2P browser runtime (Yjs, CRDT, authz)
│   ├── edge-mesh-react/     # React provider + hooks for edge-mesh
│   └── gpu-agent/           # WebGPU agent integration surface
├── .gitcore/                # GitCore protocol (v3.6.0)
├── .github/
│   └── workflows/           # CI/CD pipelines
└── docs/
    ├── src/                 # SRC documents
    │   ├── features/        # Per-feature SRC (FUN-*)
    │   └── non-functional/  # Per-feature SRC (PQC, P2P, EDGE, CRDT, QA, PWA)
    └── archive/             # Archived docs
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| P2P Mesh | PeerJS + Yjs CRDT | Offline-first sin servidor central |
| Post-Quantum Crypto | ML-KEM-768 + ML-DSA-65 | Seguridad a futuro (NIST estandarizado 2024) |
| Monorepo | Turborepo + pnpm | Escalabilidad, builds paralelos, shared packages |
| State Management | Context API (no Redux) | Simplicidad, shelf no escala a cientos de componentes |
|| Offline Storage | localStorage | 100% offline-first, no cloud dependency ||
|| Auth | LocalAuth + PQC | Post-quantum secure, device-bound, zero cloud ||
| i18n | Custom Context (no react-i18next) | Liviano, sin dependencias externas |
| PWA | vite-plugin-pwa + workbox | Integración directa con Vite 8 |

## Architecture Patterns

### 1. Offline-First
Todas las operaciones son locales (localStorage). Cloud sync es opcional y solo para usuarios Pro. El usuario puede usar la app desconectado permanentemente.

### 2. Edge Mesh Runtime (SRC-EDGE-001)
La sincronización P2P se maneja a través de `@shelf/edge-mesh`, un runtime reutilizable que proporciona una capa de sincronización local-first segura y resiliente. Sus capacidades principales incluyen:
- **P2P Node Runtime:** Crea nodos P2P sobre transports pluggables (PeerJS WebRTC) con un API estable basado en eventos.
- **Protocol Envelopes:** Los mensajes incluyen IDs, versiones, peer de origen/destino, timestamps y payloads tipados.
- **Yjs Namespaces:** Envuelve documentos Yjs en namespaces independientes (ej: `shelf`) para diferentes flujos de trabajo.
- **Delta Sync:** Broadcast de updates CRDT locales como deltas codificados (state updates) en lugar de snapshots completos.
- **Remote Origin Tracking:** Aplica updates remotos con metadatos de origen `{ type: 'remote', peerId }`.
- **Security Guard:** Autoriza mutaciones remotas contra los permisos de la app antes de integrarlas al estado local.
- **Self-Healing:** Revierte cambios CRDT no autorizados automáticamente usando un security origin dedicado.

### 3. P2P Mesh
Cada instancia de la app es un nodo en la red mesh. No hay servidor central para sincronización. La topología es fully-connected: cada peer se conecta a todos los demás.

### 4. CRDT (Conflict-Free Replicated Data Types)
Usando Yjs para consistencia eventual. Los cambios se replican entre peers sin conflictos. LWW (Last-Writer-Wins) para campos simples. Implementado via `@shelf/edge-mesh` namespaces.

### 5. GPU Agents (WebGPU)
Extension point via `@shelf/gpu-agent` para ejecución de agentes en el edge local (WebGPU). Las tareas intensivas se delegan al tenant WebGPU expuesto por edge-mesh.

### 6. Admin Node
Nodo designado (primer peer en conectarse) que coordina peers y mantiene el estado global. Soporta multi-user (Pyme plan).

### 7. Monetización — Colaborador SWAL
| Model | Price | Features | Revenue |
|-------|-------|----------|---------|
| Local (default) | $0 | All features, unlimited | None |
| Colaborador SWAL | $0 + stake | $SWAL token bonuses, priority P2P | Profit share (25/15/10%) |

No suscripciones. No ads. Todo gratis localmente.
Revenue via profit share del ecosistema SWAL.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                          │
│  React 19 UI ←→ Context API ←→ localStorage/Firestore        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Edge Mesh Layer                             │
│  @shelf/edge-mesh (Yjs CRDT + PeerJS transport)              │
│  @shelf/edge-mesh-react (React bindings)                     │
│  @shelf/gpu-agent (WebGPU tenant)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Legacy P2P Layer                            │
│  PeerJS (WebRTC) ←→ Yjs (CRDT) ←→ p2p-mesh-core             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Post-Quantum Security Layer                      │
│  ML-KEM-768 (key exchange) → AES-GCM (encryption)           │
│  ML-DSA-65 (signatures)                                     │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Application Flow
```
User Action → Context Dispatch → Reducer → State Update
                                                ↓
                ┌─────────────────────────────────┼───────────────────┐
                ↓                                 
           localStorage                  Edge Mesh Broadcast    
           (always)                      (Yjs CRDT via          
                                          edge-mesh namespace)   
```

### Edge Mesh Sync Workflow (SRC-EDGE-001)
1. **Local Mutation:** El estado de la app cambia y se refleja en el mapa Yjs local con origen `shelf-edge-workflow`.
2. **Broadcast:** `@shelf/edge-mesh` detecta el update local y lo difunde a los peers conectados como un delta codificado.
3. **Remote Receive:** Los peers reciben el update y lo aplican a su documento Yjs con el metadato `{ type: 'remote', peerId: from }`.
4. **Auth Check:** `EdgeMeshWorkflowBridge` observa el cambio remoto y verifica los permisos del `peerId` contra la configuración de la app.
5. **Apply/Revert:**
   - Si es **Autorizado**: Se despacha `SYNC_ENTITIES` al reducer para actualizar el estado de React.
   - Si es **No Autorizado**: Se revierte el cambio en el documento Yjs local con origen `shelf-edge-security-revert`.

## Edge Mesh Namespace
Shelf usa el namespace `shelf` en edge-mesh para:
- products
- sales
- clients
- suppliers
- purchaseOrders
- arqueoSessions
- ocrResults
- auditLogs
- teamMembers

## Network Topology (P2P Mesh)
```
       ┌─────────────────┐
       │   Admin Node    │
       │ (PeerJS Broker) │
       └────┬──────┬─────┘
            │      │
       ┌────▼──┐ ┌─▼──────┐
       │ Peer 2 │ │ Peer 3 │  ←── Peer 2 and 3 also
       └────┬──┘ └───┬────┘      connected to each other
            │        │
       ┌────▼────────▼────┐
       │    Peer N ...    │
       └──────────────────┘
```
