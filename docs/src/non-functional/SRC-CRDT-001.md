# SRC-CRDT-001: CRDT Sync (Yjs)

- **ID:** SRC-CRDT-001
- **Name:** CRDT Sync (Yjs)
- **Priority:** P0 (Core)
- **Status:** ⚠️ Partial
- **Implementation:** 84%
- **Category:** CRDT (Conflict-free Replicated Data Types)
- **SDLC:** Hardening
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

> **Audit 2026-07-17:** Remote entity ACL relajada (`isTrustedRemoteWriter`); surgical full-collection revert dead code; branch scoping en metadata, no maps por branch; path principal sigue siendo legacy `YJS_UPDATE`.

## Description

Shelf uses Yjs to synchronize local-first state with eventual consistency and automatic conflict resolution. The newest implementation routes Yjs updates through `@shelf/edge-mesh` namespaces so each workflow can replicate only its encoded CRDT deltas between browser peers.

## Primary Actor

Store operator working across multiple browsers or devices.

## Dependencies

- **SRC-P2P-001** (P2P Mesh Network): peer transport.
- **SRC-EDGE-001** (Edge Mesh Runtime): namespace registry, update broadcast, remote origin metadata.
- **SRC-PQC-001** (Post-Quantum Cryptography): secure transport and future signed updates.

## User Story

> Como usuario, quiero que los cambios se sincronicen entre dispositivos sin conflictos y sin depender de un servidor central.

## Acceptance Criteria

1. Yjs documents back shared workflow state.
2. Updates are encoded as deltas with `Y.encodeStateAsUpdate`.
3. Remote updates are applied with peer-aware origin metadata.
4. Remote-origin updates are not re-broadcast by the receiving node.
5. Shelf app state receives only authorized remote mutations.
6. Unauthorized remote mutations are reverted before they reach app state.
7. The sync path works offline-first and reconciles when peers reconnect.

## Open Work

This SRC remains partial under #139. Shelf still needs full migration to `createCrdtSyncLayer`, formal ack/retry behavior, broader capability enforcement, and 2/3-node E2E without manual rebroadcast helpers.

## Technical Stack

| Technology | Use |
| --- | --- |
| Yjs | CRDT implementation |
| `@shelf/edge-mesh` | Namespace transport and remote origin tracking |
| `edge-mesh-react` | React provider and collection hooks |
| Playwright | Cross-browser E2E sync verification |

## Technical Details

- **Namespace:** Shelf uses the `shelf` namespace for inventory workflow state.
- **Collections:** `products`, `sales`, `clients`, `suppliers`, `purchaseOrders`, `arqueoSessions`, `ocrResults`, `auditLogs`, and `teamMembers`.
- **Local origin:** `shelf-edge-workflow`.
- **Remote origin:** `{ type: 'remote', peerId }`.
- **Security revert origin:** `shelf-edge-security-revert`.
- **Conflict model:** Yjs resolves concurrent writes at the shared type level; Shelf then applies domain permissions before committing remote changes to app state.
- **Deletion handling:** deleted ids are collected from `Y.YMapEvent` and sent through `SYNC_ENTITIES`.

## Verification

```bash
pnpm --dir packages/edge-mesh test
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5187 pnpm --dir apps/shelf-inventory exec playwright test tests/edge-mesh-sync.spec.ts tests/security-sync.spec.ts tests/p2p-sync.spec.ts --project=chromium --reporter=list --config=playwright.config.ts --workers=1
```

## Related Commits

```text
feat: wire edge mesh into shelf workflow
test: add edge mesh e2e sync and security coverage
```
