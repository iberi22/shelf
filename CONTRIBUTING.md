# CONTRIBUTING.md — Cómo Contribuir a Shelf

**Última actualización:** 2026-07-09

---

## 🌟 Bienvenido

¡Gracias por tu interés en contribuir a Shelf! Este documento te guiará en el proceso.

Shelf es un proyecto **open-source** (MIT) mantenido por BELA. Aceptamos contribuciones de la comunidad.

---

## 🧭 Tipos de Contribución

| Tipo | Descripción | Proceso |
|------|-------------|---------|
| 🐛 Bug Report | Reportar un error | Abrir GitHub Issue |
| 💡 Feature Request | Sugerir nueva funcionalidad | Abrir GitHub Issue con label `enhancement` |
| 🔧 Pull Request | Implementar código | Fork + PR con cambios |
| 📖 Documentación | Mejorar docs | PR en `apps/docs/` o docs del package |
| 🌐 Traducciones | Agregar/mejorar idioma | PR en `apps/shelf-inventory/locales/` |

---

## 🚀 Proceso de Desarrollo

### 1. Fork y Clone
```bash
git clone https://github.com/tu-usuario/shelf.git
cd shelf
pnpm install
```

### 2. Crea una Branch
```bash
git checkout -b feat/nombre-descriptivo
```

### 3. Desarrollo
```bash
# Desarrollo local
pnpm dev

# Lint
pnpm lint

# Build
pnpm build
```

### 4. Tests
```bash
# Tests unitarios del package que modificaste
pnpm --dir packages/edge-mesh test

# PeerServer para tests E2E (nueva terminal)
pnpm peer-server

# Tests E2E
pnpm --dir apps/shelf-inventory exec playwright test
```

### 5. Commit
```bash
git add .
git commit -m "feat(scope): descripción (closes #N)"
```

### 6. Push y PR
```bash
git push origin feat/nombre-descriptivo
# Abre Pull Request en GitHub
```

---

## 📋 Estándares de Código

- **TypeScript strict mode** — no excepciones
- **Biome** para linting y formato
- **data-testid** en elementos interactivos
- **Tests** para código nuevo
- **Commits atómicos** con tipo y scope
- **README** actualizado si cambias API pública

---

## 🔍 Code Review

Todo PR pasa por:
1. **CI checks** (GitHub Actions): lint + build + tests
2. **Code review** por BELA o colaboradores
3. **Auto-merge** si pasa con 70%+ threshold

---

## 📝 Reportar Issues

Usa GitHub Issues con estos templates:

### Bug Report
```
**Descripción:**
**Pasos para reproducir:**
**Comportamiento esperado:**
**Comportamiento actual:**
**Ambiente:** (OS, browser, versión)
**Screenshots:** (si aplica)
```

### Feature Request
```
**Feature:** (qué quieres)
**Motivación:** (por qué es útil)
**Alternativas consideradas:**
**Contexto adicional:**
```

---

## 🤝 Código de Conducta

- **Sé respetuoso** — todos estamos aprendiendo
- **Crítica constructiva** — señala problemas, sugiere soluciones
- **Colaboración** — pregúntanos si tienes dudas
- **Diversidad** — welcome a contributors de cualquier background

---

## 📬 Contacto

- **GitHub**: https://github.com/iberi22/shelf
- **Issues**: https://github.com/iberi22/shelf/issues
- **Discussions**: próximamente

¡Gracias por contribuir a Shelf! 🚀
