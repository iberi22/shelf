# Shelf Architecture & Technical Specification

**Protocol Version:** 3.8.0
**Release Version:** v0.0.1
**Last Updated:** 2026-08-26

---

## 1. System Overview & Core Principles

**Shelf** is a decentralized, offline-first inventory management and Point of Sale (POS) system engineered to function reliably without internet dependencies. Core architectural principles include:

1. **Offline-First Storage:** Local devices are the primary source of truth. All transactional state (products, sales, contacts, purchase orders, audit logs) is stored locally in `localStorage` and `IndexedDB`.
2. **Peer-to-Peer (P2P) Synchronization:** Data is replicated across local network peers via WebRTC data channels using PeerJS and Yjs CRDTs (Conflict-Free Replicated Data Types), eliminating the mandatory single point of failure of a centralized database.
3. **Post-Quantum Cryptography (PQC):** Peer handshakes, session encryption, and local vault key derivations use NIST-standardized algorithms (**ML-KEM-768** for key exchange, **ML-DSA-65** for digital signatures, and ML-KEM-based KDF).
4. **Edge Mesh Security & Self-Healing:** The `@shelf/edge-mesh` runtime tracks remote write origins (`{ type: 'remote', peerId }`) and surgically reverts unauthorized mutations on Yjs maps.
5. **Edge GPU Compute:** Heavy numeric operations (vector operations, dot products, matrix scaling) utilize local WebGPU kernels with CPU fallback routines via `@shelf/gpu-agent`.

---

## 2. Layered Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                             │
│  React 19 UI  │  Context API (AppState, Auth, Theme)  │  Local Storage  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                         Edge Mesh Runtime Layer                         │
│  @shelf/edge-mesh         │  @shelf/edge-mesh-react  │  @shelf/gpu-agent   │
│  - Yjs Namespaces         - React Provider & Hooks   - WGSL Shaders     │
│  - Transport Adapters     - State Sync Hooks         - Task Router      │
│  - Security Guard Revert  - Active Peer State      - Mesh Marketplace │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                          Core P2P Mesh Engine                           │
│  @shelf/p2p-mesh-core                                                   │
│  - WebRTC Transport Binder (PeerJS)                                     │
│  - Yjs Document Sync (encodeStateAsUpdate / applyUpdate)                │
│  - Admin Coordination & PeerPermissions Matrix                           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                       Post-Quantum Security Layer                       │
│  - ML-KEM-768 (Shared Secret Encapsulation)                             │
│  - ML-DSA-65 (Envelope & Identity Signatures)                           │
│  - AES-256-GCM (Authenticated Payload Encryption)                       │
│  - PQC KDF (100-Iteration ML-KEM Vault Derivation)                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow Diagrams

### 3.1 Local State Mutation & Peer Synchronization

```
User Action (e.g. Add Product / Sale)
                │
                ▼
      Context Reducer Action
                │
                ├─────────────────────────────────────────┐
                ▼                                         ▼
    Update React App State                       Yjs Y.Doc Map Set
        & localStorage                         (Origin: local-shelf)
                                                          │
                                                          ▼
                                                Yjs 'update' Observer
                                                          │
                                                          ▼
                                             Encode Delta (Uint8Array)
                                                          │
                                                          ▼
                                             Sign & Encrypt Envelope
                                              (ML-DSA-65 + AES-GCM)
                                                          │
                                                          ▼
                                             Broadcast via PeerJS WebRTC
                                                          │
                                                          ▼
                                             Remote Peers Receive Payload
```

### 3.2 Remote Mutation Authorization & Surgical Revert

```
Remote Update Received via WebRTC Data Channel
                      │
                      ▼
        Decrypt & Verify Envelope Signature
             (ML-DSA-65 Signature Check)
                      │
            ┌─────────┴─────────┐
            │                   │
         [ Valid ]          [ Invalid ] ────► Log Security Error & Drop
            │
            ▼
   Apply Update to Local Yjs Document
 (Origin: { type: 'remote', peerId })
                      │
                      ▼
   EdgeMesh Security Guard Observer Triggered
                      │
                      ▼
    Check peerId Permissions vs Entity Type
                      │
            ┌─────────┴─────────┐
            │                   │
      [ Authorized ]     [ Unauthorized ]
            │                   │
            ▼                   ▼
    Dispatch SYNC     Surgically Revert Yjs Mutation
   Action to App      (Origin: shelf-security-revert)
      Reducer                   │
                                ▼
                       Log Audit Entry to IDB
```

---

## 4. Package Overview

### 4.1 `@shelf/edge-mesh`
The reusable core P2P browser runtime. Provides event-driven node lifecycle, Yjs namespace management, memory and PeerJS transport implementations, offline queue management, presence checking, and authorization guards.

**Key Exports:**
- `EdgeMeshNode`, `createEdgeMeshNode`
- `EdgeMesh`, `YjsAdapter`
- `NamespaceAuthorizer`, `NamespaceManager`
- `PeerJSTransport`, `MemoryTransport`
- `signEnvelope`, `verifyEnvelopeSignature`, `validateEnvelope`

### 4.2 `@shelf/p2p-mesh-core`
The application-specific P2P synchronization engine for Shelf. Manages team membership, admin election, Post-Quantum key exchanges, and CRDT database state sync.

