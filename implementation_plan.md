# Shelf Inventory - Monorepo & P2P Engine Refactor Plan

This plan details the process of migrating the Shelf application into a Turborepo monorepo, extracting the P2P engine into a reusable package, and establishing a separate public repository for documentation using GitHub Pages.

## Phase 1: Estructura del Monorepo (Completed)
- [x] Create `apps/shelf-inventory` and move existing React app files.
- [x] Create `packages/p2p-mesh-core` directory.
- [x] Configure `pnpm-workspace.yaml`.
- [x] Configure `turbo.json` and root `package.json`.

## Phase 2: Extracción del Motor P2P (Completed)
- [x] Move `p2p.ts`, `crypto.ts`, `crypto-pqc.ts`, and `database-sync.ts` logic from `apps/shelf-inventory/lib` to `packages/p2p-mesh-core/src`.
- [x] Move `types.ts` to `packages/p2p-mesh-core/src` so the data model is unified across the ecosystem.
- [x] Implement `index.ts` in `p2p-mesh-core`.
- [x] Update imports inside `apps/shelf-inventory` to use `p2p-mesh-core`.
- [x] Successfully build `p2p-mesh-core` and `shelf-inventory`.

## Phase 3: Documentación Pública (VitePress) y Configuración de Repositorios

### Objetivo
Explicar a fondo la seguridad (PQC, AES-GCM), las lógicas de CRDT (Yjs) y el motor P2P Mesh descentralizado del ecosistema Shelf. Además, separar el código fuente (privado) de la documentación (pública) para que la comunidad pueda auditar y entender el enfoque de Gobernanza de Datos sin exponer el código del negocio.

### Propuesta de Repositorios (Privado vs Público)

Dado que este monorepo contiene el código fuente **privado**, pero los "docs" deben publicarse en GitHub Pages (lo que a menudo requiere un repositorio público si usas planes gratuitos o si deseas código abierto), el enfoque recomendado es:

1. **Mantener `apps/docs` dentro de este monorepo** para facilitar el desarrollo simultáneo (cambios en el core = cambios en la doc).
2. **Despliegue automatizado con GitHub Actions (CI/CD):**
   - Configurar un Action que compile `apps/docs` (`pnpm run docs:build`).
   - El Action empujará los archivos estáticos generados (`apps/docs/.vitepress/dist`) hacia una rama especial `gh-pages` de un **nuevo repositorio público** que crearemos llamado `shelf-docs` (o similar), utilizando un Personal Access Token (PAT).
3. **Privacidad Asegurada:** El código fuente completo (React, Turborepo, p2p-mesh-core) permanece en tu repositorio privado actual. El mundo exterior solo verá el HTML/CSS/JS final y estático alojado en GitHub Pages en el repo público.

### Librerías a Utilizar
- **VitePress:** Herramienta recomendada para documentación técnica estática y rápida (muy similar al look & feel que usa OpenClaw y el ecosistema de Vue/Vite).

### Tareas / Issues a Crear para Completar la Fase 3

1. **[docs] Inicializar VitePress en `apps/docs`**
   - Instalar `vitepress`, `vue` en el workspace `docs`.
   - Crear la estructura `.vitepress/config.ts` con el menú lateral.
2. **[docs] Escribir la sección "Arquitectura y P2P Mesh"**
   - Documentar la topología WebRTC, el descubrimiento de peers y el "Admin Node".
3. **[docs] Escribir la sección "Seguridad y PQC"**
   - Explicar el intercambio de llaves con ML-KEM-768 y firmas ML-DSA-65.
   - Explicar el cifrado en reposo y en tránsito con AES-GCM.
4. **[docs] Escribir la sección "Sincronización CRDT (Yjs)"**
   - Explicar cómo interactúan los clientes sin un servidor central para mantener consistencia eventual.
5. **[docs] Escribir la sección "Gobernanza de Datos"**
   - Aclarar cómo los usuarios controlan qué porciones de datos replican y los permisos segmentados.
6. **[ci] Crear Workflow de GitHub Actions**
   - Archivo `.github/workflows/deploy-docs.yml`.
   - Script que compila y publica en el repositorio público `shelf-docs` -> `gh-pages`.

## Verification Plan

### Automated Tests
- Compilación completa de `pnpm turbo run build`.

### Manual Verification
- Iniciar `pnpm run dev`.
- Verificar que el inventario sincroniza en el navegador simulando dos pestañas (Local P2P mesh).
- Acceder a `http://localhost:5174` (o el puerto que tome VitePress) para previsualizar y validar la redacción técnica.
