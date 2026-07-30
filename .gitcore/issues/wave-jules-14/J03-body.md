## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `apps/shelf-inventory/components/PurchaseOrders.tsx` | ✅ EXISTE | 556 | cypress/e2e/purchase-orders.cy.ts |

### Funcionalidad ya implementada
- [x] Crear orden de compra seleccionando proveedor y productos
- [x] Marcar orden como recibida → stock se incrementa
- [x] Listar órdenes activas e históricas
- [x] Estados: pending, received (falta cancelled)
- [x] Cypress E2E test (create only)

### Gaps a implementar (lo que FALTA)
- [ ] Estado "cancelled" no existe — solo pending | received
- [ ] No hay flujo E2E de receive stock (marcar recibida + verificar incremento)
- [ ] feature.json 94% — gaps de polish residual

---

## 📋 Descripción

**Problema:** PurchaseOrders (SRC-FUN-005, 94%) tiene solo dos estados (pending, received) y no permite cancelar órdenes. El Cypress E2E solo crea órdenes pero no prueba el flujo completo de recepción de stock. Los usuarios necesitan poder cancelar órdenes incorrectas y verificar E2E que al recibir stock se incrementa correctamente.

**Solución:** Agregar estado "cancelled" al type de PurchaseOrder (extender pending/received/cancelled), implementar UI de cancelación con confirmación, y agregar test E2E que verifique el flujo receive → stock incrementa.

**Contexto:** Gap de hardened — tipos incompletos y cobertura E2E parcial. Es el último paso para llevar SRC-FUN-005 a hardened.

---

## 🔍 Investigación Web

(Sin investigación web necesaria)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] PurchaseOrder type extendido: status `"pending" | "received" | "cancelled"` 
- [ ] UI: botón "Cancelar orden" en órdenes pending, con confirm dialog
- [ ] Órdenes canceladas no incrementan stock
- [ ] Test E2E: crear orden → recibir → verificar stock incrementado
- [ ] `pnpm build` 0 errores
- [ ] Feature en `.gitcore/features.json` SRC-FUN-005 actualizada a 98%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `apps/shelf-inventory/components/PurchaseOrders.tsx` | modificar | MED | +40 |
| `.gitcore/features.json` | actualizar SRC-FUN-005 a 98% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `apps/shelf-inventory/components/Inventory.tsx` — no tocar
- `packages/` — no involucrado

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 3 | J03 | App feature |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls apps/shelf-inventory/components/PurchaseOrders.tsx` antes de modificar
2. NO inventar APIs — usar funciones existentes de AppContext
3. NO crear archivos fuera del file island
4. Compilar antes de commitear

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
| `pnpm build` falla | Reportar error exacto |
| Test falla | Verificar que el tipo PurchaseOrder acepta "cancelled" |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-FUN-005
agente_asignado: jules
```
