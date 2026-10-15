# Shelf

Decentralized, offline-first inventory management and point-of-sale (POS) platform with post-quantum cryptography.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Version](https://img.shields.io/badge/version-0.0.1-green.svg)](https://github.com/iberi22/shelf/releases/tag/v0.0.1)

---

## Overview

**Shelf** is an offline-first, peer-to-peer (P2P) inventory and POS solution built for high reliability in environments with unstable or zero internet connectivity. By combining WebRTC mesh networks, CRDT conflict-free synchronization, post-quantum cryptography (NIST ML-KEM-768 & ML-DSA-65), and edge GPU acceleration, Shelf operates completely autonomously on local devices while enabling seamless real-time synchronization when peers connect.

---

## Key Features

> **Estado medido (2026-10-15).** La fuente de verdad es [`.gitcore/features.json`](.gitcore/features.json);
> el `features.json` de la raíz quedó **deprecado** y solo redirige allí. Última reconciliación contra el
> código de `main` en `b33cf85`: **41 features medidas**
> (16 `implemented` / 20 `partial` / 3 `in_progress` / 1 `planned` / 1 `out_of_scope`), con **669 unit
> tests verdes** (edge-mesh 236 · inventory-core 112 · p2p-mesh-core 56 · app 265).
>
> Lo que **no** está verificado y no debe leerse como terminado: las specs Playwright/Cypress (74 + 18)
> no se ejecutaron; `packages/*/dist` no está construido, por lo que 18 archivos de specs no cargan
> (`security.test.ts`, `localAuth`, `telemetry`, `cloudAuth`, `gpu-agent`, …); la CI de GitHub Actions
> falla por **billing** (sin logs, no es evidencia); y **no hay despliegue público**
> (`estante-inventario.vercel.app` → 404, no existe `shelf.swal.network`). Los grupos marcados
> **(sin verificar)** existen en código pero no tienen test verde en esa reconciliación.

### Core POS & Inventory Management
- **Complete Product Catalog & Variants:** Comprehensive CRUD operations for products with SKUs, pricing, costs, stock levels, images, and customizable variant attributes (colors, sizes, models/versions).
- **Sales Tracking & Automated Inventory Decrement:** Point-of-sale workflow that automatically decrements stock levels, computes revenue and profits, and logs transaction histories. *(sin verificar: solo specs Playwright/Cypress, no ejecutadas)*
- **Purchase Orders & Supplier Workflows:** Create purchase orders for suppliers; marking orders as received automatically updates inventory stock levels. *(parcial: colección P2P `purchaseOrders` con authority checks verificada; flujo UI sin E2E ejecutado)*
- **Unified Contact Management:** Integrated management of clients and suppliers with standardized CRUD interfaces. *(sin verificar: solo Cypress)*
- **Real-Time Analytics Dashboard & Reports:** Customizable business metrics, profit margin analytics, total inventory valuation, and sales graphs powered by Chart.js. *(parcial: Dashboard sin unit test; la exportación PDF sí está verificada con 14 tests)*
- **Barcode & QR Code Scanner:** Integrated device camera scanner supporting QR codes, EAN, UPC, and Code128 barcodes for instant SKU lookup and input. *(sin verificar: E2E no ejecutado)*
- **CSV Data Import:** Flexible CSV importer with interactive column header mapping, line-by-line validation, and downloadable template support.
- **PDF Export Suite:** Generate and download branded PDF reports for inventory valuation, low stock alerts, and historical sales using `jsPDF`.
- **AI Inventory Assistant:** Context-aware natural language assistant powered by DeepSeek v4 Flash for inventory insights and sales queries.

### Decentralized P2P Mesh & Conflict-Free Sync
- **P2P Mesh Networking (`@shelf/p2p-mesh-core`):** Fully decentralized WebRTC mesh network powered by PeerJS for peer discovery and topology routing without relying on central database servers.
- **CRDT Sync with Yjs (`@shelf/edge-mesh`):** State replication using Yjs Conflict-Free Replicated Data Types for delta synchronization and eventual consistency across offline-first peers.
- **Edge Mesh Runtime & Authz (`@shelf/edge-mesh`):** Reusable P2P browser runtime managing Yjs namespaces, remote origin tracking (`remote`, `peerId`), and surgical authorization revert mechanisms for unauthorized mutations.
- **P2P Team Access & Role Enforcement:** Local team management supporting Admin, Collaborator, and Vendedor roles enforced at UI and network data layer. *(parcial: autoridad de invitación verificada con 6 tests; verificación multi-nodo pendiente)*
- **Branches & Bodegas:** Branch scoping with an active branch selector in the sidebar and a P2P `branches` collection with per-role authority checks. *(parcial: UI sin E2E ejecutado)*
- **Audit Log:** Admin-only audit viewer in Settings backed by the P2P `auditLogs` collection (privilege rules) and the edge-mesh op-log. *(parcial: visor sin E2E ejecutado)*

### Security & Post-Quantum Cryptography
- **NIST Post-Quantum Cryptography:** Standardized post-quantum key exchange via **ML-KEM-768** and digital signatures via **ML-DSA-65** (`@noble/post-quantum`).
- **PQC At-Rest Vault Derivation (PQC KDF):** Key derivation for encrypted local storage using ML-KEM-768 KEM iterations, with seamless automatic migration from legacy PBKDF2 vaults.
- **Signed CRDT Envelopes:** Cryptographically signed envelope transport (`EDGE_MESH_ENVELOPE`) ensuring payload integrity and peer authentication.
- **Local-First Authentication & Device Security:** Secure device-bound local authentication (`localAuth`) with PIN/biometric app locks (WebAuthn), authorized device management, and seed recovery phrase backup. *(parcial: WebAuthn 8 + seed 20 tests verdes; la spec de `localAuth` no carga por `p2p-mesh-core` sin dist)*

### Edge Compute & Integrations
- **WebGPU Agent & Mesh Marketplace (`@shelf/gpu-agent`):** Local numeric compute kernels (vector-sum, dot-product, matrix-scale) using WGSL shaders with CPU fallback, plus peer capacity discovery, task routing, and result aggregation. *(sin verificar: los 4 archivos de test no cargan por `edge-mesh` sin dist → 0 tests)*
- **Cloud Auth & Sync Fallback:** Optional cloud sync to Supabase (with Last-Write-Wins conflict resolution) and cloud authentication via Firestore, designed as non-blocking fallbacks to offline-first operation. *(parcial: `cloudSync` verificado con 11 tests; `cloudAuth` sin cargar y requiere proyecto Firestore/Supabase)*
- **E-Commerce Webhook Handlers:** HMAC SHA-256 verified webhooks for Shopify and WooCommerce for real-time external inventory synchronization. *(verificado con 71 unit tests; requiere credenciales reales)*
- **Offline Telemetry & Error Tracking:** Privacy-respecting GA4 telemetry and Sentry error monitoring backed by persistent IndexedDB offline queues. *(Sentry verificado con 19 tests; **telemetría sin verificar**: su spec no carga)*

### UX, i18n & PWA
- **Dual Theme System:** Dynamic runtime switching between **Classic** theme and **SWAL Edge-Hive** theme, powered by semantic CSS variables and Tailwind CSS v4. *(verificado con 5 unit tests)*
- **20-Language Internationalization (i18n):** Multi-language UI support with runtime locale loading and persistence. *(20 locales presentes y parseables; cobertura de claves por idioma sin verificar)*
- **PWA & Offline Availability:** Progressive Web App equipped with Service Worker caching (`vite-plugin-pwa` / Workbox) and dual storage (localStorage + IndexedDB). *(sin verificar: E2E offline no ejecutado)*
- **Colaborador SWAL Monetization Model:** All core POS features remain 100% free locally without forced subscriptions or intrusive ads. *(fuera de alcance: no hay código de pagos; `ProGate.tsx` no está referenciado)*

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                       Application Layer                           │
│     React 19 UI  │  Context API  │  localStorage / IndexedDB     │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
┌─────────────────────────────────▼─────────────────────────────────┐
│                      Edge Mesh Runtime Layer                      │
│     @shelf/edge-mesh (Yjs CRDT, PeerJS Transport, Security Guard) │
│     @shelf/edge-mesh-react (React Bindings)                       │
│     @shelf/gpu-agent (WebGPU Compute & Mesh Marketplace)          │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
┌─────────────────────────────────▼─────────────────────────────────┐
│                       Legacy / Core P2P Layer                     │
│     @shelf/p2p-mesh-core (WebRTC Mesh, Yjs Sync, Admin Engine)    │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
┌─────────────────────────────────▼─────────────────────────────────┐
│                 Post-Quantum Security Layer                       │
│     ML-KEM-768 (Key Exchange)   │   ML-DSA-65 (Digital Signatures) │
│     AES-256-GCM (Payload Encryption)                              │
└───────────────────────────────────────────────────────────────────┘
```

For detailed architectural specifications, data flow diagrams, and API references, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Tech Stack

| Component | Technology |
|---|---|
| **Frontend Framework** | React 19.1, Vite 8.2, TypeScript 6 |
| **Styling & UI** | Tailwind CSS 4, PostCSS, Biome |
| **Monorepo & Build** | pnpm 9+, Turborepo 2 |
| **P2P & CRDT** | PeerJS (WebRTC), Yjs (CRDT) |
| **Post-Quantum Security** | ML-KEM-768, ML-DSA-65 (`@noble/post-quantum`), AES-256-GCM |
| **Edge Compute** | WebGPU (WGSL compute shaders), CPU fallback |
| **Cloud (Optional)** | Supabase (Cloud Sync), Firestore (Cloud Auth) |
| **Analytics & Errors** | GA4 (Offline IDB Queue), Sentry (Offline Queue) |
| **PDF Generation** | jsPDF, jspdf-autotable |
| **Testing** | Vitest (Unit), Playwright (E2E), Cypress (Component/E2E), Biome (Linting) |

---

## Quick Start

### Prerequisites
- **Node.js**: `^18.18.0` or `>=20.0.0`
- **pnpm**: `>=9.0.0`

### Installation & Development

```bash
# Clone repository
git clone https://github.com/iberi22/shelf.git
cd shelf

# Install dependencies across monorepo
pnpm install

# Start development server
pnpm dev

# Build all packages and applications
pnpm build

# Execute test suite (unit & E2E)
pnpm test

# Run Biome linter and formatter
pnpm lint
pnpm format
```

---

## Monorepo Structure

```
shelf/
├── apps/
│   ├── shelf-inventory/       # Primary React 19 / Vite 8 PWA POS Application
│   └── docs/                  # VitePress documentation site
├── packages/
│   ├── edge-mesh/             # Reusable P2P runtime (Yjs CRDT, WebRTC, Authz)
│   ├── edge-mesh-react/       # React hooks and provider for edge-mesh
│   ├── p2p-mesh-core/         # Core P2P engine (PQC, roles, database sync)
│   ├── gpu-agent/             # WebGPU compute kernels & Mesh GPU marketplace
│   ├── swal-ui/               # Shared UI component library
│   └── maloca-bridge/         # Maloca protocol integration adapters
├── docs/                      # Technical documentation & Architecture specs
│   ├── ARCHITECTURE.md        # Comprehensive Architecture & API Documentation
│   └── SRS/                   # Software Requirements Specifications
└── .github/workflows/         # CI/CD pipeline automation
```

---

## Contributing

We welcome contributions to Shelf! Please follow these guidelines:

1. **Review Standards:** Check [CONTRIBUTING.md](CONTRIBUTING.md) and [CLA.md](CLA.md) before submitting code.
2. **Code Quality:** Ensure all changes pass Biome formatting (`pnpm format`) and linting (`pnpm lint`).
3. **Testing:** Write unit tests for new library utilities and E2E Playwright/Cypress tests for UI flows. Run `pnpm test` locally to verify.
4. **Security:** Never commit plain secrets, credentials, or private keys. Rely on Web Crypto and PQC utilities provided in `@shelf/p2p-mesh-core` and `@shelf/edge-mesh`.

---

## Documentation Links

- [Architecture & API Reference](docs/ARCHITECTURE.md)
- [Feature Registry & Metrics](.gitcore/features.json) (SSOT; `features.json` en la raíz está deprecado)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

---

## License

This project is licensed under the **AGPL-3.0-only** License — see the [LICENSE](LICENSE) file for details.
