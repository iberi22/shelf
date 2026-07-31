# p2p-mesh-core — Developer Guide

> **Package:** `@shelf/p2p-mesh-core`  
> **Stack:** TypeScript, PeerJS (WebRTC), Yjs (CRDT), Post-Quantum Crypto (ML-KEM/ML-DSA)  
> **Last updated:** 2026-07-31

---

## 1. Overview

`p2p-mesh-core` is the offline-first P2P synchronization engine for the Shelf inventory/POS system. It provides:

- **PeerJS WebRTC mesh** — browser-to-browser connections via a PeerServer broker
- **Yjs CRDT** — conflict-free replicated data types for products, sales, clients, etc.
- **Post-quantum handshake** — ML-KEM-768 key encapsulation + ML-DSA-65 challenge-response
- **Role-based ACL** — admin / collaborator / vendedor with per-collection permissions
- **Dual-layer encryption** — AES-GCM app-layer encryption on top of WebRTC DTLS
- **Security revert** — surgical rollback of unauthorized remote CRDT mutations

The package is consumed by `@shelf/edge-mesh` (transport adapter) and `apps/shelf-inventory` (React UI).

---

## 2. Module Map

### 2.1 P2P Layer (`src/p2p/`)

| File | Lines | Purpose |
|------|-------|---------|
| **`p2p.ts`** | 973 | `P2PManager` class — the orchestrator. Owns PeerJS `Peer`, manages connections, reconnection logic, PQC keypairs, and delegates to sub-modules. Public API: `init()`, `connect()`, `broadcast()`, `sendTo()`, `onMessage()`, `onConnectionChange()`, `onHandshakeRequest()`, `onHandshakeResponse()`. |
| **`p2p/sync-types.ts`** | 123 | `SyncMessage` discriminated union — all 20+ message types. Also exports `ConnectionErrorInfo`, `PeerHealthInfo`, `HandshakeRequestPayload`, `HandshakeResponsePayload`. |
| **`p2p/crypto-handshake.ts`** | 66 | Pure functions for PQC operations: `loadOrGenerateKeys()` (KEM/DSA keygen with localStorage persistence), `sign()`, `verify()`, plus re-exports of `encapsulate`, `decapsulate`, `fromHex`, `toHex`. |
| **`p2p/yjs-sync.ts`** | 145 | Yjs CRDT sync bridge: `requestYjsSync()` (state-vector exchange), `sendYjsDiff()` (computed diff), `initYjsSync()` (local change listener + broadcast with retries). Defines `YjsSyncContext` interface. |
| **`p2p/permissions.ts`** | 108 | Authority checks: `isLocalAuthorityPeer()`, `isAuthorityMessage()`, `isAuthorizedAuthoritySender()`, `shouldEncryptMessage()`, `isSensitive()`. Encryption policy: authority messages always encrypted; YJS encrypted only when dual-ready. |
| **`p2p/message-handler.ts`** | 550 | Core message router: `handleMessage()` dispatches incoming data by `SyncMessage.type`. Handles PQC handshake (3-step), encrypted payload decryption, YJS sync, PING/PONG, edge-mesh envelopes, recovery requests. Defines `MessageHandlerContext` interface. |

### 2.2 Database Sync Layer (`src/database-sync/`)

