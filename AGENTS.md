
## SWAL ecosystem goal (do not disconnect)

- **Canonical:** monorepo `docs/SWAL/GOAL.md` · `docs/SWAL/PROJECT_MAP.md` · `docs/SWAL/README.md`
- **Local copy:** `.gitcore/docs/SWAL_GOAL.md` (via `gitcore-update`)
- **Pro:** active SWAL node only — **no Stripe** as Pro unlock
- **Memory:** Xavier HTTP/MCP · namespaces `app/{appId}/instance/{instanceId}`
- **Mesh:** edge-mesh · `swal/{appId}/{instanceId}` (when P2P applies)
- **Token:** $SWAL ownership + stake yield (not parallel OMNI/XAV coins)
- **Backoffice:** `maloca/apps/swal-backoffice`
- **Protocol:** GitCore 3.8 · feature-verify / implementation-score under `.gitcore/scripts/`

> **GitCore 3.8.0** applied 2026-07-17. Full bootstrap rules are in protocol sections; preserve project-specific content below.
# AGENTS.md — Guía para Agentes de Shelf

**Última actualización:** 2026-07-30
**Versión del proyecto:** 2.0.5

---

## 📋 Resumen del Proyecto

Shelf es una plataforma descentralizada de inventario y punto de venta (POS) **offline-first**. Construida como monorepo Node.js/TypeScript con **pnpm workspaces + Turborepo**.

| Aspecto | Detalle |
|---------|---------|
| Propietario | BELA (Brahyan Belalcazar, @iberi22) |
| Stack | React 19, Vite 8, TypeScript 6, Tailwind 4 |
| P2P | PeerJS (WebRTC) + Yjs (CRDT) |
| Paquetes | `@shelf/edge-mesh`, `@shelf/p2p-mesh-core`, `@shelf/gpu-agent` |
| Crypto | ML-KEM-768, ML-DSA-65 (post-quantum) |
| Deploy | Vercel |
| Testing | Playwright, Cypress, Biome, Husky |

---

## 🏗️ Estructura del Monorepo

```
shelf/
├── apps/
│   ├── shelf-inventory/     # App principal (React 19 + Vite 8)
│   │   ├── components/      # Componentes React por feature
│   │   ├── context/         # React Context (AppState, Auth, UI)
│   │   ├── hooks/           # Custom hooks + adaptadores Edge Mesh
│   │   ├── lib/             # Lógica core (Edge Mesh Workflow Bridge)
│   │   ├── locales/         # Traducciones i18n (20 idiomas)
│   │   ├── tests/           # Playwright E2E + unit tests
│   │   └── App.tsx          # Entry point + routing
│   └── docs/                # Documentación VitePress
├── packages/
│   ├── p2p-mesh-core/       # Motor P2P legacy (WebRTC, Yjs, PQC)
│   ├── edge-mesh/           # Runtime P2P reutilizable (Yjs, CRDT, authz)
│   ├── edge-mesh-react/     # Provider React + hooks para edge-mesh
│   └── gpu-agent/           # Integración WebGPU
├── skills/                  # Skills de Harness Engineering
├── tests/                   # Tests de ejemplo del monorepo
├── .gitcore/                # GitCore protocol (v3.6.0)
└── .github/workflows/       # CI/CD pipelines
```

---

## 🚀 Comandos Esenciales

```bash
# Instalar dependencias
pnpm install

# Desarrollo (todos los workspaces)
pnpm dev

# Build
pnpm build

# Lint
pnpm lint

# Formato
pnpm format

# Ejecutar app específica
pnpm --dir apps/shelf-inventory dev

# Tests de edge-mesh
pnpm --dir packages/edge-mesh test

# PeerServer local (necesario para tests P2P)
pnpm peer-server
```

---

## 🧠 Arquitectura Edge Mesh

La sincronización P2P se maneja a través de `@shelf/edge-mesh` con esta arquitectura:

1. **Namespace `shelf`** con sub-documentos: products, sales, clients, suppliers, purchaseOrders, arqueoSessions, auditLogs, teamMembers
2. **Delta sync**: Solo se transmiten cambios (deltas CRDT), no snapshots completos
3. **Security Guard**: Autorización de mutaciones remotas antes de aplicar al estado
4. **Self-healing**: Reversión automática de cambios no autorizados

### Flujo de sincronización

```
Mutación Local → Yjs Map update → Broadcast delta → 
Peer remoto recibe → Auth check → Apply o Revert
```

---

## ⚙️ Convenciones de Código

| Regla | Estándar |
|-------|----------|
| Lenguaje | TypeScript 6 (strict mode) |
| Estilo | Biome (formatter + linter) |
| Commits | `tipo(scope): descripción (closes #N)` |
| Pre-commit | Husky → lint-staged → tsc --noEmit |
| Testing | Playwright (E2E edge-mesh), Cypress (UI) |
| Paquetes | Publicados como `@shelf/*` |

---

## 📍 Protocolo GitCore (v3.6.0)

Shelf usa el protocolo GitCore. Archivos importantes:

| Archivo | Propósito |
|---------|-----------|
| `.gitcore/ARCHITECTURE.md` | Stack, patrones, capas |
| `.gitcore/features.json` | 21 features, ~91% real (21 implemented / 0 partial / 0 skeleton) |
| `.gitcore/SDLC_WORKFLOW.md` | Ciclo de vida: ANALYSIS → DESIGN → IMPLEMENT → TEST → DEPLOY |
| `.gitcore/AGENT_INDEX.md` | Labels de agentes (jules, opencode, gemini, claude) |
| `.gitcore/planning/TASK.md` | Tareas activas |
| `.gitcore/planning/PLANNING.md` | Sprint planning |

---

## 🧭 Para Agentes Nuevos

1. Lee `AGENTS.md` (este archivo), `SOUL.md`, `USER.md` primero
2. Lee `.gitcore/ARCHITECTURE.md` — decisiones no negociables
3. Lee `.gitcore/features.json` — estado del proyecto
4. Revisa `.gitcore/planning/TASK.md` — tareas activas
5. Lee `BOOTSTRAP.md` para la configuración inicial
6. Usa `RULES.md` como guía de codificación


