# SRC Configuration — Shelf Project

**Protocol:** GitCore 3.6.0
**Created:** 2026-06-11
**Updated:** 2026-06-11

## Structure

```
shelf/
├── .gitcore/
│   ├── features.json           ← Source of truth (19 features)
│   ├── ARCHITECTURE.md         ← Architecture decisions
│   ├── AGENT_INDEX.md          ← Agent routing
│   ├── SDLC_WORKFLOW.md        ← SDLC phases
│   ├── SRC_CONFIG.md           ← This file
│   ├── planning/
│   │   ├── PLANNING.md         ← Project planning
│   │   └── TASK.md             ← Task tracking
│   └── CORTEX_INTEGRATION.md   ← Cortex sync (optional)
└── docs/
    └── src/                    ← SRC documents
        ├── index.md            ← Index of all SRC docs
        ├── REQUIREMENTS.md     ← Functional requirements (aggregate)
        ├── NON-FUNCTIONAL.md   ← Non-functional requirements (aggregate)
        ├── USER_STORIES.md     ← User stories (aggregate)
        ├── features/           ← Per-feature SRC docs
        │   ├── SRC-FUN-001.md  ← Inventory Management
        │   ├── SRC-FUN-002.md  ← Sales Tracking
        │   ├── SRC-FUN-003.md  ← Dashboard
        │   ├── SRC-FUN-004.md  ← Contact Management
        │   ├── SRC-FUN-005.md  ← Purchase Orders
        │   ├── SRC-FUN-006.md  ← Barcode/QR Scanner
        │   ├── SRC-FUN-007.md  ← AI Assistant
        │   ├── SRC-FUN-008.md  ← Auth & Cloud Sync
        │   ├── SRC-FUN-009.md  ← Monetization
        │   ├── SRC-FUN-010.md  ← Multi-language Support
        │   ├── SRC-FUN-011.md  ← Settings & Data Management
        │   ├── SRC-FUN-012.md  ← Reports & Analytics
        │   ├── SRC-FUN-013.md  ← Multi-user Access (Pyme)
        │   └── SRC-FUN-014.md  ← Data Import (CSV)
        └── non-functional/     ← Per-feature non-functional SRC docs
            ├── SRC-PQC-001.md  ← Post-Quantum Cryptography
            ├── SRC-P2P-001.md  ← P2P Mesh Network
            ├── SRC-CRDT-001.md ← CRDT Sync (Yjs)
            ├── SRP-PWA-001.md  ← PWA & Offline Support
            └── SRC-QA-001.md   ← Testing Infrastructure
```

## Feature IDs Convention

```
SRC-[CATEGORIA]-[NÚMERO]

Categorías:
FUN  → Funcional (features core de negocio)
PQC  → Post-Quantum Crypto (seguridad)
P2P  → P2P Mesh (sincronización)
CRDT → CRDT Sync (consistencia de datos)
QA   → Testing/Quality (calidad)
PWA  → PWA/Offline (experiencia)
```

## Priority Levels

| Level | Description | Count |
|-------|-------------|-------|
| P0 | Core — must work for basic functionality | 11 |
| P1 | Important — high value, not blocking | 5 |
| P2 | Nice to have — enhancement | 3 |

## States

| Estado | Descripción |
|--------|-------------|
| draft | Borrador — en análisis |
| approved | Aprobado — listo para implementar |
| implemented | Implementado — código listo |
| validated | Validado — tests pasan, QA aprobado |

## Feature Count

| Category | Count | Status |
|----------|-------|--------|
| FUN (Funcional) | 14 | ✅ All implemented |
| PQC (Post-Quantum Crypto) | 1 | ✅ Implemented |
| P2P (P2P Mesh) | 1 | ✅ Implemented |
| CRDT (CRDT Sync) | 1 | ✅ Implemented |
| QA (Testing) | 1 | ✅ Implemented |
| PWA (PWA/Offline) | 1 | ✅ Implemented |
| **Total** | **19** | **✅ 100% implemented** |

## Feature → Doc Mapping

| SRC ID | Doc | Category |
|--------|-----|----------|
| SRC-FUN-001 | `features/SRC-FUN-001.md` | Functional |
| SRC-FUN-002 | `features/SRC-FUN-002.md` | Functional |
| SRC-FUN-003 | `features/SRC-FUN-003.md` | Functional |
| SRC-FUN-004 | `features/SRC-FUN-004.md` | Functional |
| SRC-FUN-005 | `features/SRC-FUN-005.md` | Functional |
| SRC-FUN-006 | `features/SRC-FUN-006.md` | Functional |
| SRC-FUN-007 | `features/SRC-FUN-007.md` | Functional |
| SRC-FUN-008 | `features/SRC-FUN-008.md` | Functional |
| SRC-FUN-009 | `features/SRC-FUN-009.md` | Functional |
| SRC-FUN-010 | `features/SRC-FUN-010.md` | Functional |
| SRC-FUN-011 | `features/SRC-FUN-011.md` | Functional |
| SRC-FUN-012 | `features/SRC-FUN-012.md` | Functional |
| SRC-FUN-013 | `features/SRC-FUN-013.md` | Functional |
| SRC-FUN-014 | `features/SRC-FUN-014.md` | Functional |
| SRC-PQC-001 | `non-functional/SRC-PQC-001.md` | Non-Functional |
| SRC-P2P-001 | `non-functional/SRC-P2P-001.md` | Non-Functional |
| SRC-CRDT-001 | `non-functional/SRC-CRDT-001.md` | Non-Functional |
| SRC-PWA-001 | `non-functional/SRC-PWA-001.md` | Non-Functional |
| SRC-QA-001 | `non-functional/SRC-QA-001.md` | Non-Functional |
