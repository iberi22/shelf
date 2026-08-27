# Shelf

Decentralized, offline-first inventory and point-of-sale platform with post-quantum encryption.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Version](https://img.shields.io/badge/version-0.0.1-green.svg)](https://github.com/iberi22/shelf/releases/tag/v0.0.1)

## Features

- **P2P Mesh** — Offline-first synchronization via WebRTC + Yjs CRDT
- **Post-Quantum Encryption** — ML-KEM-768 + ML-DSA-65
- **Dual Theme** — Classic + SWAL edge-hive (switchable)
- **Cloud Sync** — Supabase with conflict resolution (LWW)
- **Cloud Auth** — Firestore + local fallback
- **Error Tracking** — Sentry with offline queue
- **Telemetry** — GA4 offline-first with IndexedDB queue
- **PDF Export** — Inventory valuation, low stock, sales reports
- **Webhooks** — Shopify/WooCommerce with HMAC verification
- **RBAC** — Supabase RLS policies + local enforcement
- **GPU Marketplace** — Peer discovery, task routing, aggregation
- **CI/CD** — GitHub Actions pipeline
- **i18n** — 20 languages supported

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, TypeScript 6, Tailwind 4 |
| Build | pnpm, Turborepo, Biome, Husky |
| P2P | PeerJS (WebRTC), Yjs (CRDT) |
| Crypto | ML-KEM-768, ML-DSA-65 (post-quantum) |
| Backend | Supabase, Firestore, Vercel Edge Functions |
| Testing | Playwright, Vitest, Biome |

## Quick Start

```bash
# Clone
git clone https://github.com/iberi22/shelf.git
cd shelf

# Install
pnpm install

# Development
pnpm dev

# Build
pnpm build

# Test
pnpm test

# Lint
pnpm lint
```

## Project Structure

```
shelf/
├── apps/
│   └── shelf-inventory/     # Main React/Vite app
├── packages/
│   ├── p2p-mesh-core/       # P2P sync engine
│   ├── edge-mesh/           # P2P runtime (Yjs, PeerJS)
│   ├── edge-mesh-react/     # React hooks for edge-mesh
│   ├── gpu-agent/           # WebGPU agent integration
│   ├── swal-ui/             # Shared UI components
│   └── maloca-bridge/       # Maloca adapters
└── .github/workflows/       # CI/CD pipelines
```

## Documentation

- [Architecture](.gitcore/ARCHITECTURE.md)
- [Features](features.json)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

AGPL-3.0-only — see [LICENSE](LICENSE) for details.

## Links

- [GitHub](https://github.com/iberi22/shelf)
- [Release v0.0.1](https://github.com/iberi22/shelf/releases/tag/v0.0.1)
