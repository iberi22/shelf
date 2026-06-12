# Agent Index — Shelf Project

**Protocol Version:** 3.6.0
**Updated:** 2026-06-11

## Agent Roles

| Agent | Role | Trigger | CLI |
|-------|------|---------|-----|
| `@architect` | Architecture decisions | `architecture` label | Spawn with architecture focus |
| `@protocol-codex` | Implementation (heavy coding) | Default coding tasks | `opencode run --model minimax/MiniMax-M2.7` |
| `@protocol-claude` | Engineering + complex reviews | Complex integration | `claude -p "..." --permission-mode bypassPermissions` |
| `@protocol-gemini` | Deep analysis / documentation | `analysis` label | `gemini -p "..." -y` |
| `@router` | Issue triage / dispatch | Manual / dispatcher | `dispatcher-core.ps1` |
| `@src-generator` | SRC generation | `needs-src`, `update-src` | Spawn with SRC focus |
| `@protocol-validator` | SRC validation | `validate-src` | Spawn with validation focus |
| `Jules` | Autonomous coding | GitHub Issue + `@jules-ai` | `gh issue edit #N --add-assignee @jules-ai` |

## Label Routing

### SDLC Labels
| Label | Fase | Acción |
|-------|------|--------|
| `needs-src` | ANALYSIS | Generar SRC Requirements via @src-generator |
| `update-src` | DESIGN | Actualizar SRC via @architect |
| `validate-src` | TESTING | Validar código vs SRC via @protocol-validator |
| `src-approved` | DESIGN | SRC aprobado por @architect |
| `sdlc` | ALL | Issue de ciclo completo |

### Agent Labels (GitHub)
| Label | Agente | CLI |
|-------|--------|-----|
| `jules` | Jules | `gh issue edit #N --add-assignee @jules-ai` |
| `opencode` | OpenCode | `opencode run --model minimax/MiniMax-M2.7` |
| `gemini` | Gemini | `gemini -p "..." -y` |
| `claude` | Claude Code | `claude -p "..." --permission-mode bypassPermissions` |

## Startup Context Load Order

When any agent enters the project, read in this exact order:

```bash
# Step 1: Architecture (non-negotiable foundation)
cat .gitcore/ARCHITECTURE.md

# Step 2: Project state (features + planning)
cat .gitcore/features.json
cat .gitcore/planning/PLANNING.md
cat .gitcore/planning/TASK.md

# Step 3: SRC context (when applicable)
cat .gitcore/SRC_CONFIG.md
cat .gitcore/SDLC_WORKFLOW.md

# Step 4: Agent routing
cat .gitcore/AGENT_INDEX.md
```

## Project Location
- **Root:** `E:\scripts-python\shelf` (pnpm monorepo)
- **App:** `apps/shelf-inventory` (React 19, Vite 8, Tailwind 4, TypeScript 6)
- **P2P Engine:** `packages/p2p-mesh-core`
- **Docs App:** `apps/docs` (VitePress)
- **SRC Docs:** `docs/src/`