| File | Lines | Purpose |
|------|-------|---------|
| **`database-sync/index.ts`** | 19 | Barrel re-export: exports `DatabaseSyncManager` class + `dbSync` singleton + `ConnectionEvent` type. |
| **`database-sync/database-sync-manager.ts`** | ~495 | `DatabaseSyncManager` class — the public API. Wraps a `Y.Doc` with 13 `Y.Map` collections. Methods: `init()`, `upsertEntity()`, `deleteEntity()`, `applyUpdate()`, `getStateVector()`, `getDiff()`, `onChange()`, `onReady()`. Instantiates the `dbSync` singleton. |
| **`database-sync/types.ts`** | 62 | Shared types: `ConnectionEvent`, `EntityRecord`, `SyncEntityRecord`, `LinkedNodeRecord`, `SyncContext`. |
| **`database-sync/authority-checks.ts`** | ~396 | ACL engine: `getAuthorityPeerId()`, `isAuthorityPeer()`, `isLocalAuthority()`, `isPeerVerified()`, `getDefaultPermissions()`, `getEffectivePeerConfig()`, `checkPermissions()` (local writes), `checkRemotePermissions()` (remote applies). Constants: `SECURED_COLLECTIONS`, `PRIVILEGE_COLLECTIONS`, `SECURITY_REVERT_ORIGIN`. |
| **`database-sync/connection-tracking.ts`** | ~419 | Peer lifecycle: `logConnectionEvent()`, `updateEphemeralNode()`, `getLinkedNodes()`, `updateLinkedNode()`, `updatePeerConfig()`, `removeLinkedNode()`, `selectSuccessor()` (failover), `promoteSuccessor()`, `checkHostHealth()`, `getMasterPeerId()`/`setMasterPeerId()`. |
| **`database-sync/entity-managers.ts`** | ~436 | Collection CRUD: `buildCollectionMap()`, `getMapForCollection()`, `upsertEntity()` (with merge resolution for collaborator product edits → `pendingEdits`), `deleteEntity()`, `resolvePendingEdit()`, `initWithState()`, `getState()`, `startGarbageCollection()`/`stopGarbageCollection()`. Branch scoping via `isBranchScoped()`. |
| **`database-sync/merge-engine.ts`** | 271 | CRDT security: `snapshotCollectionMaps()`, `revertUnauthorizedRemoteChanges()`, `snapshotPrivilegeMaps()`, `revertUnauthorizedPrivilegeMaps()`, `applyUpdate()` (gated), `getLocalUpdate()`, `getStateVector()`, `getDiff()`, `registerObservers()`. |

### 2.3 Other Root Modules

| File | Purpose |
|------|---------|
| `types.ts` | All domain types: `AppState`, `Product`, `Sale`, `Client`, `Supplier`, `PurchaseOrder`, `PeerInfo`, `PeerPermissions`, `P2PRole`, `InventoryConfig`, etc. |
| `crypto.ts` | AES-GCM encryption helpers (`encryptData`, `decryptData`, `importPQCSharedSecret`). |
| `crypto-pqc.ts` | Low-level PQC wrappers: `generateKEMKeyPair()`, `generateDSAKeyPair()`, `encapsulate()`, `decapsulate()`, `fromHex()`, `toHex()`. |
| `p2p-transport-adapter.ts` | `EdgeMeshTransportBinder` — bridges P2PManager to edge-mesh envelope relay. |
| `cloud-sync.ts` | Cloud backup sync (Firebase/storage integration). |
| `consensus.ts` | Multi-peer consensus logic. |
| `utils/logger.ts` | Scoped logger (`logger` singleton, `setLoggerPeerId()`). |
| `index.ts` | Barrel re-export of all public APIs. |

---

## 3. How to Add a New `SyncMessage` Type

The `SyncMessage` type in `src/p2p/sync-types.ts` is a **discriminated union** on the `type` field. To add a new message:

### Step 1: Define the variant

Edit `src/p2p/sync-types.ts` and add a new member to the `SyncMessage` union:

```typescript
export type SyncMessage =
  | { type: "ENCRYPTED_PAYLOAD"; payload: { ciphertext: string } }
  // ... existing types ...
  | {
      type: "MY_NEW_MESSAGE";
      payload: { someField: string; count: number };
    };
```

### Step 2: Handle routing in message-handler.ts

Edit `src/p2p/message-handler.ts` and add a handler branch in `handleMessage()`:

```typescript
if (message.type === "MY_NEW_MESSAGE") {
  // Handle the message
  logger.log(`Received MY_NEW_MESSAGE: ${message.payload.someField}`);
  // Optionally emit to external callbacks:
  ctx.emitMessageCallbacks(message, conn.peer);
  return;
}
```

