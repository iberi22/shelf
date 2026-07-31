# Testing Guide

This document explains how to run the Shelf monorepo test suite — unit tests,
type checking, and end-to-end (E2E) tests — on different platforms.

---

## Prerequisites

```bash
# Install dependencies (from repo root)
pnpm install
```

---

## Unit Tests

### Package tests (`edge-mesh`, `p2p-mesh-core`, `gpu-agent`)

```bash
# All packages at once
pnpm run test:packages

# Individual package
pnpm --dir packages/edge-mesh test
pnpm --dir packages/p2p-mesh-core test
pnpm --dir packages/gpu-agent test
```

### App unit tests (`shelf-inventory`)

```bash
cd apps/shelf-inventory
pnpm test:unit          # vitest run lib api
```

### Component tests (Cypress)

```bash
cd apps/shelf-inventory
pnpm test:ct            # cypress run --component
```

### Run everything at once

```bash
cd apps/shelf-inventory
pnpm test               # unit + ct + e2e
```

---

## Type Checking

```bash
cd apps/shelf-inventory
npx tsc --noEmit
```

---

## E2E Tests (Playwright)

The E2E suite tests the full application with two browser windows
(two peers) connected via a PeerJS server, simulating a real P2P
sync scenario.

### On Ubuntu / macOS / CI (standard Playwright)

This uses the default `playwright.config.ts` which downloads and
manages its own Chromium binary.

```bash
cd apps/shelf-inventory

# Install browsers (first time only)
npx playwright install --with-deps chromium

# Run all E2E tests (starts dev servers + peer-server automatically)
pnpm test:e2e

# Run only desktop (chromium) tests
pnpm test:e2e:desktop

# Run only mobile tests
pnpm test:e2e:mobile

# Run only tablet tests
pnpm test:e2e:tablet
```

> **Note:** The `playwright.config.ts` `webServer` block automatically
> starts two Vite dev servers (ports 5174, 5175) and the PeerJS server
> (port 9000) before tests run. No manual server startup is needed.

### On NixOS

NixOS does not support Playwright's bundled Chromium. Instead, use the
system Chromium provided by NixOS packages.

```bash
cd apps/shelf-inventory

# Use the NixOS-specific config
npx playwright test --config=playwright-nixos.config.ts
```

This config points to `/run/current-system/sw/bin/chromium` and is
simpler (single browser, no retries, line reporter). Make sure
Chromium is available in your system profile:

```nix
# In your NixOS config or flake
environment.systemPackages = with pkgs; [ chromium ];
```

### Viewing the HTML Report

After a test run, open the interactive HTML report:

```bash
cd apps/shelf-inventory
npx playwright show-report
```

### Debugging Failures

```bash
# Open Playwright inspector (step through tests interactively)
npx playwright test --debug

# Run with headed browser (visible window)
npx playwright test --headed

# Run a specific test file
npx playwright test tests/my-test.spec.ts

# Run tests matching a title
pnpm test:e2e -g "should sync inventory"
```

---

## CI Pipeline

The GitHub Actions workflow (`.github/workflows/test.yml`) runs on
push to `main`/`develop` and on pull requests. It includes:

| Job               | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `unit-tests`      | Runs vitest in each package (edge-mesh, p2p, gpu)     |
| `app-unit-tests`  | Runs vitest in `apps/shelf-inventory`                 |
| `type-check`      | Runs `tsc --noEmit` in `apps/shelf-inventory`         |
| `e2e-tests`       | Installs Chromium, starts dev servers, runs Playwright |

On E2E failure, `test-results/` and `playwright-report/` are uploaded
as downloadable artifacts for debugging.

---

## Quick Reference

| Command                                  | Purpose                     |
| ---------------------------------------- | --------------------------- |
| `pnpm install`                           | Install all dependencies    |
| `pnpm run test:packages`                 | Unit tests (all packages)   |
| `pnpm test:unit`                         | App unit tests              |
| `pnpm test:ct`                           | Component tests (Cypress)   |
| `pnpm test:e2e`                          | E2E tests (Playwright)      |
| `npx tsc --noEmit`                       | Type checking               |
| `npx playwright test --config=playwright-nixos.config.ts` | E2E on NixOS |
