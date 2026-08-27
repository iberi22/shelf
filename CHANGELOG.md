# Changelog

All notable changes to the Shelf project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.0.1] - 2026-08-26

### First Public Release (v0.0.1)

Decentralized, offline-first inventory management and POS platform with post-quantum cryptography, P2P mesh CRDT synchronization, and edge compute capabilities. Includes 31 fully implemented features (93% overall project implementation coverage).

---

### 🚀 Wave 2 (Ola 2) Additions & Enhancements

#### Added
- **Cloud Authentication Integration (`cloudAuth.ts`):** Added Firestore cloud authentication fallback with seamless local fallback (`localAuth`) for resilient offline-first authentication (`SRC-FUN-016`).
- **Cloud Synchronization (`cloudSync.ts`):** Implemented optional Supabase cloud sync with Last-Write-Wins (LWW) conflict resolution and persistent IndexedDB offline write queue (`SRC-FUN-017`).
- **Supabase RBAC & RLS (`rbac.ts`):** Integrated Role-Based Access Control mapping Admin, Collaborator, and Vendedor roles directly to Supabase Row Level Security (RLS) policies (`SRC-FUN-018`).
- **PDF Export Suite (`pdfExport.ts`):** Built PDF export utilities using `jsPDF` and `jspdf-autotable` supporting inventory valuation, low-stock reports, and filtered sales reports (`SRC-FUN-019`).
- **Offline Telemetry Pipeline (`telemetry.ts`):** Added privacy-focused GA4 telemetry with IndexedDB event queuing, batch flushing on reconnect, and explicit user consent gating (`SRC-FUN-020`).
- **Sentry Error Tracking (`errorTracking.ts` / `sentry.ts`):** Integrated Sentry monitoring with offline error event queuing and background flushing when network status restores (`SRC-FUN-021`).
- **E-Commerce Webhooks (`webhookHandlers.ts`):** Developed webhook handlers for Shopify and WooCommerce with HMAC SHA-256 signature verification, idempotent event parsing, and CRDT stock update triggers (`SRC-FUN-022`).
- **PQC At-Rest Vault Key Derivation (`crypto-kdf.ts`):** Introduced post-quantum KDF using 100 ML-KEM-768 key encapsulation iterations with automatic PBKDF2 vault migration upon unlock (`SRC-PQC-002`).
- **GPU Mesh Marketplace (`mesh-marketplace-full.ts`):** Expanded WebGPU capabilities with peer discovery, ML-DSA-signed task routing, result aggregation, fan-out execution, and CPU fallback routing (`SRC-GPU-002`).

#### Security & Infrastructure
- Enforced constant-time comparison algorithms across hash and signature verification routines to eliminate timing vulnerabilities.
- Applied root-level `pnpm.overrides` for high/critical production and dev dependencies, backed by CI `audit-gate` automated checks.
- Added comprehensive unit test coverage for all new Ola 2 modules (`cloudAuth.spec.ts`, `cloudSync.spec.ts`, `rbac.spec.ts`, `pdfExport.spec.ts`, `telemetry.spec.ts`, `errorTracking.spec.ts`, `webhookHandlers.spec.ts`, `crypto-kdf.test.ts`, `mesh-marketplace-full.test.ts`).

---

### 🛡️ Wave 1 (Ola 1) Foundations

#### Core Inventory & POS Capabilities
- **Product & Variant Catalog (`SRC-FUN-001`):** Complete product CRUD with SKU, price, cost, stock, image, and customizable variant matrices (colors, sizes, versions).
- **Sales Tracking (`SRC-FUN-002`):** POS sales execution with automatic stock reduction, revenue calculation, and historical logs.
- **Analytics Dashboard & Reports (`SRC-FUN-003`, `SRC-FUN-012`):** Real-time key metrics display and Chart.js integration for sales over time.
- **Unified Contact Management (`SRC-FUN-004`):** Shared `ContactManagementPage` component eliminating code duplication across client and supplier CRUD.
- **Purchase Orders (`SRC-FUN-005`):** Supplier purchase order tracking with automatic stock increment upon receiving inventory.
- **Barcode & QR Scanner (`SRC-FUN-006`):** Device camera scanning utilizing `html5-qrcode` for instant SKU filling.
- **AI Inventory Assistant (`SRC-FUN-007`):** Natural language assistant proxying DeepSeek v4 Flash via OpenRouter for contextual business insights.
- **Local Authentication & Security (`SRC-FUN-008`):** Offline-first local auth with PBKDF2 password hashing, WebAuthn PIN/biometrics, authorized device management, and seed recovery.
- **Colaborador SWAL Monetization (`SRC-FUN-009`):** Completely free local feature availability without forced subscription gates or ad units.
- **20-Language i18n (`SRC-FUN-010`):** Full UI localization support across 20 languages with dynamic locale loading.
- **Settings & Data Management (`SRC-FUN-011`):** User preferences (currency, threshold), AES-encrypted JSON backup/restore, and data reset.
- **P2P Team Access (`SRC-FUN-013`):** Team invitations via deep link, PeerPermissions matrix, and organizational role enforcement.
- **CSV Data Import (`SRC-FUN-014`):** CSV upload with column alias matching, row validation, and template generator.
- **Dual-Theme System (`SRC-FUN-015`):** Runtime toggle between Classic and SWAL Edge-Hive visual themes with semantic token CSS variables.

#### P2P Mesh, Post-Quantum & Edge Compute
- **Post-Quantum Cryptography (`SRC-PQC-001`):** ML-KEM-768 key encapsulation exchange and ML-DSA-65 digital signatures via `@noble/post-quantum`.
- **P2P Mesh Network (`SRC-P2P-001`):** WebRTC mesh transport via PeerJS with decentralized topology routing (`@shelf/p2p-mesh-core`).
- **CRDT Delta Sync (`SRC-CRDT-001`):** State replication powered by Yjs for eventual consistency across offline peers.
- **Edge Mesh Runtime (`SRC-EDGE-001`):** Reusable `@shelf/edge-mesh` package providing Yjs namespace scoping, remote origin tracking (`remote`, `peerId`), and surgical authorization revert.
- **WebGPU Edge Compute (`SRC-GPU-001`):** Edge compute kernels (`vector-sum`, `dot-product`, `matrix-scale`) executed via WGSL shaders with CPU fallbacks (`@shelf/gpu-agent`).
- **Testing Infrastructure (`SRC-QA-001`):** Playwright E2E suite, Cypress component/E2E suite, Vitest unit suite, and Husky pre-commit hooks.
- **PWA & Offline-First (`SRC-PWA-001`):** Service worker caching via `vite-plugin-pwa` / Workbox and dual persistence (localStorage + IndexedDB).

---

### 📦 Monorepo Package Versions (v0.0.1 Release)

- `apps/shelf-inventory`: `0.5.3.07082026`
- `packages/p2p-mesh-core`: `0.5.3`
- `packages/edge-mesh`: `0.5.3`
- `packages/edge-mesh-react`: `0.5.3`
- `packages/gpu-agent`: `0.5.0`