### Step 3: Send the message from P2PManager

In `src/p2p.ts`, send via `broadcast()` or `sendTo()`:

```typescript
this.broadcast({
  type: "MY_NEW_MESSAGE",
  payload: { someField: "hello", count: 42 },
});
```

### Step 4: Add encryption policy (if needed)

If the message is sensitive, add it to `ALWAYS_SENSITIVE_TYPES` or `YJS_SENSITIVE_TYPES` in `src/p2p/permissions.ts`:

```typescript
const ALWAYS_SENSITIVE_TYPES = new Set([
  // ... existing ...
  "MY_NEW_MESSAGE",
]);
```

### Step 5: Update barrel exports (if needed)

If you exported new public types, add them to the `export type` block at the top of `src/p2p.ts`.

---

## 4. How to Add a New Entity to `database-sync`

Each "entity" is a domain object (e.g., `Product`, `Sale`) stored in a `Y.Map` collection. To add a new one (e.g., `Warehouse`):

### Step 1: Define the type

Add to `src/types.ts`:

```typescript
export interface Warehouse extends BaseEntity {
  name: string;
  location: string;
  capacity: number;
}
```

### Step 2: Add to `AppState`

```typescript
export interface AppState {
  // ... existing ...
  warehouses: Warehouse[];
}
```

### Step 3: Register the Y.Map

In `src/database-sync/entity-managers.ts` → `buildCollectionMap()`:

```typescript
export function buildCollectionMap(doc: Y.Doc): Record<string, Y.Map<any>> {
  return {
    // ... existing ...
    warehouses: doc.getMap("warehouses"),
  };
}
```

### Step 4: Add to secured collections (if ACL needed)

In `src/database-sync/authority-checks.ts`, add to `SECURED_COLLECTIONS`:

```typescript
export const SECURED_COLLECTIONS = [
  // ... existing ...
  "warehouses",
] as const;
```

### Step 5: Add permission check

In `src/database-sync/authority-checks.ts` → `checkPermissions()`, add a case:

```typescript
case "warehouses":
  return !!perms.canEditProducts; // Reuse existing perm or add new one
```

### Step 6: Add to `initWithState()` and `getState()`

In `src/database-sync/entity-managers.ts`:

```typescript
// In initWithState():
mergeAndSync("warehouses", state.warehouses);

// In getState():
warehouses: getCollectionArray(collections.warehouses),
```

### Step 7: Add to observer registration

In `src/database-sync/merge-engine.ts` → `registerObservers()`, add `"warehouses"` to the `collectionNames` array.

### Step 8: Add branch scoping (if needed)

If the entity is branch-scoped, add to `BRANCH_SCOPED_COLLECTIONS` in `entity-managers.ts`:

```typescript
const BRANCH_SCOPED_COLLECTIONS = new Set([
  // ... existing ...
  "warehouses",
]);
```

### Step 9: Update `DatabaseSyncManager` class

In `src/database-sync/database-sync-manager.ts`, add the private `Y.Map` field:

```typescript
private warehouses: Y.Map<Warehouse>;
```

Initialize it in the constructor alongside other maps.

---

## 5. Testing Patterns

### Unit Testing Pure Functions

The extracted modules are **pure functions** — no class instances needed. Test them by constructing a minimal `SyncContext`:

```typescript
import * as Y from "yjs";
import { checkPermissions, getDefaultPermissions } from "./authority-checks";
import { upsertEntity } from "./entity-managers";

// Minimal SyncContext for tests
function createTestContext(): SyncContext {
  const doc = new Y.Doc();
  return {
    doc,
    localPeerId: "peer-1",
    activeBranchId: "main",
    isReady: true,
    masterRole: "admin",
    metadata: doc.getMap("metadata"),
    linkedNodes: doc.getMap("linkedNodes"),
    ephemeralNodes: new Map(),
    peerHistory: new Map(),
  };
}

it("blocks unauthorized product edit", () => {
  const ctx = createTestContext();
  // No linkedNode for peer-1 → default collaborator → cannot edit
  expect(checkPermissions(ctx, "products")).toBe(false);
});
```

