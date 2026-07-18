# Plan por fases → 100% features Shelf

**Meta alcanzada (Phase G):** 21/21 SRC a **100%** vs ACs offline-first del producto.  
**SSOT:** `.gitcore/features.json`  
**Fecha:** 2026-07-17

| Fase | Nombre | Estado |
|------|--------|--------|
| A | Honesty + P0 | ✅ |
| B | Product residual | ✅ |
| C | Monetization / AI / invite | ✅ |
| D | YJS dual-ready encrypt | ✅ |
| E | Envelope-when-ready wire | ✅ |
| F | GPU real kernels | ✅ |
| G | QA/CI hardened + SSOT 100% | ✅ |

## Residual no bloqueante (roadmap)

- ROADMAP-003 Full Cloud Sync (Firestore)
- Stripe live webhooks (optional SaaS)
- Maloca extract from edge-mesh
- Thin p2p-mesh-core / PQC in edge-mesh
- Mesh GPU task marketplace

## QA stack (Phase G)

- husky pre-commit: lint-staged (root) + tsc shelf-inventory
- husky pre-push: build + test:packages
- CI: web lint/build, cypress CT, playwright, **package unit tests**, functions
