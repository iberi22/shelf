## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `apps/shelf-inventory/components/LockScreen.tsx` | ✅ EXISTE | 153 | — |
| `apps/shelf-inventory/lib/localAuth.ts` | ✅ EXISTE | 432 | — |
| `apps/shelf-inventory/lib/webauthn.ts` | ✅ EXISTE | 35 | — |

### Funcionalidad ya implementada
- [x] LockScreen.tsx: pantalla de bloqueo con PIN
- [x] lib/localAuth.ts: password hash, seed, devices, verifyPin
- [x] lib/webauthn.ts: WebAuthn scaffold (credenciales biométricas)

### Gaps a implementar (lo que FALTA)
- [ ] LockScreen no tiene botón/UX para habilitar biometrics (WebAuthn)
- [ ] Flujo PIN + biometrics no está integrado — uno excluye al otro
- [ ] feature.json 88% — falta polish de UX en app lock

---

## 📋 Descripción

**Problema:** LockScreen (SRC-FUN-008, 88%) existe con PIN básico y localAuth soporta WebAuthn, pero no hay UX que permita al usuario habilitar biometrics (huella/face) como alternativa o complemento al PIN. La experiencia de desbloqueo es solo PIN.

**Solución:** Agregar toggle "Usar biometrics" en LockScreen que active WebAuthn (webauthn.ts). Si el dispositivo soporta biometrics, mostrar opción al crear/ingresar PIN. UX: PIN como fallback si biometrics falla (3 intentos → PIN).

**Contexto:** Paso de integrado a hardened para Auth. localAuth.ts ya tiene todo el soporte backend; falta la UX.

---

## 🔍 Investigación Web

(Sin investigación web necesaria)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] LockScreen: toggle "Usar huella/face" que llama `navigator.credentials.create` vía webauthn.ts
- [ ] Si WebAuthn no disponible, toggle oculto o disabled con tooltip
- [ ] Fallback: 3 intentos biometrics fallidos → PIN requerido
- [ ] `pnpm build` 0 errores
- [ ] Feature en `.gitcore/features.json` SRC-FUN-008 actualizada a 93%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `apps/shelf-inventory/components/LockScreen.tsx` | modificar | MED | +50 |
| `.gitcore/features.json` | actualizar SRC-FUN-008 a 93% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `apps/shelf-inventory/lib/localAuth.ts` — no modificar, solo consumir
- `apps/shelf-inventory/lib/webauthn.ts` — no modificar, solo llamar

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 2 | J04 | Auth base, antes de app features |
| 2 | J05 | Misma feature SRC-FUN-008, merge en paralelo |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls apps/shelf-inventory/components/LockScreen.tsx` antes de modificar
2. NO inventar APIs WebAuthn — usar solo navigator.credentials.create/get
3. NO tocar localAuth.ts ni webauthn.ts
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
| WebAuthn no funciona en test | Probar en browser real (WebAuthn requiere HTTPS/localhost seguro) |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-FUN-008
agente_asignado: jules
```
