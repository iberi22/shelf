## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `apps/shelf-inventory/components/ImportCSVModal.tsx` | ✅ EXISTE | 262 | — |
| `apps/shelf-inventory/lib/csvProductImport.ts` | ✅ EXISTE | 219 | tests/csv-import.spec.ts |

### Funcionalidad ya implementada
- [x] ImportCSVModal.tsx: interactive mapping UI
- [x] lib/csvProductImport.ts: previewCsvHeaders + columnMapping
- [x] tests/csv-import.spec.ts: unit tests para parseo

### Gaps a implementar (lo que FALTA)
- [ ] Si falla la importación parcial, productos ya importados quedan en el inventario
- [ ] No hay rollback transaction — all-or-nothing
- [ ] feature.json gap: "Optional all-or-nothing import rollback"

---

## 📋 Descripción

**Problema:** Data Import CSV (SRC-FUN-014, 94%) importa productos fila por fila. Si una fila falla después de que varias ya se importaron, el inventario queda en estado inconsistente con importación parcial. Los usuarios de bodega necesitan garantía de que la importación es atómica.

**Solución:** Implementar rollback all-or-nothing: snapshot del inventario antes de importar, si cualquier fila falla → restaurar snapshot. Usar `useReducer` dispatch con acción REVERT o directamente reemplazar el array de productos con el snapshot guardado.

**Contexto:** Gap de robustez identificado en features.json. Los 94% actuales ya tienen mapping UI y parseo funcionando; falta la atomicidad.

---

## 🔍 Investigación Web

(Sin investigación web necesaria)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] Al iniciar import, snapshot de productos existentes guardado en estado local
- [ ] Si falla alguna fila después de importar otras → todos los productos de esa importación son revertidos
- [ ] UI muestra "Importación fallida, cambios revertidos" con toast
- [ ] Si todas las filas OK → snapshot descartado, confirmación exitosa
- [ ] `pnpm build` 0 errores
- [ ] Feature en `.gitcore/features.json` SRC-FUN-014 actualizada a 98%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `apps/shelf-inventory/lib/csvProductImport.ts` | modificar | MED | +30 |
| `apps/shelf-inventory/components/ImportCSVModal.tsx` | modificar | MED | +20 |

## 🚫 DO NOT TOUCH

- `apps/shelf-inventory/components/Inventory.tsx` — no tocar

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 3 | J08 | App feature |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls apps/shelf-inventory/lib/csvProductImport.ts` antes de modificar
2. NO inventar APIs — snapshot usa structuredClone del products array
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
| structuredClone no disponible | Usar JSON.parse(JSON.stringify()) como fallback |
| Test de rollback falla | Verificar que los productos originales se restauran |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-FUN-014
agente_asignado: jules
```
