# BOOTSTRAP.md — Primera Ejecución para Agente Nuevo en Shelf

**Última actualización:** 2026-07-18

---

## 🚀 Checklist de Inicio Rápido

Sigue estos pasos **exactamente en este orden** cuando entres al proyecto por primera vez.

### Paso 1: Lee los archivos de identidad
```bash
cat AGENTS.md         # Guía del proyecto
cat SOUL.md           # Quién eres como agente
cat USER.md           # Quién es BELA
cat CLAUDE.md         # Instrucciones para agentes
cat RULES.md          # Reglas de codificación
```

### Paso 2: Lee la arquitectura
```bash
cat .gitcore/ARCHITECTURE.md   # Stack, patrones, capas
cat .gitcore/features.json     # 21 features implementados
```

### Paso 3: Revisa el estado actual
```bash
cat .gitcore/planning/TASK.md   # Tareas activas del sprint
cat MEMORY.md                   # Memoria persistente
cat TASK.md                     # Tareas de Harness Engineering
```

### Paso 4: Configura el entorno local
```bash
# Copiar variables de entorno
cp .env.example .env

# Instalar dependencias
pnpm install

# Verificar que todo compila
pnpm build
```

### Paso 5: Ejecuta tests para verificar estado
```bash
# PeerServer para tests P2P
pnpm peer-server &

# Tests de edge-mesh
pnpm --dir packages/edge-mesh test

# Lint check
pnpm lint
```

---

## 🧪 Verificación de Sanidad

```bash
echo "=== Node Version ===" && node -v
echo "=== pnpm Version ===" && pnpm -v
echo "=== Git Status ===" && git status
echo "=== Branch ===" && git branch --show-current
echo "=== Workspaces ===" && pnpm list -r --depth=0
```

---

## 📍 Rutas Importantes

| Recurso | Ruta |
|---------|------|
| App principal | `apps/shelf-inventory/` |
| Edge Mesh | `packages/edge-mesh/` |
| P2P Legacy | `packages/p2p-mesh-core/` |
| Docs VitePress | `apps/docs/` |
| Tests E2E | `apps/shelf-inventory/tests/` |
| GitHub Workflows | `.github/workflows/` |
| SRC Docs | `docs/src/` |
| Skills | `skills/` |

---

## ❓ Si te atoras

1. **Build falla**: Revisa `pnpm-lock.yaml` → `pnpm install --frozen-lockfile`
2. **Tests P2P fallan**: ¿El PeerServer está corriendo en puerto 9000?
3. **TypeScript errors**: `cd apps/shelf-inventory && npx tsc --noEmit`
4. **Biome errors**: `npx biome check --write apps/shelf-inventory/src`
5. **Todo lo demás**: Pregunta a BELA directamente

---

## 🏁 ¡Listo!

Ya estás listo para trabajar. Recuerda:

- ✅ Trabaja en feature branches, no en `main`
- ✅ Commits atómicos con referencia SRC-ID
- ✅ Tests antes de PR
- ✅ `pnpm lint` antes de commit
- ✅ Pregunta si hay dudas arquitectónicas
