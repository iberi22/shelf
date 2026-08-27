# ADR-002 — Maloca Bridge Extraction & Edge Mesh Hardening

**Status:** Accepted
**Date:** 2026-08-26
**SRC:** SRC-EDGE-001

## Context

Originally, domain-specific adapters (Maloca Salud, Maloca Veeduría, Maloca Xavier) were prototyped alongside the generic P2P runtime in `packages/edge-mesh`. Additionally, signed envelope verification (`requireSignedEnvelopes`) was optional on the Edge Mesh path. To achieve full modularity (100% completion of `SRC-EDGE-001`), domain adapters need to be separated into `@shelf/maloca-bridge` and security controls must be hardened.

## Decision

1. **Maloca Bridge Separation (`@shelf/maloca-bridge`)**:
   - All domain adapters (`maloca-salud`, `maloca-veeduria`, `maloca-xavier`) and their corresponding test suites reside in `@shelf/maloca-bridge`.
   - `packages/edge-mesh` remains a pure, transport-agnostic, domain-free P2P runtime providing CRDT syncing (Yjs), namespace management, identity, and authorization primitives.
   - Core runtime infrastructure inside `edge-mesh` (e.g., `EvidentiaManager`, `ProfileManager`, `Kernel`) provides generic primitives consumed by higher-level adapters.

2. **Mandatory Signed Envelopes**:
   - `requireSignedEnvelopes` defaults to `true` across `SyncEngine` and `EdgeMeshConfig`.
   - Incoming CRDT operations must carry a valid ML-DSA-65 signature. Unsigned operations after the grace period are hard-rejected.

## Consequences

- Clear separation of concerns: `@shelf/edge-mesh` is domain-independent; `@shelf/maloca-bridge` contains domain-specific adapters.
- Security posture is hardened by default with required envelope signatures.
- `SRC-EDGE-001` reaches 100% completion with zero residual gaps.
