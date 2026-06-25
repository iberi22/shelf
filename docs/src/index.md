# Shelf - SRC Index

**Version:** 2.1
**Project:** Shelf Inventory Management PWA
**Protocol:** GitCore 3.6.0
**Updated:** 2026-06-14

## SRC Documents

| Document | Description |
| --- | --- |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Functional requirements (FUN-*) aggregated |
| [NON-FUNCTIONAL.md](NON-FUNCTIONAL.md) | Non-functional requirements (PQC, P2P, CRDT, EDGE, PWA, QA) |
| [USER_STORIES.md](USER_STORIES.md) | User stories organized by role |

## Status Policy

`Implemented` means the current production/base feature is usable. `Partial` means code or primitives exist, but acceptance criteria or strategic roadmap items remain open. Open GitHub issues #87, #134, #135, #136, and #139 must not be documented as closed or 100% complete.

## Core Features (FUN)

| SRC ID | Document | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
| SRC-FUN-001 | [Inventory Management](features/SRC-FUN-001.md) | P0 | Implemented | 100% |
| SRC-FUN-002 | [Sales Tracking](features/SRC-FUN-002.md) | P0 | Implemented | 100% |
| SRC-FUN-003 | [Dashboard](features/SRC-FUN-003.md) | P0 | Implemented | 100% |
| SRC-FUN-004 | [Contact Management](features/SRC-FUN-004.md) | P0 | Implemented | 100% |
| SRC-FUN-005 | [Purchase Orders](features/SRC-FUN-005.md) | P1 | Implemented | 100% |
| SRC-FUN-006 | [Barcode/QR Scanner](features/SRC-FUN-006.md) | P1 | Implemented | 100% |
| SRC-FUN-007 | [AI Assistant](features/SRC-FUN-007.md) | P2 | Partial | 80% |
| SRC-FUN-008 | [Auth & Cloud Sync](features/SRC-FUN-008.md) | P0 | Partial | 65% |
| SRC-FUN-009 | [Monetization](features/SRC-FUN-009.md) | P0 | Partial | 75% |
| SRC-FUN-010 | [Multi-language Support](features/SRC-FUN-010.md) | P1 | Implemented | 100% |
| SRC-FUN-011 | [Settings & Data Mgmt](features/SRC-FUN-011.md) | P1 | Implemented | 95% |
| SRC-FUN-012 | [Reports & Analytics](features/SRC-FUN-012.md) | P1 | Implemented | 100% |
| SRC-FUN-013 | [Multi-user Access (Pyme)](features/SRC-FUN-013.md) | P2 | Partial | 70% |
| SRC-FUN-014 | [Data Import (CSV)](features/SRC-FUN-014.md) | P2 | Implemented | 100% |

## Non-Functional Features

| SRC ID | Document | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
| SRC-PQC-001 | [Post-Quantum Crypto](non-functional/SRC-PQC-001.md) | P0 | Implemented | 90% |
| SRC-P2P-001 | [P2P Mesh Network](non-functional/SRC-P2P-001.md) | P0 | Partial | 80% |
| SRC-CRDT-001 | [CRDT Sync (Yjs)](non-functional/SRC-CRDT-001.md) | P0 | Partial | 70% |
| SRC-EDGE-001 | [Edge Mesh Runtime](non-functional/SRC-EDGE-001.md) | P0 | Partial | 70% |
| SRC-PWA-001 | [PWA & Offline](non-functional/SRC-PWA-001.md) | P0 | Partial | 75% |
| SRC-QA-001 | [Testing Infrastructure](non-functional/SRC-QA-001.md) | P1 | Partial | 80% |

## Feature Summary

| Category | Count | Status |
| --- | ---: | --- |
| Functional (FUN) | 14 | Base app mostly implemented; AI, cloud sync, monetization deployment, and multi-user backend remain partial. |
| Post-Quantum Crypto (PQC) | 1 | Implemented for current P2P base; signed Edge Mesh capability hardening remains roadmap work. |
| P2P Mesh (P2P) | 1 | Partial because branch/warehouse, failover, and advanced multi-node validation remain open. |
| CRDT Sync (CRDT) | 1 | Partial because full Shelf migration to `createCrdtSyncLayer` and formal ack/retry remain open. |
| Edge Mesh Runtime (EDGE) | 1 | Partial because reusable primitives exist but app-level adoption is incomplete. |
| QA/Testing (QA) | 1 | Partial because advanced P2P E2E and manual verification have known blockers. |
| PWA/Offline (PWA) | 1 | Partial for the strategic #87 target; current offline base is functional. |
| **Total** | **20** | **Base product usable, strategic roadmap not 100% complete.** |

## Open Strategic Roadmap

| ID | Feature | Priority | Implementation |
| --- | --- | --- | ---: |
| #87 | 100% offline architecture and local AI | P0 | 25% |
| #134 | Branches and warehouses over P2P | P0 | 25% |
| #135 | Node history and host failover | P0 | 45% |
| #136 | Admin consensus and voting | P0 | 35% |
| #139 | Secure CRDT sync in `edge-mesh` | P0 | 70% |
| ROADMAP-001 | Error Monitoring (Sentry) | P1 | 0% |
| ROADMAP-002 | User Analytics (GA4) | P2 | 0% |
| ROADMAP-005 | Advanced Reporting Suite | P2 | 0% |
| ROADMAP-006 | E-commerce Integrations | P3 | 0% |

## Source of Truth

The generated feature definitions may still come from:

```text
.gitcore/features.json
```

Manual implementation status is tracked in `apps/shelf-inventory/FEATURES_STATUS.md`, `docs/session-2026-06-14-codex-changes.md`, `docs/src/NON-FUNCTIONAL.md`, and `packages/edge-mesh/README.md`.
