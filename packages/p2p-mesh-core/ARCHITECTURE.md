# P2P Mesh Core — Architecture

**Package:** `@shelf/p2p-mesh-core`  
**Location:** `packages/p2p-mesh-core/`  
**Version:** 0.5.0  
**Last Updated:** 2026-07-31

---

## 1. Overview

`@shelf/p2p-mesh-core` is the peer-to-peer synchronization engine for Shelf Inventory. It provides:

- **WebRTC mesh networking** via PeerJS (browser-to-browser data channels)
- **CRDT-based data sync** via Yjs (conflict-free replicated data types)
- **Post-quantum cryptography** via ML-KEM-768 (key exchange) and ML-DSA-65 (digital signatures)
- **Authority-based access control** (master peer, role-based permissions)
- **Edge-mesh envelope transport** (Phase C integration with `@shelf/edge-mesh`)

The library is designed for **offline-first** operation — peers can work independently and reconcile when they reconnect.

---

## 2. Module Map

```
packages/p2p-mesh-core/src/
│
├── index.ts                          Public barrel — re-exports all modules
│
├── p2p.ts                            P2PManager class (orchestrator)
│   └── p2p/
│       ├── sync-types.ts             SyncMessage union type (25 message variants)
│       ├── crypto-handshake.ts       PQC key generation, signing, verification
│       ├── permissions.ts            Authority checks, encryption policy
│       ├── yjs-sync.ts               Yjs state-vector exchange & branch management
│       └── message-handler.ts        Message routing & connection lifecycle
│
├── database-sync/                    DatabaseSyncManager (CRDT data layer)
│   ├── index.ts                      Barrel re-export
│   ├── types.ts                      Shared types (SyncContext, EntityRecord, etc.)
│   ├── authority-checks.ts           Permission resolution & collection-level authz
│   ├── connection-tracking.ts        Peer connection events, failover, successor selection
│   ├── entity-managers.ts            Collection mapping, CRUD, garbage collection
│   ├── merge-engine.ts              CRDT apply, state vector, security revert
│   └── database-sync-manager.ts      DatabaseSyncManager class (public API)
│
├── crypto.ts                         WebCrypto AES-GCM encryption (PBKDF2 key derivation)
├── crypto-pqc.ts                     Post-quantum primitives (ML-KEM-768, ML-DSA-65)
├── consensus.ts                      Governance proposal & voting helpers
├── cloud-sync.ts                     Supabase cloud persistence for Pro/Pyme users
├── p2p-transport-adapter.ts          Edge-mesh ITransport adapter over PeerJS channels
├── types.ts                          Core domain types (Product, Sale, AppState, etc.)
└── utils/
    └── logger.ts                     Peer-aware logger with timestamp
```

---

## 3. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LOCAL BROWSER NODE                               │
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────────────┐  │
│  │  React UI    │◄──►│  AppState    │◄──►│  DatabaseSyncManager      │  │
│  │  (hooks)     │    │  Context     │    │  (Yjs Y.Doc)             │  │
│  └──────────────┘    └──────────────┘    │                           │  │
│                                          │  products ──── Y.Map     │  │
│                                          │  sales ──────── Y.Map     │  │
│                                          │  clients ────── Y.Map     │  │
│                                          │  ...13 collections...     │  │
│                                          │  metadata ───── Y.Map     │  │
│                                          │  linkedNodes ── Y.Map     │  │
│                                          └────────────┬──────────────┘  │
│                                                       │                  │
│                                              doc.on('update')           │
│                                                       │                  │
│  ┌──────────────────────────────────────────────────────┐               │
│  │              P2PManager (p2p.ts)                     │               │
│  │                                                      │               │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │               │
│  │  │ PeerJS      │  │ message-     │  │ yjs-sync   │ │               │
│  │  │ Peer        │  │ handler.ts   │  │ .ts        │ │               │
│  │  │ (WebRTC)    │  │              │  │            │ │               │
│  │  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │               │
│  │         │                │                  │        │               │
│  │  ┌──────┴──────┐  ┌─────┴────────┐  ┌─────┴──────┐ │               │
│  │  │ crypto-     │  │ permissions  │  │ SyncMessage│ │               │
│  │  │ handshake.ts│  │ .ts          │  │ (25 types) │ │               │
│  │  │ (PQC)       │  │ (authority)  │  │            │ │               │
│  │  └─────────────┘  └──────────────┘  └────────────┘ │               │
│  └────────────────────────┬────────────────────────────┘               │
│                           │                                             │
└───────────────────────────┼─────────────────────────────────────────────┘
                            │
                   WebRTC DataChannel (PeerJS)
                            │
                   ┌────────┴────────┐
                   │   PeerServer    │
                   │  (signaling)    │
                   └────────┬────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     REMOTE BROWSER NODE                                   │