**Key Exports:**
- `P2PManager`, `P2PTransportAdapter`
- `generatePQCKeypair`, `pqcKEMEncapsulate`, `pqcKEMDecapsulate`
- `derivePqcVaultKey`, `migratePbkdf2ToPqc`
- `applyUpdateWithSecurityGuard`

### 4.3 `@shelf/gpu-agent`
Provides edge numeric computation kernels accelerated by WebGPU WGSL compute shaders, with automated CPU fallback and peer compute task routing.

**Key Exports:**
- `GpuAgent`, `isWebGpuSupported`
- `GpuMeshMarketplaceFull`, `PeerDiscovery`, `TaskRouter`, `ResultAggregator`
- Kernels: `vector-sum`, `dot-product`, `matrix-scale`

---

## 5. API Documentation

### 5.1 Post-Quantum Key Derivation (`@shelf/p2p-mesh-core/crypto-kdf`)

#### `derivePqcVaultKey(password: string, salt: Uint8Array, iterations?: number): Promise<CryptoKey>`
Derives an AES-GCM key from a user password using ML-KEM-768 iterations.

- **Parameters:**
  - `password`: User master password string.
  - `salt`: 16-byte cryptographically secure salt.
  - `iterations` (optional): Number of ML-KEM encapsulation rounds (default: `100`).
- **Returns:** Promise resolving to a Web Crypto `CryptoKey` (AES-GCM 256-bit).

```ts
import { derivePqcVaultKey } from '@shelf/p2p-mesh-core';

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await derivePqcVaultKey('user-master-password', salt);
```

#### `migratePbkdf2ToPqc(legacyVaultData: EncryptedVault, password: string): Promise<EncryptedVault>`
Migrates a legacy PBKDF2-derived encrypted vault to a PQC ML-KEM derived vault.

- **Returns:** Promise resolving to updated vault object containing PQC metadata.

---

### 5.2 Edge Compute GPU Agent (`@shelf/gpu-agent`)

#### `GpuAgent` Class
Manages execution of numerical workloads on WebGPU hardware or CPU fallback.

##### `getInstance(config?: GpuAgentConfig): Promise<GpuAgent>`
Returns or initializes the singleton `GpuAgent` instance.

##### `executeTask<TInput, TResult>(task: Task<TInput>): Promise<TaskResult<TResult>>`
Executes a computational task.

- **Task Types:** `'vector-sum'`, `'dot-product'`, `'matrix-scale'`, `'echo'`
- **Example:**

```ts
import { GpuAgent } from '@shelf/gpu-agent';

const agent = await GpuAgent.getInstance();
const result = await agent.executeTask({
  id: crypto.randomUUID(),
  type: 'dot-product',
  payload: {
    vecA: [1, 2, 3, 4],
    vecB: [5, 6, 7, 8],
  },
});

console.log('Dot Product Result:', result.data); // 70
```

---

### 5.3 PDF Export Suite (`apps/shelf-inventory/lib/pdfExport`)

#### `exportInventoryValuationPDF(products: Product[], currencySymbol: string): void`
Generates and initiates browser download of a PDF containing total inventory valuation breakdown, stock counts, cost values, and total net assets.

#### `exportLowStockPDF(products: Product[], threshold: number): void`
Generates a PDF report filtering products at or below the specified stock threshold.

#### `exportSalesReportPDF(sales: Sale[], dateRange?: { start: string; end: string }): void`
Generates a detailed sales log report including item breakdown, revenue, cost, and net profit totals.

```ts
import { exportInventoryValuationPDF } from './lib/pdfExport';

exportInventoryValuationPDF(currentProducts, '$');
```

---

### 5.4 E-Commerce Webhooks & Endpoints (`apps/shelf-inventory/lib/webhookHandlers`)

#### `verifyWebhookHMAC(rawBody: string, signature: string, secret: string): Promise<boolean>`
Performs constant-time HMAC SHA-256 verification of incoming webhook payloads.

#### `processShopifyProductUpdate(payload: ShopifyProductPayload): InventoryDelta`
Parses Shopify inventory sync event into standardized CRDT delta updates.

#### `processWooCommerceOrderCreated(payload: WooCommerceOrderPayload): InventoryDelta`
Parses WooCommerce purchase webhook into inventory stock reduction operations.

---

### 5.5 Edge API Routes Reference

| Endpoint | Method | Auth / Headers | Description |
|---|---|---|---|
| `/api/ai/chat` | `POST` | Optional Token, Rate-Limited (50KB max) | Proxies natural language queries to DeepSeek v4 Flash via OpenRouter. |
| `/api/webhooks/shopify` | `POST` | `X-Shopify-Hmac-SHA256` | Handles Shopify product & order webhook payloads. |
| `/api/webhooks/woocommerce` | `POST` | `X-WC-Webhook-Signature` | Handles WooCommerce inventory change webhooks. |

---

## 6. Verification & Compliance Matrix

| Subsystem | Test Suite Path | Verification Command |
|---|---|---|
| P2P Core & PQC | `packages/p2p-mesh-core/tests/*` | `pnpm --filter p2p-mesh-core test` |
| Edge Mesh Runtime | `packages/edge-mesh/tests/*` | `pnpm --filter edge-mesh test` |
| GPU Compute & Marketplace | `packages/gpu-agent/tests/*` | `pnpm --filter gpu-agent test` |
| App E2E & Flow Verification | `apps/shelf-inventory/tests/*` | `pnpm --filter shelf-inventory test:e2e` |
