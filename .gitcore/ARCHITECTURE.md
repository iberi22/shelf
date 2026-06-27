# Shelf Architecture — GitCore

**Protocol Version:** 3.6.0
**Updated:** 2026-06-27

## Stack
- **Monorepo:** pnpm workspaces + Turborepo 2
- **Frontend:** React 19 (Vite 8), TypeScript 6
- **Styling:** Tailwind CSS 4, PostCSS, Biome
- **State Management:** React Context (`useReducer`)
- **Persistence:** localStorage (all tiers), Firebase Firestore (Pro sync)
- **P2P Sync:** WebRTC (PeerJS), Yjs (CRDT), Edge Mesh Runtime
- **GPU Agent:** WebGPU extension points
- **Security:** ML-KEM-768 (PQC), ML-DSA-65 (signatures), AES-GCM
- **AI:** Gemini API via Firebase Cloud Functions
- **Testing:** Playwright E2E, Vitest, Biome linting
- **CI/CD:** GitHub Actions, Vercel (preview + production)
- **Payments:** Stripe (webhooks + subscriptions)
- **Auth:** Firebase Auth (email/password)

## Project Structure
```
shelf/
├── apps/
│   ├── shelf-inventory/     # Main app (React)
│   │   ├── src/             # React source
│   │   ├── components/      # Shared components
│   │   ├── context/         # React Context providers
│   │   ├── hooks/           # Custom React hooks
│   │   ├── locales/         # i18n translations (EN/ES/PT)
│   │   └── tests/           # Playwright E2E tests
│   └── docs/                # Technical documentation
├── packages/
│   ├── edge-mesh/           # Edge Mesh Runtime (Yjs, PeerJS, Storage)
│   ├── edge-mesh-react/     # React bindings for Edge Mesh
│   ├── gpu-agent/           # GPU/WebGPU agent integration
│   └── p2p-mesh-core/       # Shared P2P logic, roles, and PQC
├── .gitcore/                # GitCore protocol (v3.6.0)
├── .github/
│   └── workflows/           # CI/CD pipelines
└── docs/
    ├── src/                 # SRC documents
    │   ├── features/        # Per-feature SRC (FUN-*)
    │   └── non-functional/  # Per-feature SRC (PQC, P2P, ...)
    └── archive/             # Archived docs
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| P2P Mesh | PeerJS + Yjs CRDT | Offline-first sin servidor central |
| Post-Quantum Crypto | ML-KEM-768 + ML-DSA-65 | Seguridad a futuro (NIST estandarizado 2024) |
| Monorepo | Turborepo + pnpm | Escalabilidad, builds paralelos, shared packages |
| State Management | Context API (no Redux) | Simplicidad, shelf no escala a cientos de componentes |
| Offline Storage | localStorage → Firestore | Gratuito en free tier, sync cloud cuando hay internet |
| Auth | Firebase Auth + Stripe | Monetización integrada, zero-infrastructure |
| i18n | Custom Context (no react-i18next) | Liviano, sin dependencias externas |
| PWA | vite-plugin-pwa + workbox | Integración directa con Vite 8 |

## Architecture Patterns

### 1. Offline-First
Todas las operaciones son locales (localStorage). Cloud sync es opcional y solo para usuarios Pro. El usuario puede usar la app desconectado permanentemente.

### 2. P2P Mesh
Cada instancia de la app es un nodo en la red mesh. No hay servidor central para sincronización. La topología es fully-connected: cada peer se conecta a todos los demás.

### 3. CRDT (Conflict-Free Replicated Data Types)
Usando Yjs para consistencia eventual. Los cambios se replican entre peers sin conflictos. LWW (Last-Writer-Wins) para campos simples.

### 4. Admin Node
Nodo designado (primer peer en conectarse) que coordina peers y mantiene el estado global. Soporta multi-user (Pyme plan).

### 5. Monetización por Tiers
| Tier | Price | Ads | Cloud Sync | AI | Multi-user |
|------|-------|-----|-------------|----|------------|
| Free | $0 | ✅ | ❌ | ❌ | ❌ |
| Basic | TBD | ❌ | ✅ | ❌ | ❌ |
| Pro | TBD | ❌ | ✅ | ✅ | ❌ |
| Pyme | TBD | ❌ | ✅ | ✅ | ✅ |

## Security Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Application Layer                  │
│  React 19 UI ←→ Context API ←→ localStorage/Firestore│
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                  Edge Mesh Runtime                    │
│  Namespace Guard ←→ Yjs CRDT ←→ Authz (Capabilities)  │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                   P2P Transport Layer                 │
│  PeerJS (WebRTC) ←→ p2p-mesh-core ←→ GPU Agent        │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              Post-Quantum Security Layer              │
│  ML-KEM-768 (key exchange) → AES-GCM (encryption)   │
│  ML-DSA-65 (signatures)                             │
└─────────────────────────────────────────────────────┘
```

## Data Flow
```
User Action → Context Dispatch → Reducer → State Update
                                                ↓
                      ┌─────────────────────────┼─────────────┐
                      ↓                         ↓             ↓
                 localStorage            Edge Mesh Sync     Firestore
                 (always)                (Yjs + Guard)    (Pro only)
                                                ↓
                                         P2P Broadcast
                                         (WebRTC Mesh)
```

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