│                                                                           │
│  Same architecture — P2PManager receives messages via handleMessage()     │
│  Routes YJS_UPDATE → dbSync.applyUpdate()                                │
│  Routes YJS_SYNC_REQUEST → sendYjsDiff()                                 │
│  Routes ENCRYPTED_PAYLOAD → decrypt → re-route                           │
│  Routes EDGE_MESH_ENVELOPE → edge-mesh listeners                         │
│  Routes PQC_HANDSHAKE → crypto-handshake.ts handlers                     │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### Sync Flow (Step by Step)

```
1. Local mutation
   React UI → upsertEntity() → Y.Map.set() → doc emits 'update'

2. Broadcast
   doc 'update' → yjs-sync.ts → broadcast YJS_UPDATE (hex-encoded diff)
   OR: envelope-when-ready mode → edgeYjsRelay → EDGE_MESH_ENVELOPE

3. Remote receive
   PeerJS 'data' → message-handler.ts → handleMessage()
   → YJS_UPDATE? → dbSync.applyUpdate(fromHex(update))

4. Security check
   merge-engine.ts → snapshotCollectionMaps() → applyUpdate()
   → revertUnauthorizedRemoteChanges() for non-authority peers

5. State reconciliation
   On reconnect: requestYjsSync() → state-vector exchange → getDiff() → applyUpdate()
```

---

## 4. Key Interfaces

### 4.1 SyncMessage (25 variants)

Defined in `p2p/sync-types.ts`. Every message sent over the P2P mesh is a `SyncMessage`:

```typescript
type SyncMessage =
  // ── Encryption ──
  | { type: "ENCRYPTED_PAYLOAD"; payload: { ciphertext: string } }
  | { type: "ENCRYPTION_READY"; payload?: { v?: number } }

  // ── State ──
  | { type: "STATE_UPDATE"; payload: Partial<AppState> }
  | { type: "REQUEST_FULL_STATE" }

  // ── Authority ──
  | { type: "PROMOTE_ADMIN"; payload: { targetPeerId: string } }
  | { type: "CHANGE_ROLE"; payload: { targetPeerId: string; role: P2PRole; permissions?: PeerPermissions } }
  | { type: "UPDATE_PEER_PERMISSIONS"; payload: { targetPeerId: string; permissions: PeerPermissions; role?: P2PRole } }

  // ── Peer Discovery ──
  | { type: "PEER_LIST_UPDATE"; payload: PeerInfo[] }

  // ── PQC Handshake ──
  | { type: "PQC_HANDSHAKE"; payload: { kemPublicKey: string; dsaPublicKey: string; challenge: string } }
  | { type: "PQC_KEM_REPLY"; payload: { ciphertext: string; signature: string; responderChallenge: string; dsaPublicKey?: string } }
  | { type: "PQC_KEM_REPLY_ACK"; payload: { signature: string } }
  | { type: "PQC_HANDSHAKE_REQUEST"; payload: { kemPubKey: string; dsaPubKey: string; deviceName: string } }
  | { type: "PQC_HANDSHAKE_RESPONSE"; payload: { cipherText: string; signature: string; dsaPubKey: string } }

  // ── Yjs CRDT ──
  | { type: "YJS_UPDATE"; payload: { update: string; branchId?: string } }
  | { type: "YJS_SYNC_REQUEST"; payload: { stateVector: string; branchId?: string; respondWithRequest?: boolean } }
  | { type: "SET_ACTIVE_BRANCH"; payload: { branchId: string } }

  // ── Branch ──
  | { type: "SET_ACTIVE_BRANCH"; payload: { branchId: string } }

  // ── Heartbeat ──
  | { type: "PING"; peerId?: string; timestamp?: number }
  | { type: "PONG"; peerId?: string; timestamp?: number }

  // ── Account Recovery ──
  | { type: "REQUEST_ACCOUNT_RECOVERY"; payload: { requestId: string; email: string; deviceName: string; deviceId: string } }
  | { type: "RECOVERY_APPROVED"; payload: { requestId: string; encryptedSeed: string; tempKey: string } }
  | { type: "RECOVERY_DENIED"; payload: { requestId: string; reason: string } }
  | { type: "DEVICE_AUTHORIZED"; payload: { deviceId: string; deviceName: string; authorizedAt: string } }

  // ── Edge Mesh ──
  | { type: "CRDT_SYNC_ENVELOPE"; payload: { envelope: any } }
  | { type: "EDGE_MESH_SYNC"; payload: Uint8Array }
  | { type: "EDGE_MESH_ENVELOPE"; payload: { envelope: EdgeMeshEnvelopeWire } };
```

