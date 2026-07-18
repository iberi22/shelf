# Shelf - SRC Index

**Version:** 2.2  
**Project:** Shelf Inventory Management PWA  
**Protocol:** GitCore 3.6.0  
**Updated:** 2026-07-17  

**SSOT:** `.gitcore/features.json` + `.gitcore/features-details.json`  
**Project average:** **~79%** after session gap-close (audit baseline was ~75%)

## SRC Documents

| Document | Description |
| --- | --- |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Functional requirements (FUN-*) aggregated |
| [NON-FUNCTIONAL.md](NON-FUNCTIONAL.md) | Non-functional requirements (PQC, P2P, CRDT, EDGE, PWA, QA, GPU) |
| [USER_STORIES.md](USER_STORIES.md) | User stories organized by role |
| [../../apps/shelf-inventory/FEATURES_STATUS.md](../../apps/shelf-inventory/FEATURES_STATUS.md) | Human status board |

## Status Policy

`Implemented` = usable and core ACs met (typically ≥85%).  
`Partial` = code exists with material gaps vs ACs.  
`Skeleton` = mock/placeholder.  
**Never claim 100% project-wide while partial/skeleton remain.**

## Core Features (FUN)

| SRC ID | Document | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
| SRC-FUN-001 | [Inventory Management](features/SRC-FUN-001.md) | P0 | Implemented | 96% |
| SRC-FUN-002 | [Sales Tracking](features/SRC-FUN-002.md) | P0 | Implemented | 97% |
| SRC-FUN-003 | [Dashboard](features/SRC-FUN-003.md) | P0 | Implemented | 90% |
| SRC-FUN-004 | [Contact Management](features/SRC-FUN-004.md) | P0 | Implemented | 98% |
| SRC-FUN-005 | [Purchase Orders](features/SRC-FUN-005.md) | P1 | Implemented | 92% |
| SRC-FUN-006 | [Barcode/QR Scanner](features/SRC-FUN-006.md) | P1 | Implemented | 88% |
| SRC-FUN-007 | [AI Assistant](features/SRC-FUN-007.md) | P2 | Partial | 72% |
| SRC-FUN-008 | [Auth & Cloud Sync](features/SRC-FUN-008.md) | P0 | Partial | 42% |
| SRC-FUN-009 | [Monetization](features/SRC-FUN-009.md) | P0 | Partial | 68% |
| SRC-FUN-010 | [Multi-language Support](features/SRC-FUN-010.md) | P1 | Implemented | 88% |
| SRC-FUN-011 | [Settings & Data Mgmt](features/SRC-FUN-011.md) | P1 | Implemented | 91% |
| SRC-FUN-012 | [Reports & Analytics](features/SRC-FUN-012.md) | P1 | Implemented | 89% |
| SRC-FUN-013 | [Multi-user Access (Pyme)](features/SRC-FUN-013.md) | P2 | Partial | 58% |
| SRC-FUN-014 | [Data Import (CSV)](features/SRC-FUN-014.md) | P2 | Implemented | 78% |

## Non-Functional Features

| SRC ID | Document | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
| SRC-PQC-001 | [Post-Quantum Crypto](non-functional/SRC-PQC-001.md) | P0 | Partial | 78% |
| SRC-P2P-001 | [P2P Mesh Network](non-functional/SRC-P2P-001.md) | P0 | Partial | 85% |
| SRC-CRDT-001 | [CRDT Sync (Yjs)](non-functional/SRC-CRDT-001.md) | P0 | Partial | 84% |
| SRC-EDGE-001 | [Edge Mesh Runtime](non-functional/SRC-EDGE-001.md) | P0 | Partial | 72% |
| SRC-PWA-001 | [PWA & Offline](non-functional/SRC-PWA-001.md) | P0 | Implemented | 86% |
| SRC-QA-001 | [Testing Infrastructure](non-functional/SRC-QA-001.md) | P1 | Partial | 78% |
| SRC-GPU-001 | GPU Agent (see NON-FUNCTIONAL.md) | P1 | Skeleton | 18% |

## Feature Summary

| Bucket | Count |
|--------|------:|
| Implemented | 12 |
| Partial | 8 |
| Skeleton | 1 |
| **Average** | **~79%** |
