## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `apps/shelf-inventory/components/Sales.tsx` | ✅ EXISTE | 724 | cypress/e2e/sales.cy.ts |
| `apps/shelf-inventory/components/BarcodeScanner.tsx` | ✅ EXISTE | 148 | tests/scanner-lifecycle.spec.ts |
| `apps/shelf-inventory/components/Inventory.tsx` | ✅ EXISTE | — | tests/crud-operations.spec.ts |

### Funcionalidad ya implementada
- [x] Sales.tsx: registro de ventas seleccionando productos del inventario
- [x] Sales.tsx: decremento automático de stock al confirmar venta
- [x] Sales.tsx: historial de ventas con fecha, productos y total
- [x] BarcodeScanner.tsx: escaneo usando cámara del dispositivo
- [x] BarcodeScanner.tsx: parseo automático a campo SKU

### Gaps a implementar (lo que FALTA)
- [ ] Sales y BarcodeScanner no están integrados — no hay flujo scan-to-cart
- [ ] No se puede escanear un producto para agregarlo directo al carrito de venta
- [ ] feature.json gap: "Optional scan-to-cart in Sales"

---

## 📋 Descripción

**Problema:** La feature de ventas (SRC-FUN-002, 97%) y el escáner de códigos de barras (SRC-FUN-006, 90%) existen como componentes independientes pero no están conectados. El vendedor debe buscar manualmente cada producto en la lista de inventario para agregarlo al carrito de venta, en vez de escanearlo directamente.

**Solución:** Integrar BarcodeScanner en el flujo de Sales.tsx: al escanear un código, buscar el producto por SKU en el inventario y agregarlo automáticamente al carrito de venta actual. Si el SKU no existe, mostrar feedback visual de error.

**Contexto:** Este gap es el último pendiente de SRC-FUN-002 para llegar a hardened. Sales ya tiene E2E test pasando y BarcodeScanner tiene test de ciclo de vida.

---

## 🔍 Investigación Web

(Sin investigación web necesaria — integración de componentes existentes)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] BarcodeScanner integrado en Sales.tsx como botón "Escanear" o modal inline
- [ ] Al escanear código válido, producto se agrega inmediatamente al cart de venta
- [ ] Al escanear SKU no existente, mostrar error toast "Producto no encontrado"
- [ ] `pnpm build` 0 errores
- [ ] Feature en `.gitcore/features.json` SRC-FUN-002 actualizada a 99%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `apps/shelf-inventory/components/Sales.tsx` | modificar | MED | +30 |
| `.gitcore/features.json` | actualizar SRC-FUN-002 a 99% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `apps/shelf-inventory/components/BarcodeScanner.tsx` — no modificar el componente, solo reutilizarlo
- `apps/shelf-inventory/components/Inventory.tsx` — no tocar
- `packages/` — no involucrado

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 3 | J02 | App feature, después de core packages |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls apps/shelf-inventory/components/Sales.tsx` antes de modificar
2. NO inventar APIs — ProductContext/SKU lookup usa funciones existentes
3. NO modificar BarcodeScanner.tsx — solo reutilizarlo
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
| SKU lookup no funciona | Verificar `products.find(p => p.sku === scannedSku)` en InventoryContext |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-FUN-002
agente_asignado: jules
```
