# CLAUDE.md — Instrucciones para Claude y Agentes de IA en Shelf

**Última actualización:** 2026-07-09
**Versión del proyecto:** 1.2.1

---

## 🎯 Propósito de este archivo

Este archivo define cómo los agentes de IA (Claude Code, OpenCode, Gemini, Jules) deben comportarse al trabajar en el proyecto Shelf. Léelo **antes** de cualquier modificación al código.

---

## 📖 Contexto Obligatorio

Siempre lee estos archivos al comenzar una sesión, en este orden:

1. `AGENTS.md` — Guía general del proyecto (este repositorio)
2. `SOUL.md` — Identidad y personalidad del agente
3. `USER.md` — Perfil de BELA (el usuario)
4. `RULES.md` — Reglas de codificación
5. `.gitcore/ARCHITECTURE.md` — Decisiones arquitectónicas
6. `.gitcore/features.json` — Estado de features
7. `.gitcore/planning/TASK.md` — Tareas activas

---

## ⚠️ Reglas de Oro

| # | Regla | Explicación |
|---|-------|-------------|
| 1 | **No modifiques `.gitcore/ARCHITECTURE.md`** | Solo @architect puede cambiarlo |
| 2 | **Ejecuta `pnpm lint` antes de commitear** | Biome detecta errores de estilo y lógica |
| 3 | **No subas cambios directos a `main`** | Siempre usa feature branches y PRs |
| 4 | **No borres archivos sin preguntar** | Algunos archivos (issue_N.md, PLAN-*.md) son drafts de BELA |
| 5 | **Tests obligatorios** | Código nuevo sin tests no se mergea |
| 6 | **Respeta el offline-first** | No asumas que hay conexión a internet disponible |
| 7 | **Commits con SRC-ID** | Cada commit debe referenciar el feature ID |

---

## 🤖 Modos de Trabajo

### Modo Análisis 🔍
- Lee y entiende antes de escribir código
- Reporta hallazgos con contexto
- Útil para: bugs, refactors complejos, decisiones arquitectónicas

### Modo Implementación 🛠️
- Escribe código directamente
- Incluye tests y documentación
- Útil para: features nuevas, fixes, mejoras

### Modo Revisión 👁️
- Revisa PRs y sugiere mejoras
- Verifica cumplimiento de RULES.md
- Útil para: code review, validación SRC

---

## 🔧 Stack Técnico (Recordatorio)

```yaml
package_manager: pnpm@9.12.0
node_version: ">=20.0.0"
build_system: Turborepo 2
frontend: React 19 + Vite 8 + TypeScript 6
styling: Tailwind CSS 4 + PostCSS + Biome
p2p: PeerJS (WebRTC) + Yjs (CRDT)
crypto: "@noble/post-quantum" (ML-KEM-768, ML-DSA-65)
auth: Firebase Auth
payments: Stripe
deploy: Vercel
testing: Playwright + Cypress
```

---

## 📨 Formato de Comunicación

- Responde en **español** a BELA (código en inglés)
- Usa **markdown** con bloques de código donde aplique
- Para reportes largos, incluye un resumen ejecutivo al inicio
- Si encuentras un bug crítico, menciónalo de inmediato con 🚨

---

## 🚫 Lo que NO debes hacer

- ❌ No ejecutes scripts de producción sin confirmación
- ❌ No modifiques `.env` o credenciales
- ❌ No borres databases locales (`.db`, `*.sqlite3`)
- ❌ No ignores errores de TypeScript
- ❌ No hagas `any` casts sin una razón muy específica
- ❌ No introduzcas dependencias nuevas sin consultar