### 4.2 MessageHandlerContext

Defined in `p2p/message-handler.ts`. Everything the message router needs from `P2PManager`:

```typescript
interface MessageHandlerContext extends YjsSyncContext {
  localPeerId: string | null;
  role: P2PRole;

  // Crypto state
  kemKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array };
  dsaKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array };
  sharedSecrets: Map<string, Uint8Array>;
  encryptionKeys: Map<string, CryptoKey>;
  peerDsaKeys: Map<string, string>;
  pendingChallenges: Map<string, Set<string>>;
  dualReadyEncryption: Set<string>;
  pendingEncryptionReady: Set<string>;
  connectingPeers: Set<string>;
  peers: PeerInfo[];
  lastMessageTime: Map<string, number>;
  peerBranches: Map<string, string>;
  pendingPings: Map<string, number>;

  // Peer health
  health: {
    markConnected(id: string): void;
    markOffline(id: string): void;
    markPing(id: string): void;
    markPong(id: string): void;
  };

  // Callbacks
  emitMessageCallbacks(message: SyncMessage, fromPeerId: string): void;
  emitConnectionError(issue: ConnectionErrorInfo): void;
  // ... callback arrays for each message type

  // State mutators
  updatePeerList(id: string, role: P2PRole): void;
  broadcastPeerList(): void;
  notifyConnectionChange(): void;
  connect(peerId: string): void;
  clearPeerCrypto(peerId: string): void;

  // Crypto functions
  signFn: (message: Uint8Array) => Uint8Array;
  verifyFn: (signature: Uint8Array, message: Uint8Array, publicKeyHex: string) => boolean;
}
```

### 4.3 SyncContext

Defined in `database-sync/types.ts`. Shared state for all database-sync sub-modules:

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

### 4.4 Core Domain Types

Defined in `types.ts`:

```typescript
interface Product extends BaseEntity {
  name: string;
  sku?: string;
  branchId?: string;
  quantity: number;
  price: number;
  cost: number;
  variants?: ProductVariant[];
  // ... 15+ fields
}

interface AppState {
  products: Product[];
  sales: Sale[];
  clients: Client[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  auditLogs: AuditEntry[];
  peers: PeerInfo[];
  teamMembers: TeamMember[];
  branches: Branch[];
  // ... 15+ collections
}
```

---

## 5. How to Add a New Message Type

### Step 1: Define the type in `sync-types.ts`

```typescript
// packages/p2p-mesh-core/src/p2p/sync-types.ts

export type SyncMessage =
  | { type: "MY_NEW_MESSAGE"; payload: { data: string } }
  // ... existing types
```

### Step 2: Add routing in `message-handler.ts`

```typescript
// packages/p2p-mesh-core/src/p2p/message-handler.ts

export async function handleMessage(
  ctx: MessageHandlerContext,
  conn: DataConnection,
  data: unknown,
): Promise<void> {
  // ... existing routing

  if (message.type === "MY_NEW_MESSAGE") {
    // Handle the message
    await handleMyNewMessage(ctx, conn, message);
    return;
  }
}
```

### Step 3: Add sending method in `p2p.ts` (optional)

```typescript
// packages/p2p-mesh-core/src/p2p.ts

public sendMyNewMessage(toPeerId: string, data: string) {
  this.sendTo(toPeerId, {
    type: "MY_NEW_MESSAGE",
    payload: { data },
  });
}
```

### Step 4: Add to encryption policy if sensitive

```typescript
// packages/p2p-mesh-core/src/p2p/permissions.ts

const ALWAYS_SENSITIVE_TYPES = new Set([
  // ... existing
  "MY_NEW_MESSAGE",
]);
```

### Step 5: Add unit tests

```typescript
// packages/p2p-mesh-core/tests/security.test.ts (or new test file)
// Test that the message type is correctly routed and encrypted
```

---

## 6. How to Add a New Entity Type

### Step 1: Define the entity in `types.ts`

