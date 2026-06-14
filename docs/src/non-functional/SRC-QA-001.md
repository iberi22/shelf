# SRC-QA-001: Testing Infrastructure

- **ID:** SRC-QA-001
- **Name:** Testing Infrastructure
- **Priority:** P1 (Important)
- **Status:** Implemented
- **Category:** QA (Quality Assurance)
- **SDLC:** Production

## Description

Shelf uses unit, package, and browser E2E tests to protect the offline-first synchronization model. The Edge Mesh work adds targeted Playwright coverage for cross-browser CRDT replication and data security.

## Primary Actor

Developer maintaining synchronization, security, and offline-first workflows.

## Dependencies

- **SRC-P2P-001** (P2P Mesh Network)
- **SRC-CRDT-001** (CRDT Sync)
- **SRC-EDGE-001** (Edge Mesh Runtime)

## User Story

> Como desarrollador, quiero pruebas automatizadas que detecten regresiones de sincronizacion y seguridad antes de desplegar.

## Acceptance Criteria

1. Unit/package tests cover `@shelf/edge-mesh`.
2. Playwright validates two-browser synchronization.
3. Playwright validates unauthorized local mutations.
4. Playwright validates unauthorized remote Edge Mesh mutations and CRDT reverts.
5. Playwright can target a configurable base URL with `PLAYWRIGHT_BASE_URL`.
6. Local-only harnesses expose deterministic state for E2E without leaking to production.
7. Biome remains the formatter/linter for TypeScript changes.
8. CI/CD remains configured through GitHub Actions and Vercel.

## Technical Stack

| Technology | Use |
| --- | --- |
| Vitest | Package tests |
| Playwright | Browser E2E tests |
| Biome | Linting and formatting |
| GitHub Actions | CI jobs |
| Vercel | Preview and main deployments |

## Tests Implemented

| Test | Description |
| --- | --- |
| `packages/edge-mesh/tests/*.test.ts` | Core Edge Mesh package behavior |
| `apps/shelf-inventory/tests/edge-mesh-sync.spec.ts` | Edge Mesh CRDT update import/export and remote mutation rejection |
| `apps/shelf-inventory/tests/security-sync.spec.ts` | Local unauthorized mutation blocking |
| `apps/shelf-inventory/tests/p2p-sync.spec.ts` | Existing P2P sync compatibility |

## Canonical Commands

```bash
pnpm build
pnpm --dir packages/edge-mesh test
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5187 pnpm --dir apps/shelf-inventory exec playwright test tests/edge-mesh-sync.spec.ts tests/security-sync.spec.ts tests/p2p-sync.spec.ts --project=chromium --reporter=list --config=playwright.config.ts --workers=1
```

## Known CI Operational Note

GitHub Actions can fail before running jobs if repository billing or spending limits block hosted runners. That condition is external to the code and appears as an annotation on `.github` with no job steps.

## Related Commits

```text
test: add edge mesh e2e sync and security coverage
```
