# ADR-001 — GPU Agent scope (Phase F & Phase J)

**Status:** Accepted  
**Date:** 2026-07-17 (Updated 2026-07-18)
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

## Implementation Details (Phase J)

1. **WGSL Shaders:** Added actual WGSL compute shaders for parallel reduction (`vector-sum`, `dot-product`) and vector element mapping (`matrix-scale`) to execute tasks directly on the GPU using WebGPU when available.
2. **Testing:** Extended test suites with an accurate mock of the WebGPU API to verify the WebGPU path, device fallbacks, and task queue constraints under the limit of `maxConcurrentTasks`.

## Consequences

- SRC-GPU-001 is fully implemented with real GPU kernels and robust CPU fallback paths.
- Residual gaps: multi-node task routing, ML-DSA signature verify built-in.
- Acceptance criteria rephrased to “local edge kernels + optional mesh capacity”, not “general AI agents”.
