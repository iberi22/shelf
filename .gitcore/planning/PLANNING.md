# Shelf Planning — GitCore

## Core Objective
SaaS de gestión de inventario offline-first con sincronización P2P descentralizada y criptografía post-cuántica.

## Target Audience
- Pequeños negocios minoristas
- Vendedores e-commerce (Etsy, Mercado Libre, Instagram)
- Artesanos y makers
- Dueños de bodegas pequeñas

## Monetization Strategy
| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Core local features, ads |
| Basic | TBD | Cloud sync, no ads |
| Pro | TBD | AI assistant, advanced reports |
| Pyme | TBD | Multi-user, team management |

## Architecture Principles
1. **Offline-First** — todas las ops son locales, cloud es opcional
2. **P2P Decentralized** — no hay servidor central para sincronización
3. **Post-Quantum Security** — datos protegidos contra computación cuántica
4. **Privacy by Design** — el usuario controla sus datos

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| pnpm + Turborepo | Builds paralelos, dependencias eficientes |
| Vite 8 + React 19 | Performance, ecosystem |
| PeerJS + Yjs | P2P real, CRDT battle-tested |
| ML-KEM-768 | NIST estándar PQC |
| Firebase | Auth + storage gratuito para MVP |
| Stripe | Payment processing production-ready |
| Vercel | Deploy automático, preview deployments |
