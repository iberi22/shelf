# SKILL.md — shelf-core-dev

**Skill:** Desarrollo Core de Shelf
**Versión:** 1.0.0

---

## 📋 Descripción

Desarrollo del core de Shelf: apps, packages, configuración del monorepo, y features de inventario/POS.

## 🛠️ Herramientas

- pnpm, Turborepo, Vite 8, React 19, TypeScript 6
- Tailwind CSS 4, PostCSS, Biome
- Firebase Auth, Firestore, Stripe
- Playwright, Cypress

## 📂 Alcance

| Área | Rutas |
|------|-------|
| App principal | `apps/shelf-inventory/` |
| Docs | `apps/docs/` |
| Config monorepo | `turbo.json`, `pnpm-workspace.yaml` |
| CI/CD | `.github/workflows/` |

## 🎯 Tareas Comunes

```bash
# Desarrollo
pnpm dev
pnpm --dir apps/shelf-inventory dev

# Build
pnpm build

# Lint
pnpm lint
pnpm --dir apps/shelf-inventory exec biome check --write src/
```

## 📌 Reglas

1. TypeScript strict mode
2. data-testid en elementos interactivos
3. Componentes funcionales con hooks
4. Traducciones en archivos de locales
5. Tests E2E para flujos críticos
