# Changelog

## v0.0.1 (2026-08-26)

### First Public Release

Decentralized, offline-first inventory and POS platform with post-quantum encryption.

#### Features (31 implemented, 93% coverage)
- P2P mesh offline-first with CRDT sync (Yjs)
- Post-quantum encryption (ML-KEM-768 + ML-DSA-65)
- Dual theme system (Classic + SWAL edge-hive)
- Cloud sync (Supabase) with conflict resolution
- Cloud authentication (Firestore + local fallback)
- Sentry error tracking with offline queue
- GA4 offline-first telemetry
- PDF export (inventory valuation, low stock, sales)
- Shopify/WooCommerce webhooks with HMAC verification
- RBAC with Supabase RLS policies
- GPU agent mesh marketplace
- GHA CI/CD pipeline
- @swal/ui component system
- 20 languages i18n support
- Maloca package split D2
- PeerServer fallback offline discovery
- Secondary locales sync script

#### Security
- PQC KDF for at-rest encryption (ML-KEM-768 + PBKDF2 migration)
- Signed CRDT envelope validation
- Admin promotion hardened (PQC handshake required)
- Rate limiting for AI chat API
- Secure ID generation (crypto.getRandomValues)

#### Infrastructure
- GHA CI/CD pipeline (build, lint, type-check, unit, e2e, deploy)
- Biome linting (0 errors)
- TypeScript strict mode (0 errors)
- Vitest unit tests (391+ passing)
- Playwright E2E tests (18 passing)

#### Packages
- @shelf/edge-mesh (P2P runtime)
- @shelf/p2p-mesh-core (P2P sync engine)
- @shelf/gpu-agent (WebGPU agent)
- @shelf/swal-ui (shared components)
- @shelf/maloca-bridge (Maloca adapters)

#### Dependencies
- React 19.1.1
- Vite 8.2.2
- TypeScript 6
- Tailwind 4
- pnpm 9+

#### Known Issues
- 11 dev-dependency vulnerabilities (non-production)
- PeerJS broker requires signaling online (design limitation)
- Secondary locales may lag EN/ES/PT
