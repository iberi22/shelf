# SRC — Source Code Reference — shelf

> **Protocol:** GitCore 3.8.0  
> **Updated:** 2026-08-16
> **Completeness:** structure 100%

## 1. Overview

shelf — Shelf is a decentralized, offline-first inventory and point-of-sale (POS) platform. The repository is a pnpm workspace managed with Turborepo and is organized around reusable local-first P2P packages plus the main React inventory application.

| Field | Value |
|-------|--------|
| Repo | `iberi22/shelf` |
| Stack | React 19, Vite 8, TypeScript 6, Tailwind CSS 4, Turborepo, pnpm |
| Protocol | GitCore 3.8.0 |
| Visibility | private (SWAL default) |
| Pro model | SWAL node active (no legacy payment gateways) |

## 2. Directory structure

```
shelf/
├── AGENTS.md
├── CLA.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── SRC.md
├── biome.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── turbo.json
├── .git-core-protocol-version
├── .gitcore/
│   ├── AGENT_INDEX.md
│   ├── ARCHITECTURE.md
│   ├── CORTEX_INTEGRATION.md
│   ├── PROTOCOL_REFERENCE.md
│   ├── SDLC_WORKFLOW.md
│   ├── SRC_CONFIG.md
│   ├── features.json
│   ├── docs/
│   │   ├── SWAL_GOAL.md
│   │   ├── SWAL_GOAL_CANONICAL.md
│   │   └── SWAL_PRIVATE_ERA.md
│   ├── planning/
│   │   ├── PLANNING.md
│   │   └── TASK.md
│   └── scripts/
│       ├── ensure-srs-src.ps1
│       ├── feature-verify.ps1
│       ├── implementation-score.ps1
│       ├── stabilize.sh
│       └── verify-pipeline.sh
├── apps/
│   ├── docs/                # VitePress documentation site
│   └── shelf-inventory/     # Main React PWA inventory application
│       ├── components/      # React UI components by domain
│       ├── context/         # React Context (AppState, Auth, Currency, I18n)
│       ├── hooks/           # Custom React hooks + Edge Mesh bindings
│       ├── lib/             # Business logic, localAuth, CSV import, Xavier integration
│       ├── locales/         # i18n translation files (20 locales)
│       ├── cypress/         # Cypress component & E2E tests
│       └── tests/           # Playwright E2E & unit tests
├── docs/
│   └── SRS/                 # IEEE 830 reduced software requirements
│       ├── index.md
│       ├── REQUIREMENTS.md
│       └── ARCHITECTURE.md
└── packages/
    ├── edge-mesh/           # Universal P2P CRDT sync runtime (Yjs, PeerJS, authz)
    ├── edge-mesh-react/     # React hooks & providers for Edge Mesh
    ├── gpu-agent/           # WebGPU local compute kernels & CPU fallback
    └── p2p-mesh-core/       # P2P core engine (WebRTC, Yjs, PQC cryptography)
```

## 3. Core components

| Component | Path | Purpose |
|-----------|------|---------|
| Protocol meta | `.gitcore/` | Architecture, feature registry, planning, scripts |
| SRS | `docs/SRS/` | Formal requirements specification (REQ-001..REQ-028) |
| Agent rules | `AGENTS.md` | Read order & agent guidelines |
| Main App | `apps/shelf-inventory/` | React 19 + Vite 8 offline-first PWA application |
| Documentation App | `apps/docs/` | VitePress documentation portal |
| Edge Mesh Runtime | `packages/edge-mesh/` | Reusable P2P CRDT synchronization runtime |
| Edge Mesh React | `packages/edge-mesh-react/` | React context & hooks for Edge Mesh |
| GPU Agent | `packages/gpu-agent/` | WebGPU compute kernels (scale, dot product) with CPU fallback |
| P2P Mesh Core | `packages/p2p-mesh-core/` | P2P network engine with ML-KEM-768/ML-DSA-65 PQC crypto |

## 4. Build / run / test

```bash
# Install dependencies
pnpm install

# Build all packages and applications
pnpm build

# Start local development server
pnpm dev

# Lint codebase (Biome)
pnpm lint

# Format codebase (Biome)
pnpm format

# Run unit tests across workspace packages
pnpm test

# Run Playwright E2E tests for inventory app
pnpm --dir apps/shelf-inventory test:e2e
```

## 5. Environment

| Variable | Purpose | Required |
|----------|---------|----------|
| `VITE_XAVIER_URL` | Xavier HTTP endpoint (default `http://localhost:8006`) | optional |
| `VITE_XAVIER_TOKEN` | Auth token for Xavier agentic memory | optional |
| `VITE_SKIP_LANDING` | Bypass landing page in development/test | optional |
| `VITE_TEST_MODE` | Enable test handles for Playwright E2E automation | optional |

Never commit real secrets.

## 6. SWAL integration

| Concern | Approach |
|---------|----------|
| Pro features | Active SWAL node (determined via heartbeat/mesh identity) |
| Multi-instance | `instanceId` in `localStorage` key `shelf_instance_id` |
| Memory | Xavier HTTP — namespace `app/shelf/instance/{instanceId}` (`lib/xavier.ts`, `hooks/useXavierMemory.ts`) |
| Sync events | `app/shelf/instance/{id}/sync/events` (best-effort on product CRDT sync) |
| Mesh | edge-mesh namespaces `swal/shelf/{instanceId}` |
| Payments Pro | No legacy paywalls / no credit card subscriptions |

## 7. Cross-references

| Doc | Path |
|-----|------|
| AGENTS.md | `AGENTS.md` |
| CLA.md | `CLA.md` |
| CONTRIBUTING.md | `CONTRIBUTING.md` |
| LICENSE | `LICENSE` |
| SECURITY.md | `SECURITY.md` |
| PLANNING | `.gitcore/planning/PLANNING.md` |
| TASK | `.gitcore/planning/TASK.md` |
| features | `.gitcore/features.json` |
| SRS index | `docs/SRS/index.md` |

---

*Document version: 3.8.0 · Part of GitCore Protocol*
