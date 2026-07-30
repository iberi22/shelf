## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `packages/gpu-agent/src/gpu-agent.ts` | ✅ EXISTE | 515 | — |
| `packages/gpu-agent/tests/gpu-agent.test.ts` | ✅ EXISTE | 106 | — |

### Funcionalidad ya implementada
- [x] gpu-agent.ts: isWebGpuSupported detection, task queue, CPU fallback
- [x] Kernels: vector-sum, dot-product, matrix-scale, echo (CPU path)
- [x] gpu-agent.test.ts: tests para CPU path
- [x] docs/ADR-001-GPU-AGENT.md

### Gaps a implementar (lo que FALTA)
- [ ] No hay kernels WebGPU reales — solo CPU fallback funciona
- [ ] Tests para GPU path (cuando WebGPU disponible)
- [ ] gpu-agent.test.ts tiene solo 106 líneas, cobertura baja
- [ ] feature.json 88% — gap de WebGPU real

---

## 📋 Descripción

**Problema:** GPU Agent (SRC-GPU-001, 88%) existe como package con task queue y CPU fallback, pero los kernels WebGPU reales (WebGPU shaders) no están implementados. El package es solo CPU fallback + scaffold.

**Solución:** Implementar kernels WebGPU reales usando `navigator.gpu` API: compute shaders para vector-sum y matrix-scale. Agregar unit tests para el path WebGPU (mock de GPUAdapter/GPUDevice). Expandir cobertura de tests a >200 líneas.

**Contexto:** Gap de implementación de kernel real — el package se diseñó para WebGPU edge pero nunca se escribieron los shaders. Es el paso necesario para hardened (95%).

---

## 🔍 Investigación Web

(Sin investigación web necesaria — WebGPU API estándar)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] kernelWebGpuSum implementado en gpu-agent.ts con WGSL shader
- [ ] kernelWebGpuScale implementado con WGSL shader
- [ ] Fallback automático: si `navigator.gpu` no disponible → CPU path
- [ ] Unit tests para WebGPU path (mock GPUDevice)
- [ ] Coverage de tests > 200 líneas total en gpu-agent.test.ts
- [ ] `pnpm build` 0 errores
- [ ] `pnpm test:packages` pasa
- [ ] Feature en `.gitcore/features.json` SRC-GPU-001 actualizada a 95%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `packages/gpu-agent/src/gpu-agent.ts` | modificar | MED | +100 |
| `packages/gpu-agent/tests/gpu-agent.test.ts` | modificar | LOW | +100 |
| `.gitcore/features.json` | actualizar SRC-GPU-001 a 95% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `apps/` — no involucrado, es un package reutilizable

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 1 | J09 | Core package, depende de nada |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls packages/gpu-agent/src/gpu-agent.ts` antes de modificar
2. NO inventar APIs WebGPU — usar solo `navigator.gpu`, `GPUDevice.createComputePipeline`
3. WGSL shaders deben ser sintácticamente válidos
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
| WebGPU no disponible en CI | Tests del path GPU deben mockear nvgstor.gpu |
| WGSL compile error | Verificar sintaxis del shader |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-GPU-001
agente_asignado: jules
```
