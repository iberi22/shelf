## 🧐 Fase 0: Codebase Verification (OBLIGATORIO)

<!-- Verificado: 2026-07-30 contra commit a8f1667 -->

**Estado Actual del Código (VERIFICADO):**

| Archivo | Estado | Líneas | Tests |
|---------|--------|--------|-------|
| `packages/edge-mesh/src/edge-mesh.ts` | ✅ EXISTE | 712 | 214 unit tests |
| `packages/edge-mesh/src/protocol/index.ts` | ✅ EXISTE | 154 | tests/protocol/index.test.ts |
| `packages/edge-mesh/tests/edge-mesh.test.ts` | ✅ EXISTE | 125 | — |
| `packages/edge-mesh/tests/protocol/index.test.ts` | ✅ EXISTE | 115 | — |

### Funcionalidad ya implementada
- [x] EdgeMesh runtime con namespaces por tipo de entidad
- [x] Broadcast de updates CRDT como deltas codificados
- [x] Authz y ACL remota
- [x] 214 unit tests pasando
- [x] EDGE_MESH_ENVELOPE dual-ready encrypt

### Gaps a implementar (lo que FALTA)
- [x] requireSignedEnvelopes es opcional en el path de edge-mesh
- [ ] No hay enforcement de firmas en envelopes — mensajes no firmados son aceptados
- [ ] feature.json gap: "requireSignedEnvelopes still optional on edge-mesh path"

---

## 📋 Descripción

**Problema:** Edge Mesh (SRC-EDGE-001, 88%) tiene envelopes opcionales pero no enforce que los mensajes entrantes estén firmados (ML-DSA-65). Un peer malicioso podría inyectar mensajes no firmados y serían procesados igual.

**Solución:** Agregar opción `requireSignedEnvelopes` al config de EdgeMesh que, cuando es true, rechaza mensajes sin firma ML-DSA-65 válida. Agregar unit tests para el enforcement. Mantener compatibilidad hacia atrás (default false para no romper peers existentes).

**Contexto:** Gap de seguridad hardening. La crypto PQC (ML-DSA-65) ya está implementada en p2p-mesh-core, pero edge-mesh no requiere firmas. Este es el paso para hardened (93%).

---

## 🔍 Investigación Web

(Sin investigación web necesaria)

---

## 🎯 Acceptance Criteria (VERIFICABLES)

- [ ] `EdgeMeshConfig.requireSignedEnvelopes?: boolean` agregado al constructor
- [ ] Si true, envelopes entrantes sin firma ML-DSA-65 son rechazados con error
- [ ] Si false, comportamiento actual (backwards compatible)
- [ ] Unit test: mensaje sin firma → rechazado cuando requireSignedEnvelopes=true
- [ ] Unit test: mensaje con firma válida → aceptado
- [ ] `pnpm build` 0 errores
- [ ] `pnpm test:packages` pasa
- [ ] Feature en `.gitcore/features.json` SRC-EDGE-001 actualizada a 93%

---

## 📁 File Island

| Archivo | Cambio | Riesgo | Líneas |
|---------|--------|--------|--------|
| `packages/edge-mesh/src/edge-mesh.ts` | modificar | MED | +25 |
| `packages/edge-mesh/tests/edge-mesh.test.ts` | modificar | LOW | +40 |
| `.gitcore/features.json` | actualizar SRC-EDGE-001 a 93% | LOW | +1 |

## 🚫 DO NOT TOUCH

- `packages/p2p-mesh-core/` — no tocar
- `apps/` — no involucrado

---

## 🧩 Dependencias & Merge Order

| Orden | Issue | Razón |
|-------|-------|-------|
| 1 | J10 | Core package, merge en paralelo con J09/J12/J13 |

---

## 🤖 Agent Assignment

| Aspecto | Asignación |
|---------|-----------|
| **Label** | `jules` |
| **Agente** | Jules (async mode) |

---

## 🛡️ Anti-Hallucination Guard

1. Verificar: `ls packages/edge-mesh/src/edge-mesh.ts` antes de modificar
2. NO inventar APIs — ML-DSA-65 verify está en crypto-pqc.ts
3. Default debe ser false (backwards compatible)
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
| crypto-pqc no tiene verify export | Verificar imports en p2p-mesh-core |
| Test falla por mock | Ajustar mock de firma ML-DSA-65 |

---

## 📍 Metadata

```yaml
generado: 2026-07-30
origen: shelf-grok-analysis
wave: wave-J
tipo: feature
feature_id: SRC-EDGE-001
agente_asignado: jules
```
