# Shelf Ecosystem

Shelf is a decentralized, offline-first inventory and point-of-sale platform. The repository is a pnpm workspace managed with Turborepo and is organized around reusable local-first packages plus the main React inventory app.

## Monorepo Structure

| Path | Purpose |
| --- | --- |
| `apps/shelf-inventory` | Main React/Vite inventory application |
| `docs/src` | Technical SRC documentation |
| `packages/edge-mesh` | Reusable Edge Mesh runtime (Yjs, PeerJS, Authz, Storage) |
| `packages/edge-mesh-react` | React provider and hooks for Edge Mesh namespaces |
| `packages/gpu-agent` | GPU/WebGPU agent integration surface |
| `packages/p2p-mesh-core` | Shared P2P logic, roles, permissions, and PQC |

## Edge Mesh Runtime

`@shelf/edge-mesh` is the new package that powers the next generation of browser-to-browser interaction in Shelf.

Current implementation:

- creates reusable P2P nodes over pluggable transports;
- wraps Yjs documents into named namespaces;
- broadcasts local CRDT updates as encoded deltas;
- applies incoming remote updates with `{ type: 'remote', peerId }`;
- avoids re-broadcast loops for remote-origin updates;
- lets Shelf authorize remote mutations before they enter app state;
- reverts unauthorized remote CRDT changes with a dedicated security origin;
- exposes a localhost-only Playwright harness for deterministic E2E tests;
- keeps WebGPU agent execution as an extension point for future edge-local workflows.

Shelf currently uses the `shelf` namespace for:

- `products`
- `sales`
- `clients`
- `suppliers`
- `purchaseOrders`
- `arqueoSessions`
- `ocrResults`
- `auditLogs`
- `teamMembers`

The detailed package documentation is in [`packages/edge-mesh/README.md`](packages/edge-mesh/README.md). The SRC document is [`docs/src/non-functional/SRC-EDGE-001.md`](docs/src/non-functional/SRC-EDGE-001.md).

## Prerequisites

- Node.js 20 or newer for the workspace.
- pnpm 9 or newer.
- A local PeerServer on port `9000` when running local P2P/Edge Mesh E2E tests.

## Install

```bash
pnpm install
```

## Development

Run the workspace dev tasks:

```bash
pnpm run dev
```

Run the inventory app directly:

```bash
pnpm --dir apps/shelf-inventory dev
```

## Build

```bash
pnpm build
```

## Tests

Core Edge Mesh tests:

```bash
pnpm --dir packages/edge-mesh test
```

Focused synchronization/security E2E tests:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5187 pnpm --dir apps/shelf-inventory exec playwright test tests/edge-mesh-sync.spec.ts tests/security-sync.spec.ts tests/p2p-sync.spec.ts --project=chromium --reporter=list --config=playwright.config.ts --workers=1
```

The focused E2E suite covers:

- Edge Mesh CRDT export/import across two browser contexts;
- remote update application into Edge Mesh and Shelf app state;
- unauthorized remote mutation rejection and CRDT revert;
- local unauthorized mutation blocking;
- compatibility with the existing P2P product sync flow.

## Technical Documentation

The SRC documentation lives in `docs/src`.

Key documents:

- [`docs/src/index.md`](docs/src/index.md)
- [`docs/src/NON-FUNCTIONAL.md`](docs/src/NON-FUNCTIONAL.md)
- [`docs/src/non-functional/SRC-P2P-001.md`](docs/src/non-functional/SRC-P2P-001.md)
- [`docs/src/non-functional/SRC-CRDT-001.md`](docs/src/non-functional/SRC-CRDT-001.md)
- [`docs/src/non-functional/SRC-EDGE-001.md`](docs/src/non-functional/SRC-EDGE-001.md)
- [`docs/src/non-functional/SRC-QA-001.md`](docs/src/non-functional/SRC-QA-001.md)

## CI and Deployment

GitHub Actions runs lint/build jobs when hosted runners are available. Vercel deploys previews and `main`.

If GitHub Actions jobs fail immediately with no steps and an annotation about billing or spending limits, that is an account-level runner availability issue rather than a code failure.
