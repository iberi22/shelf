# Shelf - SRC Index

**Version:** 2.2  
**Project:** Shelf Inventory Management PWA  
**Protocol:** GitCore 3.6.0  
**Updated:** 2026-07-17  

**SSOT:** `.gitcore/features.json` + `.gitcore/features-details.json`  
**Project average:** **~91%** (21 implemented / 0 partial / 0 skeleton)

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
| SRC-FUN-003 | [Dashboard](features/SRC-FUN-003.md) | P0 | Implemented | 92% |
| SRC-FUN-004 | [Contact Management](features/SRC-FUN-004.md) | P0 | Implemented | 98% |
| SRC-FUN-005 | [Purchase Orders](features/SRC-FUN-005.md) | P1 | Implemented | 94% |
| SRC-FUN-006 | [Barcode/QR Scanner](features/SRC-FUN-006.md) | P1 | Implemented | 90% |
| SRC-FUN-007 | [AI Assistant](features/SRC-FUN-007.md) | P2 | Implemented | 86% |
| SRC-FUN-008 | [Auth (Local)](features/SRC-FUN-008.md) | P0 | Implemented | 88% |
| SRC-FUN-009 | [Monetization](features/SRC-FUN-009.md) | P0 | Implemented | 90% |
| SRC-FUN-010 | [Multi-language Support](features/SRC-FUN-010.md) | P1 | Implemented | 90% |
| SRC-FUN-011 | [Settings & Data Management](features/SRC-FUN-011.md) | P1 | Implemented | 93% |
| SRC-FUN-012 | [Reports & Analytics](features/SRC-FUN-012.md) | P1 | Implemented | 92% |
| SRC-FUN-013 | [Multi-user (P2P)](features/SRC-FUN-013.md) | P2 | Implemented | 90% |
| SRC-FUN-014 | [Data Import](features/SRC-FUN-014.md) | P2 | Implemented | 94% |


## Non-Functional

| SRC ID | Document | Priority | Status | Implementation |
| --- | --- | --- | --- | ---: |
| SRC-PQC-001 | [Post-Quantum Cryptography](non-functional/SRC-PQC-001.md) | P0 | Implemented | 90% |
| SRC-P2P-001 | [P2P Mesh Network](non-functional/SRC-P2P-001.md) | P0 | Implemented | 90% |
| SRC-CRDT-001 | [CRDT Sync](non-functional/SRC-CRDT-001.md) | P0 | Implemented | 95% |
| SRC-EDGE-001 | [Edge Mesh Runtime](non-functional/SRC-EDGE-001.md) | P0 | Implemented | 88% |
| SRC-GPU-001 | [GPU Agent](non-functional/SRC-GPU-001.md) | P1 | Implemented | 88% |
| SRC-QA-001 | [Testing Infrastructure](non-functional/SRC-QA-001.md) | P1 | Implemented | 87% |
| SRC-PWA-001 | [PWA & Offline Support](non-functional/SRC-PWA-001.md) | P0 | Implemented | 90% |


## Feature Summary

| Bucket | Count |
|--------|------:|
| Implemented | 12 |
| Partial | 8 |
| Skeleton | 1 |
| **Average** | **~79%** |
