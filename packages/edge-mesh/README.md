# @shelf/edge-mesh

`@shelf/edge-mesh` is Shelf's next-generation local-first runtime for browser-to-browser collaboration. It combines transport-agnostic P2P messaging, Yjs CRDT namespaces, peer-aware remote origins, and an authorization surface that Shelf can extend into a wider edge-mesh execution layer.

The package is intentionally split from the inventory app so the same primitives can power future workflows: multi-browser inventory sync, WebGPU agents, local-first assistants, peer capabilities, and secure data replication without a central application server.

## Current Capabilities

- **P2P node runtime:** `createEdgeMeshNode` wraps a `MeshTransport` and `MeshStorage` implementation behind a stable event API.
- **Protocol envelopes:** messages include ids, version, source peer, optional target peer, timestamp, type, and payload.
- **Message deduplication:** repeated envelopes are ignored before they reach application handlers.
- **Yjs namespaces:** `EdgeMesh#getNamespace(name)` creates independent CRDT documents per workflow.
- **Delta sync:** each namespace exports and applies Yjs state updates instead of sending full application snapshots.
- **Remote origin tracking:** incoming updates are applied with `{ type: 'remote', peerId }`, which lets applications enforce permissions before merging into local state.
- **Broadcast loop prevention:** remote-origin Yjs transactions are not re-broadcast by the node that applied them.
- **React integration:** `edge-mesh-react` provides `EdgeMeshProvider`, `useEdgeMesh`, and `useCollection`.
- **Shelf workflow bridge:** `apps/shelf-inventory` maps application collections into the `shelf` namespace and applies remote updates through permission checks.
- **WebGPU extension point:** `WebGPUAgent` is the current placeholder for peer-local agent execution with WebGPU/CPU fallback.

## Package Layout

| Path | Responsibility |
| --- | --- |
| `src/core/node.ts` | Node lifecycle, peer events, send/broadcast helpers, envelope routing |
| `src/edge-mesh.ts` | Yjs namespace registry, update encoding, remote origin handling |
| `src/protocol` | Versioned message envelopes and deduplication |
| `src/transport` | Transport interfaces |
| `src/transport-webrtc` | PeerJS/WebRTC transport implementation |
| `src/storage` | Storage abstraction and in-memory implementation |
| `src/presence` | Peer discovery and heartbeat primitives |
| `src/authz` | Signed capability model for future permission delegation |
| `src/gpu-agent` | WebGPU-aware local agent execution entry point |
| `edge-mesh-react` | React provider and collection hook over CRDT namespaces |

## Installation

```bash
pnpm add @shelf/edge-mesh
```

Inside this monorepo the package is consumed through workspace aliases:

```bash
pnpm --filter @shelf/edge-mesh test
pnpm --filter shelf-inventory exec playwright test tests/edge-mesh-sync.spec.ts
```

## P2P Node API

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

## CRDT Namespace API

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

When the transport receives a remote namespace update, `EdgeMesh` applies it with a peer-aware origin:

```ts
adapter.applyUpdate(update, { type: 'remote', peerId: from });
```

Consumers can detect that origin with:

```ts
import { isEdgeMeshRemoteOrigin } from '@shelf/edge-mesh';

if (isEdgeMeshRemoteOrigin(event.transaction.origin)) {
  const remotePeerId = event.transaction.origin.peerId;
}
```

That origin is the key security hook used by Shelf to distinguish local state reflection from remote peer mutations.

## Shelf Integration

Shelf maps app state into the `shelf` namespace through `apps/shelf-inventory/lib/edge-mesh-workflow.ts`.

The synchronized collections are:

- `products`
- `sales`
- `clients`
- `suppliers`
- `purchaseOrders`
- `arqueoSessions`
- `ocrResults`
- `auditLogs`
- `teamMembers`

`EdgeMeshWorkflowBridge` keeps the Yjs document and app state in sync:

1. Local app state changes are reflected into Yjs maps with origin `shelf-edge-workflow`.
2. Local-origin transactions are ignored by the remote observer to avoid echoing changes back into app state.
3. Remote transactions are inspected with `isEdgeMeshRemoteOrigin`.
4. Authorized remote changes dispatch `SYNC_ENTITIES` into the app reducer.
5. Unauthorized remote changes are reverted inside the Yjs document with origin `shelf-edge-security-revert`.
6. Bridge status is emitted through `window.__shelfEdgeMeshStatus` and the `shelf-edge-mesh-status` event.

## Remote Mutation Policy

Shelf currently applies collection-level authorization before a remote Edge Mesh update can affect application state.

| Collection | Required permission |
| --- | --- |
| `products` | `canEditProducts` |
| `sales` | `canEditSales` |
| `clients` | `canEditClients` |
| `suppliers` | `canEditSuppliers` |
| `purchaseOrders` | `canEditPurchaseOrders` |
| `arqueoSessions` | `canViewArqueo` |
| `ocrResults` | `canEditPurchaseOrders` |
| `teamMembers` | master peer only |
| `auditLogs` | allowed unless the action contains `PRIVILEGE` |

The master peer is resolved from `state.peers.find(peer => peer.isMaster)` and falls back to `state.localPeerId`. Unknown peers cannot mutate restricted collections.

## Local E2E Harness

For Playwright only, localhost runtimes expose a guarded test harness:

```ts
window.__shelfEdgeMeshForTest = {
  getState(),
  getUpdate(),
  applyRemoteUpdate(peerId, update),
  upsert(collection, id, item),
  remove(collection, id),
};
```

The harness is only installed for `localhost`, `127.0.0.1`, or `::1`. Production deployments do not expose it.

## Verification

Core package tests:

```bash
pnpm --dir packages/edge-mesh test
```

Shelf E2E coverage for synchronization and security:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5187 pnpm --dir apps/shelf-inventory exec playwright test tests/edge-mesh-sync.spec.ts tests/security-sync.spec.ts tests/p2p-sync.spec.ts --project=chromium --reporter=list --config=playwright.config.ts --workers=1
```

The E2E suite validates:

- exported CRDT updates apply in a second browser context;
- remote updates reach both the Edge Mesh document and Shelf app state;
- unauthorized remote mutations for restricted collections are reverted;
- local unauthorized mutations remain blocked by existing app security checks;
- localhost PeerJS routing uses the local PeerServer during E2E/dev runs.

## Extension Roadmap

The package is structured so the next edge-mesh iterations can add:

- signed remote updates and capability proofs;
- encrypted namespace payloads;
- durable IndexedDB storage for namespace state vectors;
- gossip or relay transports beyond direct PeerJS;
- WebGPU agent tasks that operate on local CRDT context;
- policy plugins per collection or workflow;
- observability hooks for sync latency, rejected updates, and peer health.
