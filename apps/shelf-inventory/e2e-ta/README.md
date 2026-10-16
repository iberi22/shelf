# Tester Army e2e suite for Shelf

This directory contains the `@e2e-dev/web` test suite for the Shelf application.

## How to run

The tests use the local development server and do not require a build step. Run them with:

```bash
pnpm --filter shelf-inventory run e2e:ta
```

*(Note: In resource-constrained environments like a sandbox, you may need to use `xvfb-run` to provide a display for the browser if one is not available).*

```bash
xvfb-run pnpm --filter shelf-inventory run e2e:ta
```

## Results of the local run

| Journey | Target (`local`) | Target (`live`) |
|---------|-----------------|----------------|
| 1. App shell opens | Passed | N/A |
| 2. Create product | Passed | N/A |
| 3. Edit product & reload | Passed | N/A |
| 4. Delete product | Passed | N/A |
| 5. Settings opens | Passed | N/A |
| 6. Offline indicator reacts to the browser offline/online events | Passed | N/A |

*Note: The `live` target is omitted as there is no live deployment accessible at this time.*

## Offline coverage (and its limits)

The `e2e-ta` offline journey only dispatches the browser `offline`/`online` events, which
exercises the app's offline indicator (and its recovery) but does **not** cut the network.
Real offline behaviour — network isolation, the offline intent queue and reconnect
syncing — is **not** covered by this suite; it is covered by the repo's Playwright specs,
which use `context.setOffline(true)`:

- `tests/offline-fallback.spec.ts` — P2P offline fallback: offline badge plus local inventory ops while offline.
- `tests/offline-sync.spec.ts` — multi-node sync across an offline → online transition.
- `tests/telemetry.spec.ts` and `tests/errorTracking.spec.ts` — telemetry/error reporting while offline.

Run them with `pnpm test:e2e` (or `pnpm exec playwright test tests/offline-fallback.spec.ts`).

## Bug Bash Personas

For a future agentic bug bash (`e2e explore`), here are 5 persona charters:

1. **Inventory Manager:** Focuses on quickly scanning barcodes, updating stock quantities, and tracking product variations efficiently.
2. **Cashier / Sales Clerk:** Wants to process sales rapidly, add items to the cart, and handle checkout without errors.
3. **Store Admin:** Prioritizes managing team members, setting permissions, and reviewing overall business reports.
4. **Offline User:** Works in a location with unstable internet, relying on local changes and sync mechanisms when reconnected.
5. **Data Auditor:** Concentrates on exporting reports, tracking historical changes, and validating data integrity across modules.
