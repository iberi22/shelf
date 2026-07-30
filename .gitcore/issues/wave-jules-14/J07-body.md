## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `apps/shelf-inventory/locales/en.json` | ✅ EXISTE | 640 | — |
| `apps/shelf-inventory/locales/es.json` | ✅ EXISTE | 668 | — |

### Funcionalidad ya implementada
- [x] 20 archivos de locales en apps/shelf-inventory/locales/
- [x] I18nContext.tsx con LanguageSelector
- [x] Toggle EN/ES/PT en settings

### Gaps a implementar (lo que FALTA)
- [ ] Strings hardcodeados en componentes que no usan i18n
- [ ] Secondary locales (no EN/ES/PT) pueden tener traducciones incompletas
- [ ] feature.json 90% — gap de cobertura de internacionalización

---

## 📋 Descripción

**Problema:** Multi-language (SRC-FUN-010, 90%) tiene 20 locales pero strings hardcodeados en español/inglés persisten en varios componentes. Usuarios que seleccionan un locale secundario ven mezcla de idiomas.

**Solución:** Hacer un sweep de todos los componentes de la app para encontrar strings hardcodeados sin `t()` wrapper, reemplazarlos con claves de traducción, y actualizar los archivos de locales faltantes. Priorizar EN/ES/PT (los 3 principales).

**Contexto:** Gap de polish para producción. Los 20 locales existen pero la cobertura no es pareja; este sweep lleva la feature a 96%.

---

## 🔍 Investigación Web

(Sin investigación web necesaria)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] `grep -r '"[A-Z]' apps/shelf-inventory/components/ --include='*.tsx'` sin falsos positivos de UI text
- [ ] EN/ES/PT locales actualizados con todas las claves nuevas
- [ ] `pnpm build` 0 errores
- [ ] `pnpm test:packages` pasa
- [ ] Feature en `.gitcore/features.json` SRC-FUN-010 actualizada a 96%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `apps/shelf-inventory/locales/en.json` | modificar | MED | +20 |
| `apps/shelf-inventory/locales/es.json` | modificar | MED | +20 |
| `apps/shelf-inventory/locales/pt.json` | modificar | MED | +20 |
| `apps/shelf-inventory/components/*.tsx` | modificar (varios) | LOW | ~5 c/u |

## 🚫 DO NOT TOUCH

- `packages/` — no involucrado
- Locales que no sean EN/ES/PT — solo actualizar los 3 principales

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 4 | J07 | Cross-cutting, después de app features |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar cada componente antes de modificar: `head -5 apps/shelf-inventory/components/X.tsx`
2. NO inventar traducciones — buscar strings existentes en locale files primero
3. NO tocar packages/
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
| Traducción faltante | Agregar clave al locale file en lugar de dejar string suelto |
| Build error por import | Verificar ruta de import de locales |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-FUN-010
agente_asignado: jules
```
