# TOOLS.md — Notas sobre Herramientas del Proyecto Shelf

**Última actualización:** 2026-07-09

---

## 📦 Package Manager: pnpm

| Comando | Descripción |
|---------|-------------|
| `pnpm install` | Instalar dependencias (usa lockfile) |
| `pnpm add <pkg>` | Agregar dependencia a root |
| `pnpm --filter <workspace> add <pkg>` | Agregar dependencia a workspace específico |
| `pnpm --dir <path> <cmd>` | Ejecutar comando en workspace |
| `pnpm dlx <cmd>` | Ejecutar bin sin instalar |
| `pnpm update --interactive` | Actualizar dependencias interactivamente |

**Importante**: Usar `--frozen-lockfile` en CI. Versión: `pnpm@9.12.0`

---

## 🏗️ Build System: Turborepo

| Comando | Descripción |
|---------|-------------|
| `turbo run dev` | Desarrollo paralelo |
| `turbo run build` | Build con caché |
| `turbo run lint` | Lint paralelo |
| `turbo run format` | Formato paralelo |

Configuración en `turbo.json`. Los outputs se cachean automáticamente.

---

## 🔧 Biome (Linter + Formatter)

```bash
# Lint
npx biome check apps/shelf-inventory/src

# Formato
npx biome format --write apps/shelf-inventory/src

# Lint + fix
npx biome check --write apps/shelf-inventory/src
```

Biome reemplaza ESLint + Prettier. Configuración en `biome.json` dentro de `apps/shelf-inventory`.

---

## 🧪 Testing

### Playwright (E2E edge-mesh)
```bash
pnpm --dir apps/shelf-inventory exec playwright test tests/edge-mesh-sync.spec.ts
```

### Cypress (E2E UI)
```bash
pnpm --dir apps/shelf-inventory exec cypress run
```

### Unit Tests (edge-mesh package)
```bash
pnpm --dir packages/edge-mesh test
```

### Peer Server (necesario para tests P2P)
```bash
pnpm peer-server
# Escucha en http://127.0.0.1:9000
```

---

## 🐙 Git

### Convención de Commits
```
tipo(scope): descripción corta (closes #N)

Tipos: feat, fix, chore, docs, test, refactor, perf, style, build, ci, revert
```

### Husky Hooks
- **pre-commit**: lint-staged → Biome → tsc --noEmit
- **commit-msg**: Validación de formato
- **pre-push**: Tests (si se configura)

---

## 🚀 Vercel

```bash
# Deploy preview (desde PR)
vercel

# Deploy production
vercel --prod
```

Configuración en `vercel.json`:
- `installCommand`: `pnpm install --frozen-lockfile`
- `outputDirectory`: `apps/shelf-inventory/dist`

---

## 🔥 Firebase

```bash
# Login
firebase login

# Emulators locales
firebase emulators:start

# Deploy functions
firebase deploy --only functions
```

---

## 🐳 PeerServer

```bash
# Iniciar servidor peer para desarrollo P2P
pnpm dlx peer --port 9000 --path /
```

**URL local**: `http://127.0.0.1:9000`

---

## 🤖 Agentes de IA

| Herramienta | Uso en Shelf | Comando |
|-------------|-------------|---------|
| OpenCode | Heavy coding tasks | `opencode run --model <model>` |
| Claude Code | Engineering complejo | `claude -p "..." --permission-mode bypassPermissions` |
| Gemini | Análisis profundo / docs | `gemini -p "..." -y` |
| Jules | Issues autónomos | `gh issue edit #N --add-assignee @jules-ai` |
