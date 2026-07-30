## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `.github/workflows/ci.yml` | ✅ EXISTE | — | — |
| `~35 Playwright specs` | ✅ EXISTE | — | — |
| `16 Cypress E2E` | ✅ EXISTE | — | — |
| `214 edge-mesh unit tests` | ✅ EXISTE | — | — |

### Funcionalidad ya implementada
- [x] Playwright specs (~35)
- [x] Cypress E2E (16) + 1 component
- [x] edge-mesh 214 unit tests
- [x] p2p-mesh-core unit tests
- [x] Pre-push build hook green
- [x] GitHub Actions workflow existe

### Gaps a implementar (lo que FALTA)
- [ ] GHA jobs a veces empty-fail (infra runner issues)
- [ ] No hay coverage gates configurados
- [ ] No hay reporte de coverage en CI
- [ ] feature.json 87% — reliability y coverage

---

## 📋 Descripción

**Problema:** Testing Infrastructure (SRC-QA-001, 87%) tiene muchos tests pero la CI (GitHub Actions) es poco confiable — jobs empty-fail por problemas de runner. No hay coverage gates que eviten merge si baja la cobertura.

**Solución:** Hardenedear CI: agregar vitest/istanbul coverage report, configurar coverage gate (mínimo 70%), arreglar GHA workflow para evitar empty-fails (cache de dependencias, timeouts realistas), y agregar status badge coverage en README.

**Contexto:** Gap de calidad infra — los tests existen pero sin gates de cobertura ni CI confiable. Llevar a 94% requiere reliability y gates.

---

## 🔍 Investigación Web

(Sin investigación web necesaria)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] GHA workflow corre sin empty-fails (cache pnpm store, step timeouts)
- [ ] Coverage gate configurado: `pnpm test:coverage` falla si < 70%
- [ ] Coverage badge en README.md (codecov o simple JSON)
- [ ] `pnpm test:coverage` genera reporte HTML
- [ ] `pnpm build` 0 errores
- [ ] Feature en `.gitcore/features.json` SRC-QA-001 actualizada a 94%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|--------|--------|--------|--------|
| `.github/workflows/ci.yml` | modificar | MED | +15 |
| `vitest.config.ts` o `package.json` | modificar | MED | +5 |
| `README.md` | modificar | LOW | +2 |

## 🚫 DO NOT TOUCH

- `apps/` — no involucrado
- `packages/` — tests ya existen, no modificar

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 4 | J11 | Cross-cutting infra, después de features |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls .github/workflows/ci.yml` antes de modificar
2. NO inventar herramientas de coverage — vitest ya tiene `--coverage`
3. NO tocar archivos de source ni tests
4. Compilar antes de commitear

---

## ✅ Verification (POST-ejecución)

```bash
pnpm build
pnpm test:coverage -- --reporter text
pnpm test:packages
git status --short
```

## 🔄 Failure Recovery

| Si pasa esto | Acción |
|-------------|--------|
| `pnpm test:coverage` falla | Verificar que vitest tiene @vitest/coverage-v8 instalado |
| GHA workflow no corre | Verificar syntax YAML |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-QA-001
agente_asignado: jules
```
