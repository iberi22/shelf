# Shelf - Non-Functional Requirements

Last updated: 2026-06-14

## Status Summary

| SRC ID | Requirement | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
| SRC-PQC-001 | Post-Quantum Cryptography | P0 | Implemented | 90% |
| SRC-P2P-001 | P2P Mesh Network | P0 | Partial | 80% |
| SRC-CRDT-001 | CRDT Sync (Yjs) | P0 | Partial | 70% |
| SRC-EDGE-001 | Edge Mesh Runtime | P0 | Partial | 70% |
| SRC-PWA-001 | PWA & Offline Support | P0 | Partial | 75% |
| SRC-QA-001 | Testing Infrastructure | P1 | Partial | 80% |
| SRC-SEC-001 | Firebase Security Rules | P0 | Partial | 75% |
| SRC-SEC-002 | Environment Security | P1 | Partial | 75% |

## SRC-PQC-001: Post-Quantum Cryptography

**Priority:** P0 | **Status:** Implemented | **Implementation:** 90%

**Technical Stack:** `@noble/post-quantum` (ML-KEM-768, ML-DSA-65), AES-GCM, `p2p-mesh-core`

**Acceptance Criteria:**

1. Key exchange with ML-KEM-768.
2. Digital signatures with ML-DSA-65.
3. AES-GCM encryption at rest with secure key derivation.
4. Encryption in transit over WebRTC.
5. Integration with `p2p-mesh-core`.

**Open Work:** Signed Edge Mesh capability envelopes and broader app-level authorization hardening remain part of #139.

## SRC-P2P-001: P2P Mesh Network

**Priority:** P0 | **Status:** Partial | **Implementation:** 80%

**Technical Stack:** PeerJS, WebRTC, `p2p-mesh-core`, `@shelf/edge-mesh`

**Acceptance Criteria:**

1. Peer discovery via WebRTC.
2. Decentralized mesh topology.
3. Admin/master node coordination and permissions.
4. Automatic reconnection after connection loss.
5. Local PeerJS support for `localhost`, `127.0.0.1`, and `::1`.
6. Edge Mesh integration for CRDT update propagation.

**Open Work:** Branch/warehouse partitioning (#134), persistent node history/failover (#135), admin consensus (#136), and advanced multi-node E2E remain open.

## SRC-CRDT-001: CRDT Sync (Yjs)

**Priority:** P0 | **Status:** Partial | **Implementation:** 70%

**Technical Stack:** Yjs, `@shelf/edge-mesh`, Playwright

**Acceptance Criteria:**

1. Yjs shared data integration.
2. Eventual consistency and conflict resolution.
3. Efficient delta update synchronization.
4. Independent namespaces per workflow.
5. Remote origins with `peerId` for app-state authorization.

**Open Work:** Complete Shelf migration to `createCrdtSyncLayer`, formal ack/retry, capability enforcement, and 2/3-node E2E without manual rebroadcast helpers remain open under #139.

## SRC-EDGE-001: Edge Mesh Runtime

**Priority:** P0 | **Status:** Partial | **Implementation:** 70%

**Technical Stack:** `@shelf/edge-mesh`, `edge-mesh-react`, Yjs, PeerJS/WebRTC, WebGPU extension point

**Acceptance Criteria:**

1. Reusable package for nodes, transport, storage, protocol, presence, authorization, and CRDT namespaces.
2. `EdgeMesh#getNamespace(name)` for Yjs documents by workflow.
3. Remote origin `{ type: 'remote', peerId }` for incoming updates.
4. Loop prevention for remote updates.
5. Shelf bridge for product, sales, contacts, purchase orders, sessions, OCR results, audit logs, and team members.
6. Rejection/reversion of unauthorized remote mutations.
7. Localhost-only deterministic E2E harness.
8. WebGPU extension point for future local agents.

**Open Work:** The reusable primitives exist, but app-level adoption is incomplete. Shelf still needs deeper migration to the library-first sync layer before this can be considered complete.

## SRC-PWA-001: PWA & Offline Support

**Priority:** P0 | **Status:** Partial | **Implementation:** 75%

**Technical Stack:** `vite-plugin-pwa`, Workbox, local storage, IndexedDB roadmap

**Acceptance Criteria:**

1. Installable Progressive Web App.
2. Works without internet for base workflows.
3. Service worker configured for offline caching.
4. Local persistence of operational state.
5. Synchronization when P2P connectivity returns.

**Open Work:** The base offline app works, but #87 requires a broader 100% local-only architecture with local OCR, local AI, local-only profile/auth, and cloud dependency reduction.

## SRC-QA-001: Testing Infrastructure

**Priority:** P1 | **Status:** Partial | **Implementation:** 80%

**Technical Stack:** Playwright, Vitest, Biome, GitHub Actions, Vercel

**Acceptance Criteria:**

1. Unit tests for `@shelf/edge-mesh`.
2. E2E tests for Edge Mesh sync between browsers.
3. E2E tests for unauthorized remote mutation rejection.
4. E2E tests for local security and existing P2P compatibility.
5. Biome lint/format configuration.
6. CI/CD with GitHub Actions and Vercel.

**Open Work:** `p2p-sync-advanced.spec.ts` is blocked by overlay helper behavior, manual browser verification is blocked by the landing translation bug, and Dependabot vulnerabilities must be audited before a broad release.

## SRC-SEC-001: Firebase Security Rules

**Priority:** P0 | **Status:** Partial | **Implementation:** 75%

**Acceptance Criteria:**

1. Firestore rules published and configured.
2. Data segregation by user.
3. Cloud Functions secrets configured.

**Open Work:** Firebase/cloud dependencies should be re-evaluated against #87 before expanding this as the long-term architecture.

## SRC-SEC-002: Environment Security

**Priority:** P1 | **Status:** Partial | **Implementation:** 75%

**Acceptance Criteria:**

1. IDs and secrets stored in environment variables.
2. `.env.example` documents required values.
3. Production and development secrets are separated.
4. Stripe webhook secret is verified in production.

**Open Work:** Production environment verification and Dependabot vulnerability audit remain required.