```typescript
// packages/p2p-mesh-core/src/types.ts

export interface MyEntity extends BaseEntity {
  name: string;
  value: number;
  // ... fields
}

export interface AppState {
  // ... existing collections
  myEntities: MyEntity[];
}
```

### Step 2: Add to `database-sync/entity-managers.ts`

```typescript
// packages/p2p-mesh-core/src/database-sync/entity-managers.ts

export function buildCollectionMap(doc: Y.Doc): Record<string, Y.Map<any>> {
  return {
    // ... existing
    myEntities: doc.getMap("myEntities"),
  };
}
```

### Step 3: Add to authority checks if needed

```typescript
// packages/p2p-mesh-core/src/database-sync/authority-checks.ts

export const SECURED_COLLECTIONS = [
  // ... existing
  "myEntities",
] as const;

export const PRIVILEGE_COLLECTIONS = [
  // ... existing (only if admin-only writes)
  // "myEntities",
] as const;
```

### Step 4: Add to branch scoping if branch-specific

```typescript
// packages/p2p-mesh-core/src/database-sync/entity-managers.ts

const BRANCH_SCOPED_COLLECTIONS = new Set([
  // ... existing
  "myEntities",
]);
```

### Step 5: Add `DatabaseSyncManager` methods

```typescript
// packages/p2p-mesh-core/src/database-sync/database-sync-manager.ts

public upsertMyEntity(item: MyEntity) {
  this.upsertEntity("myEntities", item);
}

public deleteMyEntity(id: string) {
  this.deleteEntity("myEntities", id);
}
```

### Step 6: Add to `edge-mesh-workflow.ts` collections

```typescript
// apps/shelf-inventory/lib/edge-mesh-workflow.ts

export const SHELF_EDGE_COLLECTIONS = [
  // ... existing
  "myEntities",
] as const satisfies readonly (keyof AppState)[];
```

---

## 7. Testing Patterns

### 7.1 Unit Testing Extracted Functions

All extracted functions accept context interfaces instead of class instances:

```typescript
import { isLocalAuthorityPeer } from "../src/p2p/permissions";

// Pure function — no mocking needed
const result = isLocalAuthorityPeer("peer-123", "admin");
expect(result).toBe(true);
```

### 7.2 Testing with SyncContext

```typescript
import { snapshotCollectionMaps, revertUnauthorizedRemoteChanges } from "../src/database-sync/merge-engine";

const doc = new Y.Doc();
const ctx: SyncContext = {
  doc,
  localPeerId: "local-peer",
  activeBranchId: "branch-1",
  isReady: true,
  masterRole: "admin",
  metadata: doc.getMap("metadata"),
  linkedNodes: doc.getMap("linkedNodes"),
  ephemeralNodes: new Map(),
  peerHistory: new Map(),
};

const before = snapshotCollectionMaps(doc);
// ... apply remote update
const reverted = revertUnauthorizedRemoteChanges(ctx, "remote-peer", before);
expect(reverted).toEqual([]);
```

### 7.3 Testing Message Handling

```typescript
import { handleMessage } from "../src/p2p/message-handler";

const ctx: MessageHandlerContext = {
  localPeerId: "local",
  role: "admin",
  kemKeyPair: loadOrGenerateKeys("kem"),
  dsaKeyPair: loadOrGenerateKeys("dsa"),
  sharedSecrets: new Map(),
  encryptionKeys: new Map(),
  // ... minimal mock
};

const conn = { peer: "remote", send: vi.fn(), open: true };
await handleMessage(ctx, conn, { type: "PING", peerId: "remote" });
expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ type: "PONG" }));
```

### 7.4 E2E Testing

```typescript
// apps/shelf-inventory/tests/p2p-sync.spec.ts

test("peers sync product after reconnect", async ({ page }) => {
  // 1. Create product on peer A
  // 2. Verify on peer B
  // 3. Simulate disconnect
  // 4. Create product on peer B
  // 5. Reconnect
  // 6. Verify both products visible on both peers
});
```

---

## 8. Common Pitfalls

### 8.1 Forgetting to Re-export from Barrels

When adding a new exported symbol to a sub-module, update the barrel:

```typescript
// packages/p2p-mesh-core/src/p2p/sync-types.ts
export type MyNewType = { ... };

// packages/p2p-mesh-core/src/index.ts (auto-exports via p2p.ts)
// But if you add to database-sync/, update:
// packages/p2p-mesh-core/src/database-sync/index.ts
export type { MyNewType } from "./types";
```

