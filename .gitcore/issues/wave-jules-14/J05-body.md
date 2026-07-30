## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `apps/shelf-inventory/components/DeviceManagementPanel.tsx` | ✅ EXISTE | 150 | — |
| `apps/shelf-inventory/lib/localAuth.ts` | ✅ EXISTE | 432 | — |

### Funcionalidad ya implementada
- [x] DeviceManagementPanel.tsx: lista de dispositivos autorizados
- [x] lib/localAuth.ts: seed recovery, devices array, removeDevice

### Gaps a implementar (lo que FALTA)
- [ ] DeviceManagementPanel no tiene UI de revocación funcional (botón "Revocar")
- [ ] No hay confirmación visual antes de revocar un dispositivo
- [ ] feature.json 88% — UX de device management incompleta

---

## 📋 Description

**Problema:** DeviceManagementPanel (SRC-FUN-008, 88%) muestra la lista de dispositivos pero no implementa la revocación real con UI. El usuario no puede eliminar dispositivos autorizados desde la interfaz, solo desde la capa de datos (localAuth.removeDevice no tiene binding UX).

**Solución:** Agregar botón "Revocar" por cada dispositivo en DeviceManagementPanel con confirm dialog, conectarlo a localAuth.removeDevice(), y mostrar feedback visual de éxito/error.

**Contexto:** Gap UX de seguridad. La función removeDevice existe en localAuth pero no está expuesta en la UI. Esto es requerido para hardened de device security.

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] Cada dispositivo en DeviceManagementPanel tiene botón "Revocar" con icono
- [ ] Click "Revocar" → confirm dialog "¿Revocar [device name]?"
- [ ] Confirmar → llama localAuth.removeDevice() → dispositivo desaparece de lista
- [ ] Toast/snackbar de confirmación "Dispositivo revocado"
- [ ] `pnpm build` 0 errores
- [ ] Feature en `.gitcore/features.json` SRC-FUN-008 actualizada a 93%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `apps/shelf-inventory/components/DeviceManagementPanel.tsx` | modificar | LOW | +25 |
| `.gitcore/features.json` | actualizar SRC-FUN-008 a 93% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `apps/shelf-inventory/lib/localAuth.ts` — removeDevice ya existe, no modificar
- `apps/shelf-inventory/components/LockScreen.tsx` — issue separado J04

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 2 | J05 | Auth base, paralelo con J04 |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls apps/shelf-inventory/components/DeviceManagementPanel.tsx` antes de modificar
2. NO inventar APIs — localAuth.removeDevice ya existe
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
| removeDevice no existe | Verificar localAuth.ts export list |
| Test falla | Verificar mock de localAuth en test |

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
