# CLAW-REVIEW.md — Code Review Profundo

> **Proyecto:** shelf-inventory (iberi22/shelf)
> **Fecha:** 2026-06-28
> **Analizados:** 117 archivos TS/TSX, 18,323 líneas de código fuente
> **Test coverage:** 15.1% (3,263 líneas de tests / 30 E2E tests funcionales)

---

## 🔴 CRÍTICOS — Arreglar Inmediatamente

### C-XSS-1: `document.write` en Catalog.tsx
- **Archivo:** `apps/shelf-inventory/components/Catalog.tsx:501`
- **Riesgo:** XSS directo. `document.write()` puede inyectar HTML/JS arbitrario si el contenido no está sanitizado.
- **Fix:** Reemplazar con manipulación DOM segura (createElement, textContent)
- **Prioridad:** 🔴 ALTA

### C-TYPE-1: `@ts-expect-error` sin justificación
- **Archivo:** `hooks/useGoogleDrive.ts` (10 ocurrencias: L14, L19, L22, etc.)
- **Riesgo:** Silencia errores de tipo. Si la API de Google Drive cambia, el código falla en runtime sin previo aviso.
- **Fix:** Tipar correctamente la API de Google Drive o usar `// @ts-expect-error — razón específica`
- **Prioridad:** 🔴 ALTA

### C-TYPE-2: `@ts-expect-error` en AIChat.tsx
- **Archivo:** `components/AIChat.tsx:53, :55`
- **Riesgo:** Similar. Silencia errores de tipado en integración con API de AI.
- **Prioridad:** 🔴 ALTA

---

## 🟡 IMPORTANTES — Mejorar

### I-TYPE-1: Uso excesivo de `as any` (106 ocurrencias en 20 archivos)
- **Top:** `AppContext.tsx` (20), `tests/p2p-helpers.ts` (14), `p2p-three-node-permissions.spec.ts` (14)
- **Riesgo:** Pérdida total de type safety. Cualquier error de tipo se convierte en runtime error.
- **Fix:** Crear interfaces/type guards adecuados. Usar `as` solo para narrow, no para escapar tipos.

### I-TYPE-2: Uso excesivo de `: any` (75 ocurrencias en 28 archivos)
- **Top:** `AppContext.tsx` (10), tests (7 c/u)
- **Riesgo:** Sin type checking en parámetros de contexto. Propaga tipos sueltos.
- **Fix:** Reemplazar con tipos concretos o genéricos.

### I-TYPE-3: `console.log` en producción (13 ocurrencias en 8 archivos)
- **Archivos:** `UpdateNotification.tsx` (4), `AIChat.tsx` (2), `App.tsx` (1), más en tests
- **Riesgo:** Fugas de información, ruido en consola del cliente, performance.
- **Fix:** Reemplazar con logger condicional (solo en dev) o eliminar.

### I-TYPE-4: `!` non-null assertions (33 ocurrencias en 17 archivos)
- **Top:** `AppContext.tsx` (5), `Arqueo.tsx` (3), `P2PSyncManager.tsx` (3)
- **Riesgo:** Si el valor es null/undefined, crash en runtime.
- **Fix:** Usar optional chaining (`?.`) o null checks (`if (x !== null)`).

### I-TYPE-5: Promises sin `.catch()` (12 ocurrencias en 10 archivos)
- **Archivos:** `Inventory.tsx:886`, `P2PSyncManager.tsx:129`, `Settings.tsx:71`, etc.
- **Riesgo:** Unhandled promise rejections — crash o comportamiento indefinido.
- **Fix:** Agregar `.catch(err => console.error(...))` o usar `try/catch` con async/await.

---

## 🟢 MENORES — Bajo Riesgo

### M-TEST-1: Tests Playwright vacíos (19 archivos)
- **Archivos:** `tests/*.spec.ts` — 19 archivos con estructura `describe()` pero **0 tests reales**
- **Riesgo:** Falsa sensación de cobertura. Parece que hay test pero no prueban nada.
- **Fix:** Implementar tests o eliminar los archivos vacíos.

### M-TEST-2: Test coverage bajo (15.1%)
- **Cobertura actual:** 30 tests E2E (Cypress), 0 tests unitarios (Playwright)
- **Target mínimo:** 60% coverage
- **Flujos faltantes:** auth/login, CRUD productos, multi-color/measure, PDF gen, PWA offline

### M-PERF-1: Bundle grande
```
dist/assets/index-mVgG_EOe.js: 7,457 KB (2,582 KB gzip)
dist/assets/react-vendor-BQ97fD0R.js: 381 KB
```
- **Nota:** El index contiene html2canvas (200 KB), lo cual es esperado para la funcionalidad de PDF
- **Recomendación:** Evaluar lazy loading para html2canvas y reportes pesados

### M-LOCK-1: package-lock.json residual (CORREGIDO)
- ✅ Eliminado en commit `dad26f1`

---

## 📊 MÉTRICAS

| Métrica | Valor |
|---------|-------|
| Archivos TS/TSX | 117 |
| Líneas código fuente | 18,323 |
| Líneas tests | 3,263 |
| Coverage | 15.1% |
| Tests E2E funcionales | 30 (Cypress) |
| Tests unitarios funcionales | 0 |
| Test Playwright vacíos | 19 archivos |
| `: any` | 75 en 28 archivos |
| `as any` | 106 en 20 archivos |
| `@ts-expect-error` | 12 en 2 archivos |
| `console.log` en prod | 13 en 8 archivos |
| `!` non-null assertions | 33 en 17 archivos |
| Promises sin catch | 12 en 10 archivos |
| `document.write` | 1 (XSS risk) |

---

## ✅ LO QUE ESTÁ BIEN

- **TypeScript 6.0.3** — versión más reciente ✅
- **React 19.2.6** — con tipos actualizados ✅
- **Vite 8.0.16** — build en 1.90s ✅
- **Vulnerabilidades:** 89 → 7 (1 high de vitepress/vite 5, no afecta prod) ✅
- **Pnpm overrides** configurados correctamente ✅
- **Cypress E2E:** 30 tests funcionales en 12 archivos ✅
- **Código modular:** 48 componentes, 6 hooks, 6 contexts, 11 libs ✅
- **Estructura limpia:** separación clara components/context/hooks/lib/tests ✅
