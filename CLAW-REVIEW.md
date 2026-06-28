# CLAW-REVIEW.md — Code Review Profundo

> **Proyecto:** shelf-inventory (iberi22/shelf)
> **Fecha:** 2026-06-28 | **Última actualización:** 2026-06-28
> **Analizados:** 117 archivos TS/TSX, 18,323 líneas de código fuente
> **Estado:** 🛠️ Corrección en progreso

---

## 🔴 CRÍTICOS — Arreglar Inmediatamente

### C-XSS-1: `document.write` en Catalog.tsx
- **Archivo:** `apps/shelf-inventory/components/Catalog.tsx:501`
- **Estado:** ⚠️ **INVESTIGADO** — Usa `escapeHtml()` en todos los datos antes de escribirlos. No es XSS real pero es mala práctica. Pendiente migrar a DOM API.
- **Riesgo:** Bajo. Todos los datos se escapan con `escapeHtml()` antes de inyectarse.

### C-TYPE-1: `@ts-expect-error` sin justificación
- **Archivo:** `hooks/useGoogleDrive.ts` (10 ocurrencias)
- **Estado:** ✅ **CORREGIDO** (commit `d0c8590`)
- **Fix:** Se creó `types/gapi.d.ts` con declaraciones de tipos para `window.gapi` y `window.google.accounts.oauth2`. Los 10 `@ts-expect-error` fueron removidos.

### C-TYPE-2: `@ts-expect-error` en AIChat.tsx
- **Archivo:** `components/AIChat.tsx:53, :55`
- **Estado:** ✅ **CORREGIDO** (commit `d0c8590`)
- **Fix:** Se amplió la interfaz `Window` en `types/globals.d.ts` para incluir `window.ai` (Built-in AI API experimental).

---

## 🟡 IMPORTANTES — Mejorar

### I-TYPE-1: Uso excesivo de `as any` (106 ocurrencias en 20 archivos)
- **Top:** `AppContext.tsx` (20), `tests/p2p-helpers.ts` (14), `p2p-three-node-permissions.spec.ts` (14)
- **Estado:** 🛠️ **EN PROGRESO** — Subagente trabajando en AppContext.tsx: type guards para `hasPayloadWithId`, helper `getCollection`, extensión de Window para test globals.
- **Fix:** Crear interfaces/type guards adecuados. Sin `as any` para escapar tipos.

### I-TYPE-2: Uso excesivo de `: any` (75 ocurrencias en 28 archivos)
- **Top:** `AppContext.tsx` (10), tests (7 c/u)
- **Estado:** 🛠️ **EN PROGRESO** — Se aborda junto con I-TYPE-1.
- **Fix:** Reemplazar con tipos concretos o genéricos.

### I-TYPE-3: `console.log` en producción (13 ocurrencias en 8 archivos)
- **Archivos:** `UpdateNotification.tsx` (4), `AIChat.tsx` (2), `App.tsx` (1), más en tests
- **Estado:** 🛠️ **EN PROGRESO** — Subagente trabajando en `discovery.ts`. Tests se dejan intencionalmente (logs de debug en CI).
- **Fix:** Reemplazar con logger condicional (`if (import.meta.env.DEV)`).

### I-TYPE-4: `!` non-null assertions (33 ocurrencias en 17 archivos)
- **Top:** `AppContext.tsx` (5), `Arqueo.tsx` (3), `P2PSyncManager.tsx` (3)
- **Estado:** 🛠️ **EN PROGRESO** — Subagentes trabajando en Arqueo.tsx y P2PSyncManager.tsx.
- **Fix:** Usar optional chaining (`?.`) o null checks (`if (x !== null)`).

### I-TYPE-5: Promises sin `.catch()` (12 ocurrencias en 10 archivos)
- **Archivos:** `Inventory.tsx:886`, `P2PSyncManager.tsx:129`, `Settings.tsx:71`, etc.
- **Estado:** 🛠️ **EN PROGRESO** — Subagente revisando y agregando `.catch()`.
- **Fix:** Agregar `.catch()` o envolver en `try/catch`.

---

## 🟢 MENORES — Bajo Riesgo

