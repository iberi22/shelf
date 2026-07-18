# ADR-001 — GPU Agent scope (Phase F)

**Status:** Accepted  
**Date:** 2026-07-17  
**SRC:** SRC-GPU-001

## Context

`gpu-agent` was a skeleton (`executeTask` mock). Product marketing implied WebGPU “agents” for Shelf. Real generative AI on-device is already handled by **WebLLM** in the app (`useWebLLM`), not by this package.

## Decision

1. **GpuAgent = typed edge compute kernels** (vector-sum, dot-product, matrix-scale, echo) with:
   - **WebGPU** path when `navigator.gpu` is available
   - **CPU fallback** always (Node + browsers without WebGPU)
2. **Optional EdgeMesh** for capacity announcements (`offerWorkerCapacity`)
3. **Remote tasks** require `signature` + optional `verifyTask` hook (not open mesh execution)
4. **WebLLM remains out of scope** for this package (app-owned)

## Consequences

- SRC-GPU-001 can reach **implemented ~90%** without claiming full mesh GPU marketplace.
- Residual gaps: multi-node task routing, ML-DSA signature verify built-in, advanced shaders.
- Acceptance criteria rephrased to “local edge kernels + optional mesh capacity”, not “general AI agents”.
