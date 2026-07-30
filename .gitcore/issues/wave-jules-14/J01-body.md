## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `apps/shelf-inventory/components/Dashboard.tsx` | ✅ EXISTE | 178 | — |
| `apps/shelf-inventory/components/ProChartsTeaserCard.tsx` | ✅ EXISTE | 322 | — |
| `apps/shelf-inventory/components/Reports.tsx` | ✅ EXISTE | — | tests/reports-export.spec.ts |
| `apps/shelf-inventory/components/Sales.tsx` | ✅ EXISTE | 724 | cypress/e2e/sales.cy.ts |

### Funcionalidad ya implementada
- [x] Dashboard.tsx con tarjetas de métricas (Revenue, Profit, Ventas totales, Productos)
- [x] ProChartsTeaserCard.tsx con datos demo hardcodeados
- [x] Reports.tsx con gráficos chart.js reales y top products
- [x] Dashboard personalizable vía settings

### Gaps a implementar (lo que FALTA)
- [ ] Dashboard no usa datos reales de ventas — ProChartsTeaserCard usa demos
- [ ] No hay conexión entre Sales.tsx y Dashboard.tsx — los gráficos del dashboard no reflejan ventas reales
- [ ] feature.json marca Dashboard al 92% — falta integración de charts reales

---

## 📋 Descripción

**Problema:** El Dashboard (src-fun-003) muestra tarjetas de resumen correctas, pero los gráficos de ventas en ProChartsTeaserCard.tsx usan datos demo hardcodeados en vez de datos reales del contexto de ventas. Los dueños de negocio no pueden ver tendencias reales de revenue/profit.

**Solución:** Reemplazar datos demo en ProChartsTeaserCard.tsx con datos reales desde AppContext (sales state + calculateRevenue/profit). Conectar el chart.js existente en Reports.tsx al dashboard para que muestre ventas en el tiempo con datos reales. Mantener la tarjeta de top products sincronizada con el historial de ventas.

**Contexto:** El módulo Sales (SRC-FUN-002) ya está al 97% con E2E tests pasando. Los datos de ventas existen en AppContext vía ADD_SALE action. El dashboard es la interfaz principal del dueño de negocio y debe reflejar datos reales, no demos.

---

## 🔍 Investigación Web

(Sin investigación web necesaria — gaps documentados en features.json, datos de ventas ya existen en AppContext)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] ProChartsTeaserCard.tsx consume sales de AppContext en vez de datos demo — verificar que `useContext(AppContext)` reemplaza `const demoData = [...]`
- [ ] Revenue y Profit en los gráficos del dashboard coinciden con cálculos del sales reducer
- [ ] Top products en dashboard usa historial real de ventas (Agregar/SALE reducer)
- [ ] `pnpm build` 0 errores
- [ ] `pnpm test:packages` pasa
- [ ] Feature en `.gitcore/features.json` SRC-FUN-003 actualizada a 97%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `apps/shelf-inventory/components/ProChartsTeaserCard.tsx` | modificar | MED | ~30 |
| `apps/shelf-inventory/components/Dashboard.tsx` | modificar | LOW | ~10 |
| `.gitcore/features.json` | actualizar SRC-FUN-003 a 97% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `apps/shelf-inventory/components/Reports.tsx` — ya tiene chart.js real working, no modificarlo
- `apps/shelf-inventory/components/Sales.tsx` — no tocar, está hardened
- `packages/` — no involucrado en este issue

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 3 | J01 | App feature, depende de core packages estables |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar antes de asumir: `ls apps/shelf-inventory/components/ProChartsTeaserCard.tsx` antes de decidir si existe
2. NO inventar APIs — AppContext ya tiene sales y calculateRevenue
3. NO crear archivos fuera del file island
4. Compilar antes de commitear: `pnpm build` 0 errores

---

## ✅ Verification (POST-ejecución)

```bash
pnpm build
pnpm test:packages
git status --short
```

## 🔄 Failure Recovery

| Si pasa esto | Acción |
|-------------|--------|
| `pnpm build` falla | Reportar error exacto, no commitear código roto |
| Test falla | Arreglar o ajustar supuesto |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-FUN-003
agente_asignado: jules
```
