# Shelf — TASK & Progress

## 🟢 Resumen Ejecutivo

| Estado | % |
|--------|---|
| **Producto inventario (ponderado)** | ~79% |
| **P2P / Edge / PQC / GPU (ponderado)** | ~62% |
| **features.json promedio** | **77%** (recalibrado 2026-07-17) |
| **Production hardened (mesh)** | en curso |

> **Nota 2026-07-17:** el 100% previo era incorrecto. Ver `.gitcore/features.json` (`status`, `maturity`, `gaps`) y `.gitcore/planning/PLAN-P2P-UNIFICATION.md`.

---

## 🔄 Activo — P2P Unification & Hardening

| Fase | Trabajo | Estado |
|------|---------|--------|
| A1 | Features honesty (Shelf + edge-mesh) | ✅ |
| A2 | MemoryTransport + ITransport | ✅ |
| A3 | Authz en `procesarSync` / rechazo AUTHZ remoto | ✅ |
| A4 | sign/verify envelopes + fix ML-DSA arg order | ✅ |
| A5 | Export `createPeerHealthMonitor` / `getReconnectDelay` | ✅ |
| A6 | Guard `dbSync.applyUpdate` remoto | ✅ |
| A7 | Desactivar 2º PeerJS de EdgeMesh en Shelf | ✅ |
| B1 | `config.yDoc` + no destroy host doc | ✅ |
| B2 | Bridge sin mirror; maps = dbSync keys | ✅ |
| B3 | AppContext inyecta `dbSync.doc` | ✅ |
| C1 | `P2PManagerTransport` + `EDGE_MESH_ENVELOPE` | ✅ |
| C2 | `EdgeMeshTransportBinder` late-bind | ✅ |
| C3 | `relayLocalYjs: false` (sin double broadcast) | ✅ |
| D0 | Roadmap PHASE-D + CI skeleton edge-mesh | ✅ |
| D1 | p2p-mesh-core sin PeerJS | ⏳ deferred |
| D2 | Maloca package split | ⏳ deferred |
| D3 | Hardened + coverage + YJS→envelope único | ⏳ pending |

---

## Features (estado honesto)

| ID | Feature | Prioridad | Estado | % |
|----|---------|-----------|--------|---|
| SRC-FUN-001 | Inventory Management | P0 | implemented | 92 |
| SRC-FUN-002 | Sales Tracking | P0 | implemented | 90 |
| SRC-FUN-003 | Dashboard | P0 | implemented | 88 |
| SRC-FUN-004 | Contact Management | P0 | implemented | 90 |
| SRC-FUN-005 | Purchase Orders | P1 | implemented | 85 |
| SRC-FUN-006 | Barcode/QR Scanner | P1 | implemented | 85 |
| SRC-FUN-007 | AI Assistant | P2 | partial | 75 |
| SRC-FUN-008 | Auth & Cloud Sync | P0 | partial | 70 |
| SRC-FUN-009 | Monetization | P0 | partial | 75 |
| SRC-FUN-010 | Multi-language | P1 | implemented | 90 |
| SRC-FUN-011 | Settings & Data | P1 | implemented | 90 |
| SRC-FUN-012 | Reports & Analytics | P1 | implemented | 88 |
| SRC-FUN-013 | Multi-user (Pyme) | P2 | partial | 65 |
| SRC-FUN-014 | CSV Import | P2 | implemented | 80 |
| SRC-PQC-001 | Post-Quantum Crypto | P0 | partial | 68 |
| SRC-P2P-001 | P2P Mesh Network | P0 | partial | 78 |
| SRC-CRDT-001 | CRDT Sync (Yjs) | P0 | partial | 82 |
| SRC-QA-001 | Testing Infrastructure | P1 | partial | 65 |
| SRC-PWA-001 | PWA & Offline | P0 | implemented | 88 |
| SRC-EDGE-001 | Edge Mesh Runtime | P0 | partial | 58 |
| SRC-GPU-001 | GPU Agent (WebGPU) | P1 | skeleton | 22 |

## 📋 Pendientes (Post-Launch)

| ID | Tarea | Prioridad | Estado |
|----|-------|-----------|--------|
| — | Error Monitoring (Sentry) | P1 | 🔴 |
| — | User Analytics (GA) | P2 | 🔴 |
| — | Full Cloud Sync (Pro) | P1 | 🔴 |
| — | Multi-user Backend Logic | P2 | 🔴 |
| — | Advanced Reporting Suite | P2 | 🔴 |
| — | E-commerce Integrations | P3 | 🔴 |

## 🏆 Hitos Completados
- **2026-06:** v1.0 - MVP Core (Inventory, Sales, Dashboard, Contacts)
- **2026-06:** v1.1 - Pro Features (Auth, Cloud Sync, Monetization)
- **2026-06:** v1.2 - Advanced (Reports, AI, Scanner, Purchase Orders)
- **2026-06:** Phase 1 - Production Readiness (Stripe, Firebase, Rules)
