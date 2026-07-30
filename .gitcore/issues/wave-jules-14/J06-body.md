## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `apps/shelf-inventory/components/AIChat.tsx` | ✅ EXISTE | 380 | — |
| `apps/shelf-inventory/hooks/useWebLLM.ts` | ✅ EXISTE | 103 | — |

### Funcionalidad ya implementada
- [x] AIChat.tsx integrado en Reports.tsx
- [x] useWebLLM hook para WebLLM local
- [x] Gemini API key directa en localStorage
- [x] Gated para usuarios Pro (isPro hardcodeado true)

### Gaps a implementar (lo que FALTA)
- [ ] Sin tests unitarios ni E2E para AI Assistant
- [ ] isPro gate hardcodeado true — no verifica subscriptionTier real
- [ ] Sin quality gates: error handling de WebLLM fallback a Gemini
- [ ] feature.json 86% — el de menor porcentaje de todos

---

## 📋 Descripción

**Problema:** AI Assistant (SRC-FUN-007, 86%) es la feature con menor implementación. El chat funciona pero no tiene tests, el gate Pro es hardcodeado (no verifica tier real), y no hay calidad asegurada para los 3 motores (WebLLM, Gemini Nano, Gemini API key).

**Solución:** Agregar tests unitarios para AIChat (render, mock de useWebLLM, mock de Gemini), tests E2E para flujo de chat, reemplazar isPro hardcodeado con verificación real de SubscriptionContext, y agregar error handling con fallback entre motores.

**Contexto:** Llevar de 86% → 92% requiere tests y quality gates. Es la feature con más gap en cobertura.

---

## 🔍 Investigación Web

(Sin investigación web necesaria)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] Tests unitarios para AIChat.tsx: render, mensaje de usuario, respuesta mock
- [ ] Tests unitarios para useWebLLM.ts: init, send, error
- [ ] isPro gate usa `useContext(SubscriptionContext).tier !== "free"` (no hardcodeado)
- [ ] Error handling: si WebLLM falla → fallback a Gemini (con toast)
- [ ] `pnpm build` 0 errores
- [ ] Feature en `.gitcore/features.json` SRC-FUN-007 actualizada a 92%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `apps/shelf-inventory/components/AIChat.tsx` | modificar | MED | +20 |
| `apps/shelf-inventory/hooks/useWebLLM.ts` | modificar | MED | +15 |
| `apps/shelf-inventory/tests/ai-chat.spec.ts` | CREAR | LOW | +80 |
| `apps/shelf-inventory/tests/use-webllm.spec.ts` | CREAR | LOW | +60 |
| `.gitcore/features.json` | actualizar SRC-FUN-007 a 92% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `apps/shelf-inventory/components/Reports.tsx` — AIChat está integrado, no tocar Reports
- `packages/` — no involucrado

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 3 | J06 | App feature |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls apps/shelf-inventory/components/AIChat.tsx` antes de modificar
2. NO inventar APIs — SubscriptionContext ya tiene tier
3. Tests E2E requieren WebLLM mock (no cargar modelo real)
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
| WebLLM test no corre en CI | Vitest mock de WebLLM, no requiere GPU |
| isPro no encuentra subscription | Verificar SubscriptionContext export |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-FUN-007
agente_asignado: jules
```
