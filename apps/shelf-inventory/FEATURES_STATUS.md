# Features Implementation Status

This document tracks the current state, implementation percentage, and observed anomalies of Shelf features.

Last updated: 2026-06-14

## Summary

The base product is usable and deployed, but the strategic P2P/CRDT, local-only AI, branch/warehouse, governance, and failover work is not complete. Do not treat this app as 100% implemented across the full roadmap while issues #87, #134, #135, #136, and #139 remain open.

## Feature Status

| Feature | Status | Implementation | Notes |
| --- | --- | ---: | --- |
| Dashboard | Complete | 100% | Revenue, profit, sales, and product metrics are implemented. |
| Inventory Management | Complete | 100% | CRUD works; recent configurable inventory UX work is tracked separately because local edits are not committed yet. |
| Inventory Configuration UX | Partial | 85% | Product fields, variants, validation, and Settings UX have local uncommitted edits and adjusted tests. Validate before counting as deployed. |
| Sales Management | Complete | 100% | Sales recording decrements stock. |
| Client Management | Complete | 100% | Client CRUD is functional. |
| Supplier Management | Complete | 100% | Supplier CRUD is functional. |
| Offline First Base | Complete | 100% | Local persistence works for the current app state. |
| 100% Offline / Local AI Pivot (#87) | Partial | 25% | Local-first/P2P base exists, but local OCR, WebLLM/StockBot, local-only profile/auth, and cloud dependency reduction remain open. |
| Responsive Design | Complete | 95% | Main responsive flows are improved; keep validating Settings, logs, P2P panels, and modals on mobile. |
| Firebase Auth | Partial | 80% | UI/configuration exist; this conflicts with the longer-term local-only pivot in #87. |
| Cloud Sync | Partial | 50% | Basic logic exists; full Firestore sync is not the strategic target if #87 proceeds. |
| Settings Module | Complete | 95% | Base settings are functional; inventory configuration edits are local and need validation/commit. |
| Barcode/QR Scanner | Complete | 100% | Operational using `html5-qrcode`. |
| AI Assistant (Chat) | Partial | 80% | UI exists. Cloud-backed Gemini remains dependent on backend deployment; local AI is not complete. |
| Reporting & Charts | Complete | 100% | Base reports, filters, and charting work. Consolidated branch reports are pending under #134. |
| Purchase Orders | Complete | 100% | PO flow is functional. |
| Data Import (CSV) | Complete | 100% | CSV parsing and import flow are implemented. |
| P2P Sync Base | Partial | 80% | Production P2P/CRDT sync was hardened with state vectors, diffs, peer health, and force sync. Advanced tests still need cleanup. |
| CRDT Secure Edge Mesh (#139) | Partial | 70% | `edge-mesh` has `createCrdtSyncLayer`, op-log, snapshots, authz, health, state vectors, and diffs. Missing full Shelf migration, formal ack/retry, and 2/3-node E2E without manual rebroadcast helpers. |
| Branches/Warehouses P2P (#134) | Partial | 25% | Generic namespaces/partitions exist in `edge-mesh`; Shelf UI, active context, permissions, and consolidated reports are pending. |
| Node Timeline / Failover (#135) | Partial | 45% | Presence timeline and peer health exist; persistent history, UI timeline, and governance-backed succession remain pending. |
| Admin Consensus (#136) | Partial | 35% | `createGovernanceManager` exists and is tested; Shelf UI, convergent voting state, and authority metadata application are pending. |
| Stripe Checkout | Partial | 75% | Webhook and SDK code are ready; requires environment variables and backend deployment verification. |
| Arqueo (OCR Invoices) | Partial | 80% | Frontend modals and routing exist; current OCR path depends on cloud Gemini. Local OCR remains part of #87. |
| QA / Deployment | Partial | 80% | Main lint/build/E2E/deploy passed in the 2026-06-14 session; advanced P2P E2E and manual browser verification still have known blockers. |

## Open Strategic Issues

| Issue | Area | Implementation | Remaining Work |
| --- | --- | ---: | --- |
| #87 | 100% offline architecture and local AI | 25% | Split into local OCR, WebLLM/StockBot, local-only profile/auth, and removal/degradation of cloud dependencies. |
| #134 | Branches and warehouses over P2P | 25% | Sidebar selector, Settings CRUD, `activeBranch/warehouse`, permissions by context, and consolidated reports. |
| #135 | Node history and host failover | 45% | Persist timeline, show historical UI, and connect successor proposal to governance/authority metadata. |
| #136 | Admin consensus | 35% | Candidate/vote UI, vote synchronization, audit trail, and safe authority metadata update. |
| #139 | Secure CRDT sync in `edge-mesh` | 70% | Complete Shelf migration to `createCrdtSyncLayer`, ack/retry, capability enforcement, and multi-node E2E. |

## Required Adjustments

1. Fix `LandingPage` so `t(...)` can safely return either a string or an array.
2. Fix `addOverlayBlocker` so E2E helpers do not remove functional modals.
3. Complete #139 by migrating Shelf more deeply to the new `edge-mesh` sync layer.
4. Add 2-node and 3-node E2E coverage without manual rebroadcast helpers.
5. Implement #134 branch/warehouse UX and data isolation.
6. Implement #135 persistent node timeline and governance-backed failover.
7. Implement #136 admin candidacy, voting, and authority update flow.
8. Split #87 into smaller implementation tasks for local OCR, local AI, local profile/auth, and cloud dependency reduction.
9. Audit Dependabot vulnerabilities before a broad public release.
10. Validate current uncommitted local changes before documenting them as deployed.

## Known Risks

- `apps/shelf-inventory/tests/p2p-sync-advanced.spec.ts` is blocked by legacy test helper behavior around overlays/modals.
- Manual in-app browser verification can hit `LandingPage: t(...).map is not a function` unless test storage flags bypass the landing flow.
- GitHub reported existing Dependabot vulnerabilities during the push flow: 47 total, including 23 high.
- Local uncommitted edits exist in inventory configuration UI/tests and are not part of the last documented production deployment.
