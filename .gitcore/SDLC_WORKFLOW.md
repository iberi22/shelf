# SDLC Workflow — Shelf Project

**Protocol Version:** 3.6.0
**Updated:** 2026-06-11

## Phases Obligatorias

Todo desarrollo debe pasar por **todas** estas fases en orden:

```
ANALYSIS → DESIGN → IMPLEMENT → TEST → DEPLOY
```

## Flujo Completo

```
ISSUE CREADO (GitHub)
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: ANALYSIS                                            │
│ Label: [needs-src]                                           │
│ Agent: @src-generator                                         │
│ Output: SRC Requirements (SRC-FUN-NNN.md / SRC-PQC-NNN.md)  │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: DESIGN                                              │
│ Label: [update-src] → [src-approved]                          │
│ Agent: @architect                                             │
│ Output: SRC approved + Architecture decision                  │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: IMPLEMENT                                           │
│ Agent: @protocol-codex / Jules / OpenCode                     │
│ Commits: With #SRC-ID reference                               │
│ Output: Funcionalidad implementada + tests                    │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 4: TEST                                                │
│ Label: [validate-src]                                         │
│ Agent: @protocol-validator                                    │
│ Output: Report de gaps vs SRC                                 │
└─────────────────────────────────────────────────────────────┘
    ↓
PR → CI (GitHub Actions) → Guardian Agent → Auto-merge (70% threshold)
    ↓
DEPLOY (Vercel)
```

## Semantic Labels

| Label | Fase | Acción |
|-------|------|--------|
| `needs-src` | ANALYSIS | Generar SRC Requirements |
| `update-src` | DESIGN | Actualizar SRC |
| `validate-src` | TESTING | Validar código vs SRC |
| `src-approved` | DESIGN | SRC aprobado |
| `sdlc` | ALL | Issue de ciclo completo |
| `in-progress` | ALL | Task en progreso |
| `needs-review` | TESTING | Requiere revisión |
| `ai-blocked` | ALL | Bloqueado - requiere intervención humana |

## Git Commit Convention

Todos los commits deben referenciar el SRC ID:

```bash
# Format
<type>(<scope>): implement <SRC-ID> - <short description>

# Examples
feat(inventory): implement SRC-FUN-001 - inventory management
feat(sales): implement SRC-FUN-002 - sales tracking
feat(pqc): implement SRC-PQC-001 - post-quantum cryptography
fix(scanner): resolve camera permission issue in SRC-FUN-006
```

## SWAL Agent Routing

| Tipo | Label GitHub | Agente | CLI |
|------|-------------|--------|-----|
| Bug/Feature | `bug`, `enhancement` | Jules | `gh issue edit #N --add-assignee @jules-ai` |
| Heavy coding | `refactor`, `infrastructure` | OpenCode | `opencode run --model minimax/MiniMax-M2.7 "..."` |
| Engineering | `complex`, `integration` | Claude Code | `claude -p "..." --permission-mode bypassPermissions` |
| Análisis profundo | `analysis`, `research` | Gemini | `gemini -p "..." -y` |
| SRC needed | `needs-src`, `update-src` | @src-generator | Spawn with SRC focus |
| SRC validation | `validate-src` | @protocol-validator | Spawn with validation focus |

## Project-specific SDLC Notes

### Shelf Features Status
- ✅ 19 of 19 features fully implemented
- ✅ All features at `production` SDLC phase
- Next SDLC cycles will be for new features / roadmap items

### Commits con referencia SRC (ya existentes)
```bash
feat(inventory): implement SRC-FUN-001 - inventory management
feat(sales): implement SRC-FUN-002 - sales tracking
feat(pqc): implement SRC-PQC-001 - post-quantum crypto
# ... (19 features total, all committed with SRC references)
```
