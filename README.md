# Shelf Ecosystem

Shelf is a decentralized, offline-first inventory and point-of-sale platform. The repository is a pnpm workspace managed with Turborepo and is organized around reusable local-first packages plus the main React inventory app.

## Monorepo Structure

| Path | Purpose |
| --- | --- |
| `apps/shelf-inventory` | Main React/Vite inventory application |
| `apps/docs` | VitePress documentation site |
| `packages/p2p-mesh-core` | Core P2P synchronization engine, roles, and permissions |
| `packages/edge-mesh` | High-performance P2P sync runtime using Yjs and PeerJS |
| `packages/edge-mesh-react` | React hooks and providers for Edge Mesh |
| `packages/gpu-agent` | WebGPU-powered agent integration |

## Edge Mesh Runtime

> **SWAL:** Pro features require an **active SWAL node** (not Stripe). Multi-store instances are **mesh-isolated** by default (`instance_id`). See [`docs/SWAL/README.md`](../docs/SWAL/README.md) and [`docs/SWAL_NODE_AND_PLANS.md`](docs/SWAL_NODE_AND_PLANS.md).

`@shelf/edge-mesh` (prefer monorepo canonical `edge-mesh/`) powers browser-to-browser interaction in Shelf.

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

### Usage Examples

#### P2P Node API

Use the node API when you need typed application messages and peer lifecycle events.

```ts
import {
  InMemoryStorage,
  PeerJSTransport,
  createEdgeMeshNode,
} from '@shelf/edge-mesh';

const node = await createEdgeMeshNode({
  peerId: 'store-admin-01',
  transport: new PeerJSTransport(),
  storage: new InMemoryStorage(),
});

await node.start();
await node.connect('warehouse-tablet-02');

node.on('peer:connected', (peerId) => {
  console.info('peer connected', peerId);
});

node.on('message', ({ type, payload, sourcePeerId }) => {
  console.info('message', type, sourcePeerId, payload);
});

await node.broadcast({
  type: 'inventory:ping',
  payload: { at: Date.now() },
});
```

#### CRDT Namespace API

Use `EdgeMesh` when a workflow needs shared mutable state. Each namespace owns a Yjs document and can contain any number of Yjs maps, arrays, or custom shared types.

```ts
import { EdgeMesh, type Transport } from '@shelf/edge-mesh';

const transport: Transport = createTransportSomewhere();
const mesh = new EdgeMesh({
  localPeerId: 'store-admin-01',
  transport,
});

const shelf = mesh.getNamespace('shelf');
const products = shelf.doc.getMap('products');

shelf.doc.transact(() => {
  products.set('sku-001', {
    id: 'sku-001',
    name: 'USB Cable',
    quantity: 12,
    updatedBy: 'store-admin-01',
  });
}, 'local-workflow');

const update = shelf.getUpdate();
```

The detailed package documentation is in [`packages/edge-mesh/README.md`](packages/edge-mesh/README.md).

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

## Technical Documentation

The technical documentation lives in `apps/docs`.

## GitCore

Shelf uses GitCore (v3.6.0) for architecture governance, feature tracking, and SDLC workflow.

| File | Purpose |
| --- | --- |
| `.gitcore/ARCHITECTURE.md` | Project architecture, stack, patterns, layers |
| `.gitcore/features.json` | Feature registry (21 features, ~91% real — 21 implemented / 0 partial) |
| `.gitcore/AGENT_INDEX.md` | Agent labels (jules, opencode, gemini, claude) |
| `.gitcore/SDLC_WORKFLOW.md` | Development lifecycle workflow |
| `.gitcore/CORTEX_INTEGRATION.md` | SWAL neural core integration |
| `.gitcore/SRC_CONFIG.md` | SRC document configuration |
| `.gitcore/planning/PLANNING.md` | Sprint planning |
| `.gitcore/planning/TASK.md` | Active task tracking |

## CI and Deployment

GitHub Actions runs lint/build jobs when hosted runners are available. Vercel deploys previews and `main`.