### Testing Authority Checks

```typescript
it("detects authority peer", () => {
  const ctx = createTestContext();
  ctx.metadata.set("authorityPeerId", "peer-admin");
  expect(isAuthorityPeer("peer-admin", ctx.metadata, ctx.linkedNodes)).toBe(true);
  expect(isAuthorityPeer("peer-1", ctx.metadata, ctx.linkedNodes)).toBe(false);
});
```

### Testing CRDT Merge

```typescript
it("reverts unauthorized remote changes", () => {
  const ctx = createTestContext();
  const before = snapshotCollectionMaps(ctx.doc);
  // Apply a remote update...
  // revertUnauthorizedRemoteChanges will restore `before` state
});
```

### Testing PQC Handshake

Use the pure functions from `crypto-handshake.ts`:

```typescript
import { loadOrGenerateKeys, sign, verify } from "./crypto-handshake";

it("signs and verifies a challenge", () => {
  const keys = loadOrGenerateKeys("dsa");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const sig = sign(challenge, keys.secretKey);
  expect(verify(sig, challenge, toHex(keys.publicKey))).toBe(true);
});
```

### E2E P2P Tests

Use PeerJS with a local PeerServer (`pnpm peer-server` on port 9000). The `P2PManager` auto-detects `localhost` and connects to `127.0.0.1:9000` in dev mode.

---

## 6. Key Interfaces

### `SyncMessage` (discriminated union)

Located in `src/p2p/sync-types.ts`. The `type` field is the discriminant. Categories:

- **Connectivity:** `PING`, `PONG`, `PEER_LIST_UPDATE`
- **PQC Handshake:** `PQC_HANDSHAKE`, `PQC_KEM_REPLY`, `PQC_KEM_REPLY_ACK`, `PQC_HANDSHAKE_REQUEST`, `PQC_HANDSHAKE_RESPONSE`
- **Encryption:** `ENCRYPTED_PAYLOAD`, `ENCRYPTION_READY`
- **YJS Sync:** `YJS_UPDATE`, `YJS_SYNC_REQUEST`, `SET_ACTIVE_BRANCH`
- **Authority:** `PROMOTE_ADMIN`, `CHANGE_ROLE`, `UPDATE_PEER_PERMISSIONS`
- **Recovery:** `REQUEST_ACCOUNT_RECOVERY`, `RECOVERY_APPROVED`, `RECOVERY_DENIED`, `DEVICE_AUTHORIZED`
- **Edge Mesh:** `EDGE_MESH_ENVELOPE`, `EDGE_MESH_SYNC`, `CRDT_SYNC_ENVELOPE`
- **State:** `STATE_UPDATE`, `REQUEST_FULL_STATE`

### `PeerPermissions`

```typescript
interface PeerPermissions {
  canViewProducts: boolean;
  canEditProducts: boolean;
  canViewSales: boolean;
  canEditSales: boolean;
  canViewClients: boolean;
  canEditClients: boolean;
  canViewSuppliers: boolean;
  canEditSuppliers: boolean;
  canViewPurchaseOrders: boolean;
  canEditPurchaseOrders: boolean;
  canViewReports: boolean;
  canViewArqueo: boolean;
  canViewDashboard: boolean;
}
```

### `P2PRole`

```typescript
type P2PRole = "admin" | "collaborator" | "vendedor" | "custom";
```

### `PeerInfo`

```typescript
interface PeerInfo {
  id: string;
  role: P2PRole;
  lastSeen: string;
  isMaster?: boolean;
  permissions?: PeerPermissions;
  status?: "connected" | "verified" | "offline";
  dsaPublicKey?: string;
  isVerified?: boolean;
}
```

