# Shelf — SRC Index

**Versión:** 2.0
**Proyecto:** Shelf Inventory Management PWA
**Protocolo:** GitCore 3.6.0
**Updated:** 2026-06-11

## Documentos SRC (Aggregados)

| Document | Description |
|----------|-------------|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Functional requirements (FUN-*) aggregated |
| [NON-FUNCTIONAL.md](NON-FUNCTIONAL.md) | Non-functional requirements (PQC, P2P, CRDT, PWA, QA) |
| [USER_STORIES.md](USER_STORIES.md) | User stories organized by role |

## Per-Feature SRC Documents

### Core Features (FUN)
| SRC ID | Document | Priority | Status |
|--------|----------|----------|--------|
| SRC-FUN-001 | [Inventory Management](features/SRC-FUN-001.md) | P0 | ✅ |
| SRC-FUN-002 | [Sales Tracking](features/SRC-FUN-002.md) | P0 | ✅ |
| SRC-FUN-003 | [Dashboard](features/SRC-FUN-003.md) | P0 | ✅ |
| SRC-FUN-004 | [Contact Management](features/SRC-FUN-004.md) | P0 | ✅ |
| SRC-FUN-005 | [Purchase Orders](features/SRC-FUN-005.md) | P1 | ✅ |
| SRC-FUN-006 | [Barcode/QR Scanner](features/SRC-FUN-006.md) | P1 | ✅ |
| SRC-FUN-007 | [AI Assistant](features/SRC-FUN-007.md) | P2 | ✅ |
| SRC-FUN-008 | [Auth & Cloud Sync](features/SRC-FUN-008.md) | P0 | ✅ |
| SRC-FUN-009 | [Monetization](features/SRC-FUN-009.md) | P0 | ✅ |
| SRC-FUN-010 | [Multi-language Support](features/SRC-FUN-010.md) | P1 | ✅ |
| SRC-FUN-011 | [Settings & Data Mgmt](features/SRC-FUN-011.md) | P1 | ✅ |
| SRC-FUN-012 | [Reports & Analytics](features/SRC-FUN-012.md) | P1 | ✅ |
| SRC-FUN-013 | [Multi-user Access (Pyme)](features/SRC-FUN-013.md) | P2 | ✅ |
| SRC-FUN-014 | [Data Import (CSV)](features/SRC-FUN-014.md) | P2 | ✅ |

### Non-Functional Features
| SRC ID | Document | Priority | Status |
|--------|----------|----------|--------|
| SRC-PQC-001 | [Post-Quantum Crypto](non-functional/SRC-PQC-001.md) | P0 | ✅ |
| SRC-P2P-001 | [P2P Mesh Network](non-functional/SRC-P2P-001.md) | P0 | ✅ |
| SRC-CRDT-001 | [CRDT Sync (Yjs)](non-functional/SRC-CRDT-001.md) | P0 | ✅ |
| SRC-PWA-001 | [PWA & Offline](non-functional/SRC-PWA-001.md) | P0 | ✅ |
| SRC-QA-001 | [Testing Infrastructure](non-functional/SRC-QA-001.md) | P1 | ✅ |

## Feature Summary

| Category | Count | Status |
|----------|-------|--------|
| Funcionales (FUN) | 14 | ✅ All implemented |
| Post-Quantum Crypto (PQC) | 1 | ✅ Implemented |
| P2P Mesh (P2P) | 1 | ✅ Implemented |
| CRDT Sync (CRDT) | 1 | ✅ Implemented |
| QA/Testing (QA) | 1 | ✅ Implemented |
| PWA/Offline (PWA) | 1 | ✅ Implemented |
| **Total** | **19** | **✅ 100% implemented** |

## Future Roadmap

| ID | Feature | Priority |
|----|---------|----------|
| ROADMAP-001 | Error Monitoring (Sentry) | P1 |
| ROADMAP-002 | User Analytics (GA4) | P2 |
| ROADMAP-003 | Full Cloud Sync (Pro) | P1 |
| ROADMAP-004 | Multi-user Backend Logic | P2 |
| ROADMAP-005 | Advanced Reporting Suite | P2 |
| ROADMAP-006 | E-commerce Integrations | P3 |

## Source of Truth
The authoritative source for all feature definitions is:
```
.gitcore/features.json
```
All SRC documents in `docs/src/` are derived from `features.json`.
