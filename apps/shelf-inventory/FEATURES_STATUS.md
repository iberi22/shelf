# Features Implementation Status

**Last updated:** 2026-07-17  
**SSOT:** `.gitcore/features.json` + `.gitcore/features-details.json`  
**Project average:** **~88%** — Phase C path-to-100 (see `.gitcore/planning/PLAN-100-FEATURES.md`)

> Auth is **localAuth** (ACs realineados). Cloud sync = ROADMAP-003. Stripe optional (`docs/STRIPE_AND_PLANS.md`).

## Summary counts

| Bucket | Count | Rule of thumb |
|--------|------:|---------------|
| Implemented | 16 | ≥85% and core ACs met |
| Partial | 4 | Usable with material gaps |
| Skeleton | 1 | Mock / placeholder |
| **Average** | **~88%** | Simple mean of 21 SRC features |

## Feature Status (honest audit + session fixes)

| ID | Feature | Status | % | Notes |
| --- | --- | --- | ---: | --- |
| SRC-FUN-001 | Inventory Management | implemented | 96 | CRUD + variants + stock on sell; strong E2E |
| SRC-FUN-002 | Sales Tracking | implemented | 97 | Stock decrement + PDF; hardened |
| SRC-FUN-003 | Dashboard | implemented | **90** | Live charts from sales/products (was fake teaser) |
| SRC-FUN-004 | Contact Management | implemented | 98 | Shared ContactManagementPage |
| SRC-FUN-005 | Purchase Orders | implemented | **92** | pending/received/**cancelled**; stock only on receive |
| SRC-FUN-006 | Barcode/QR Scanner | implemented | **88** | formats EAN/UPC/Code128 + vibrate |
| SRC-FUN-007 | AI Assistant | partial | 72 | Chat UI; WebLLM/client Gemini; no CF proxy |
| SRC-FUN-008 | Auth (Local) | implemented | **88** | ACs localAuth/lock/devices; cloud=ROADMAP-003 |
| SRC-FUN-009 | Monetization | partial | **82** | tier UI + ads free; Stripe still optional stub |
| SRC-FUN-010 | Multi-language | implemented | 88 | **20 locales**; some hardcodes |
| SRC-FUN-011 | Settings & Data | implemented | 91 | Backup/restore/reset/currency |
| SRC-FUN-012 | Reports & Analytics | implemented | 89 | Real charts + top products + filters |
| SRC-FUN-013 | Multi-user P2P | partial | **82** | ACs P2P team; invite residual |
| SRC-FUN-014 | CSV Import | implemented | **94** | aliases + row errors + E2E |
| SRC-PQC-001 | Post-Quantum Crypto | partial | 78 | ML-KEM/DSA handshake; **YJS not app-encrypted** |
| SRC-P2P-001 | P2P Mesh | partial | 85 | Single PeerJS Phase C; broker still required |
| SRC-CRDT-001 | CRDT Yjs | partial | 84 | Shared Y.Doc Phase B; remote entity ACL relaxed |
| SRC-EDGE-001 | Edge Mesh Runtime | partial | 72 | Dual wire path; Phase D open |
| SRC-GPU-001 | GPU Agent | skeleton | **18** | executeTask **mock** |
| SRC-QA-001 | Testing | partial | 78 | Playwright strong; GHA infra flaky |
| SRC-PWA-001 | PWA & Offline | implemented | 86 | SW + IDB + update banner |

## Critical product lies (corrected)

| Claim (old docs) | Reality |
|------------------|---------|
| Firebase Auth & Cloud Sync 100% | `AuthContext` → `localAuthManager` only |
| Cloud Sync via Supabase | No Supabase client in app |
| Stripe production-ready | UI calls `/api/createCheckoutSession`; tier hardcodes Pro |
| Dashboard charts real | `ProChartsTeaserCard` hardcodes Ene–Jun demo |
| GPU agents on WebGPU | Mock delay + string result |
| YJS encrypted with PQC | Only authority messages app-encrypted; YJS = DTLS |

## Strategic open work (linked)

| Track | Related | Priority |
|-------|---------|----------|
| Real subscription gating | FUN-009 | P0 |
| Auth AC alignment (docs or Firebase) | FUN-008 | P0 |
| Dashboard real charts | FUN-003 | P0 |
| PO cancelled + receive E2E | FUN-005 | P1 |
| Encrypt YJS post dual-key | PQC / ROADMAP-010 | P1 |
| Phase D thin p2p-mesh-core | EDGE / P2P | P1 |
| GPU real execution | GPU-001 | P2 |

## Validation snapshot (2026-07-17)

- edge-mesh unit: **214/214**
- Playwright gate: multi-peer, edge-mesh-sync, p2p-sync, offline, conflict, three-node, security → **9/9**
- Vercel build: green after removing stale `edge-mesh-react` type stub
- GitHub Actions shelf: often fails instantly (infra) — prefer local + Vercel

## Required doc sources

1. `.gitcore/features.json` — summary + gaps per SRC  
2. `.gitcore/features-details.json` — paths, tests, acceptance_met, next_actions  
3. Root `features.json` — index only  
4. This file — human-readable status for app folder  
5. `docs/src/REQUIREMENTS.md` / `NON-FUNCTIONAL.md` — must match SSOT (not 100%)