### M-TEST-1: Tests Playwright vacíos (19 archivos)
- **Archivos:** `tests/*.spec.ts` — 19 archivos con estructura `describe()` pero **0 tests reales**
- **Estado:** 🛠️ **EN PROGRESO** — Subagente agregando `describe.skip()` + comentarios `@jules`.
- **Fix:** Marcar como skip para Jules o implementar tests reales.

### M-TEST-2: Test coverage bajo (15.1%)
- **Cobertura actual:** 30 tests E2E (Cypress), 0 tests unitarios (Playwright)
- **Target mínimo:** **Nuevo objetivo: 40% coverage** (incremental, no saltar a 60%)
- **Estado:** ⏳ **PENDIENTE** — Depende de M-TEST-1.

### M-PERF-1: Bundle grande
- **Estado:** ⏳ **PENDIENTE** — Requiere análisis de webpack-bundle-analyzer.
- **Recomendación:** Evaluar lazy loading para html2canvas y reportes pesados.

### M-LOCK-1: package-lock.json residual
- **Estado:** ✅ **CORREGIDO** (commit `dad26f1`)

---

## 🔒 VULNERABILIDADES

| Estado | Dev/Prod | Antes | Ahora |
|--------|----------|-------|-------|
| ✅ | Producción | 89 | **0** |
| 🟡 | Full (con dev) | 89 | **5** (1 low, 3 moderate, 1 high — solo deps vercel/vitepress) |

**Vulnerabilidades restantes (solo dev/build):**
- vercel > @vercel/fun > @tootallnate/once — low, no afecta prod
- vercel > @vercel/python-analysis > js-yaml — moderate, no afecta prod  
- vitepress > vite — 3 vulns (high + 2 moderate), solo si expones dev server a la red

---

## 📊 MÉTRICAS ACTUALIZADAS

| Métrica | Antes | Ahora | Target |
|---------|-------|-------|--------|
| `@ts-expect-error` | 12 en 2 archivos | **0** ✅ | 0 |
| `console.log` en prod | 13 en 8 archivos | 🛠️ | 0 |
| `!` non-null assertions | 33 en 17 archivos | 🛠️ | <10 |
| Promises sin catch | 12 en 10 archivos | 🛠️ | 0 |
| `as any` | 106 en 20 archivos | 🛠️ | <30 |
| `: any` | 75 en 28 archivos | 🛠️ | <20 |
| `document.write` | 1 (XSS risk) | ⚠️ Investigado | 0 |
| Tests vacíos | 19 archivos | 🛠️ | 0 |
| Vulnerabilidades prod | 89 | **0** ✅ | 0 |

---

## 📋 PLAN DE ACCIÓN RESTANTE

| # | Tarea | Responsable | Estado |
|---|-------|-------------|--------|
| 1 | ✅ Tipos para gapi + window.ai + remover @ts-expect-error | CLAW | ✅ Done |
| 2 | ✅ Bump overrides (smol-toml, dompurify, js-yaml) | CLAW | ✅ Done |
| 3 | 🛠️ `as any` en AppContext.tsx | Subagente | In progress |
| 4 | 🛠️ console.log en prod | Subagente | In progress |
| 5 | 🛠️ Promises sin .catch() | Subagente | In progress |
| 6 | 🛠️ `!` non-null assertions | Subagente | In progress |
| 7 | 🛠️ Tests vacíos → skip + @jules | Subagente | In progress |
| 8 | ⏳ Migrar document.write a DOM API | CLAW | Pending |
| 9 | ⏳ `as any` en tests | CLAW | Pending |
| 10 | ⏳ Bundle performance | CLAW | Pending |

---

## ✅ LO QUE ESTÁ BIEN

- **TypeScript 6.0.3** — versión más reciente ✅
- **React 19.2.6** — con tipos actualizados ✅
- **Vite 8.0.16** — build en 1.90s ✅
- **Vulnerabilidades prod:** 89 → 0 (gracias a overrides) ✅
- **Pnpm overrides** configurados correctamente ✅
- **Cypress E2E:** 30 tests funcionales en 12 archivos ✅
- **Código modular:** 48 componentes, 6 hooks, 6 contexts, 11 libs ✅
- **Estructura limpia:** separación clara components/context/hooks/lib/tests ✅
- **Nuevos tipos:** `gapi.d.ts` + `globals.d.ts` para APIs externas ✅
