# @shelf/maloca-bridge

Puente de adaptadores **Maloca** (salud, veeduría, xavier) sobre el runtime
`edge-mesh`. Extraído de `packages/edge-mesh` en **SHELF-215 (D2: scaffold)**.

## Estado

- **Complete (2026-08-26):** extracción de todos los adapters (`maloca-salud`,
  `maloca-veeduria`, `maloca-xavier`) y suite de tests completa.
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