### 8.2 `dbSync.isReady` Guard

Always check `dbSync.isReady` before operations that depend on initialized state:

```typescript
// WRONG — may broadcast empty state
ctx.broadcast({ type: "YJS_UPDATE", payload: { update: "..." } });

// CORRECT — guard against premature broadcasts
if (!dbSync.isReady) return;
ctx.broadcast({ type: "YJS_UPDATE", payload: { update: "..." } });
```

### 8.3 Branch Scoping

Branch-scoped collections (products, sales, etc.) are filtered by `branchId` in `YJS_UPDATE` messages. When testing:

```typescript
// WRONG — may receive updates from wrong branch
expect(page.locator('[data-testid="product-count"]')).toHaveText("5");

// CORRECT — wait for branch sync to complete
await page.waitForFunction(
  () => window.dbSync.activeBranchId === "branch-1"
);
```

### 8.4 Authority Message Blocking

Non-master peers cannot send authority messages (`PROMOTE_ADMIN`, `CHANGE_ROLE`, `UPDATE_PEER_PERMISSIONS`). The guard is in `p2p.ts:sendTo()`:

```typescript
if (isAuthorityMessage(message) && !isLocalAuthorityPeer(this.localPeerId, this.role)) {
  logger.warn(`[SECURITY] Blocked outgoing authority message`);
  return;
}
```

If you need to test authority flows, ensure the test peer has `role: "admin"`.

### 8.5 Encryption Timing

App-layer encryption (AES-GCM) is only active after **dual-ready** — both peers must have exchanged `ENCRYPTION_READY`. Before that, messages ride WebRTC DTLS only. Tests that send encrypted payloads must wait for dual-ready:

```typescript
// Wait for encryption to be ready
await page.waitForFunction(
  () => p2pManager.isYjsAppEncryptedForPeer(targetPeerId)
);
```

### 8.6 Yjs Transaction Batching

Multiple `Y.Map.set()` calls within a Yjs transaction are batched into a single update. If you need granular observers:

```typescript
// CORRECT — one observer call for the whole batch
doc.transact(() => {
  productsMap.set("p1", product1);
  productsMap.set("p2", product2);
});

// WRONG — triggers two separate observer calls
productsMap.set("p1", product1);
productsMap.set("p2", product2);
```

### 8.7 PeerJS Connection Lifecycle

PeerJS connections go through: `connecting → open → data → close`. The `handleMessage` function is only called when data arrives on an `open` connection. If you see missing messages:

1. Check `conn.open === true`
2. Check `p2pManager.isPeerConnected(peerId)`
3. Check no duplicate connections (the `connectingPeers` set prevents this)

---

## 9. File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/p2p.ts` | 973 | P2PManager orchestrator — the main class consumers use |
| `src/p2p/sync-types.ts` | 123 | SyncMessage type definitions (25 variants) |
| `src/p2p/crypto-handshake.ts` | 66 | PQC key generation, signing, verification (pure functions) |
| `src/p2p/permissions.ts` | 108 | Authority checks, encryption policy (pure functions) |
| `src/p2p/yjs-sync.ts` | 145 | Yjs state-vector exchange, branch management |
| `src/p2p/message-handler.ts` | 550 | Message routing, PQC handshake sub-handlers |
| `src/database-sync/database-sync-manager.ts` | 495 | DatabaseSyncManager public API |
| `src/database-sync/types.ts` | 62 | SyncContext, EntityRecord, LinkedNodeRecord |
| `src/database-sync/authority-checks.ts` | 396 | Permission resolution, collection-level authz |
| `src/database-sync/connection-tracking.ts` | 419 | Peer connection events, failover, successor selection |
| `src/database-sync/entity-managers.ts` | 436 | Collection mapping, CRUD, garbage collection |
| `src/database-sync/merge-engine.ts` | 271 | CRDT apply, state vector, security revert |
| `src/crypto.ts` | 179 | WebCrypto AES-GCM encryption |
| `src/crypto-pqc.ts` | 105 | ML-KEM-768, ML-DSA-65 primitives |
| `src/consensus.ts` | 114 | Governance proposals & voting |
| `src/cloud-sync.ts` | 159 | Supabase cloud persistence |
| `src/p2p-transport-adapter.ts` | 231 | Edge-mesh ITransport adapter |
| `src/types.ts` | 301 | Core domain types |
| `src/utils/logger.ts` | 14 | Peer-aware logger |

---

*Document generated 2026-07-31 by Hermes Agent.*
