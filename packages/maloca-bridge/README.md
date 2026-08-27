# @shelf/maloca-bridge

Puente de adaptadores **Maloca** (salud, veeduría, xavier) sobre el runtime
`edge-mesh`. Extraído de `packages/edge-mesh` en **SHELF-215 (D2: scaffold)**.

## Estado

- **D2 (2026-08-26):** scaffol del package + extracción de los 3 adapters
  (`maloca-salud`, `maloca-veeduria`, `maloca-xavier`) y sus tests.
- **Pendiente (D3+):** módulo kernel Maloca (`src/maloca/*`: EventBus,
  EvidentiaManager, PluginRegistry, Karma, gateway) sigue en edge-mesh.
  Ver [ADR-maloca-split](../../docs/ADR-maloca-split.md).

## Uso

```ts
import { EPSBridge, ContractBridge, AgentProfileAdapter } from '@shelf/maloca-bridge';
import { EdgeMesh } from 'edge-mesh';

const mesh = new EdgeMesh(/* config */);
const eps = new EPSBridge(mesh);
```

## Comandos

```bash
pnpm --dir packages/maloca-bridge test
pnpm --dir packages/maloca-bridge build
pnpm --dir packages/maloca-bridge lint
```

## Dependencias

- `edge-mesh` (workspace) — tipos `EdgeMesh`, `NodoId`, `HealthStatus`, etc.
- `yjs` — estructuras CRDT usadas por los adapters de salud.