### `LinkedNodeRecord`

```typescript
type LinkedNodeRecord = Omit<PeerInfo, "lastSeen"> & {
  permissions?: PeerPermissions;
  isMaster?: boolean;
  lastSeen: string;
  status?: "connected" | "verified" | "offline";
  connectedAt?: string;
  verifiedAt?: string;
};
```

### `SyncContext` (for extracted helpers)

```typescript
interface SyncContext {
  doc: Y.Doc;
  localPeerId: string | null;
  activeBranchId: string | undefined;
  isReady: boolean;
  masterRole: string | null;
  metadata: Y.Map<string>;
  linkedNodes: Y.Map<LinkedNodeRecord>;
  ephemeralNodes: Map<string, Partial<LinkedNodeRecord>>;
  peerHistory: Map<string, ConnectionEvent[]>;
}
```

### `YjsSyncContext` (for YJS sync helpers)

```typescript
interface YjsSyncContext {
  sendTo: (peerId: string, message: SyncMessage) => Promise<void>;
  broadcast: (message: SyncMessage) => void;
  yjsWireMode: "legacy" | "envelope-when-ready";
  edgeYjsRelay: ((update: Uint8Array, branchId?: string) => Promise<void>) | null;
  areAllConnectedPeersDualReady: () => boolean;
  connections: Map<string, { open: boolean }>;
}
```

### `MessageHandlerContext`

Extends `YjsSyncContext` with crypto state, health monitors, callbacks, and state mutators. Defined in `src/p2p/message-handler.ts`.

### `EntityRecord`

```typescript
type EntityRecord = {
  id: string;
  lastSeen?: string;
  action?: string;
  timestamp?: string;
  updatedAt?: string;
  updatedBy?: string;
};
```

---

## 7. Architecture Decisions

### Why context interfaces instead of passing `this`?

The extracted helper functions (in `p2p/permissions.ts`, `p2p/yjs-sync.ts`, etc.) are **pure functions** that receive explicit parameters via context interfaces (`YjsSyncContext`, `MessageHandlerContext`, `SyncContext`). This:

- Makes functions unit-testable without a real P2PManager instance
- Avoids tight coupling to the class
- Allows composition (e.g., `MessageHandlerContext` extends `YjsSyncContext`)

### Security Revert Pattern

Remote CRDT updates go through a snapshot → apply → revert cycle:
1. **Snapshot** all secured collections before `Y.applyUpdate()`
2. **Apply** the update
3. **Revert** any changes the remote peer wasn't authorized to make (using `checkRemotePermissions`)
4. Reverts use origin `"p2p-security-revert"` so observers can ignore them

### Dual-Ready Encryption

YJS updates are encrypted at the app layer (AES-GCM) only after **both** peers have exchanged `ENCRYPTION_READY`. Before that, YJS falls back to WebRTC's built-in DTLS encryption. This is controlled by `encryptYjsWhenDualReady` and `yjsWireMode`.

### Branch Scoping

Collections like `products`, `sales`, `arqueoSessions` are scoped by `activeBranchId` in multi-branch mode. Branch-scoped collections are listed in `BRANCH_SCOPED_COLLECTIONS` (in `entity-managers.ts`).

---

## 8. Common Pitfalls

1. **Forgetting to add to `SECURED_COLLECTIONS`** — new collections without ACL will accept all remote writes
2. **Missing `buildCollectionMap` entry** — the `getMapForCollection()` lookup will return `null`
3. **Not adding to `registerObservers()`** — the `onChange` callback won't fire for that collection
4. **State vector drift** — always use `dbSync.getStateVector()` for diffs, never raw `Y.encodeStateAsUpdate()`
5. **PQC key persistence** — keys are stored in `localStorage` under `shelf_kem_*` / `shelf_dsa_*`; clearing storage forces re-handshake
6. **Duplicate connections** — `onConnectionOpen()` resolves by lexicographic peer ID comparison; higher ID wins
