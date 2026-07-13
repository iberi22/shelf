# SKILL.md — shelf-testing

**Skill:** Testing E2E de Shelf
**Versión:** 1.0.0

---

## 📋 Descripción

Infraestructura de testing: E2E con Playwright y Cypress, unit tests, linting, y pre-commit hooks.

## 🛠️ Herramientas

- Playwright (E2E edge-mesh)
- Cypress (E2E UI)
- Biome (linting)
- Husky + lint-staged (git hooks)
- GitHub Actions (CI)

## 📂 Alcance

| Área | Ruta |
|------|------|
| Tests E2E Playwright | `apps/shelf-inventory/tests/` |
| Config Playwright | `apps/shelf-inventory/playwright.config.ts` |
| Husky hooks | `.husky/` |
| GitHub CI | `.github/workflows/ci.yml` |

## 🎯 Tareas Comunes

```bash
# Tests edge-mesh E2E
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5187 pnpm --dir apps/shelf-inventory exec playwright test tests/edge-mesh-sync.spec.ts --project=chromium --reporter=list --workers=1

# Tests P2P sync
pnpm --dir apps/shelf-inventory exec playwright test tests/p2p-sync.spec.ts --project=chromium --reporter=list --workers=1

# Cypress UI tests
pnpm --dir apps/shelf-inventory exec cypress run

# Lint
pnpm lint

# Unit tests (edge-mesh)
pnpm --dir packages/edge-mesh test
```

## 📌 Reglas de Testing

1. `data-testid` en todos los elementos interactivos
2. Tests E2E para flujos críticos (CRUD, P2P sync, auth)
3. PeerServer en :9000 para tests P2P
4. Tests deterministas con Playwright harness
5. lint-staged corre Biome + tsc --noEmit en pre-commit
