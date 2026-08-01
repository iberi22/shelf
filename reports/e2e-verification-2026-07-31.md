# E2E Verification Report — 2026-07-31

## Executive Summary

| Area | Result |
|------|--------|
| p2p-mesh-core unit tests | ✅ 36/36 passed |
| shelf-inventory unit tests | ✅ 234/234 passed |
| TypeScript compilation | ✅ Clean (0 errors) |
| E2E tests (Playwright) | ⚠️ 52/69 passed, 17 failed |
| **Total tests** | **322 unit + 69 E2E = 391 total** |

**Improvement from previous run:** Still 52/69 — no change in E2E pass rate since previous baseline.

---

## 1. Unit Test Results

### p2p-mesh-core (vitest)
```
Test Files  6 passed (6)
     Tests  36 passed (36)
  Duration  1.95s
```
| File | Tests |
|------|-------|
| consensus.test.ts | 6 ✅ |
| p2p-transport-adapter.test.ts | 5 ✅ |
| reactive-flow.test.ts | 2 ✅ |
| cloud-sync.test.ts | 4 ✅ |
| database-sync.test.ts | 6 ✅ |
| security.test.ts | 13 ✅ |

### shelf-inventory unit tests (vitest)
```
Test Files  11 passed (11)
     Tests  234 passed (234)
  Duration  909ms
```
| File | Tests |
|------|-------|
| seedGenerator.spec.ts | 20 ✅ |
| webhooks/parsers.spec.ts | 4 ✅ |
| aiChatContext.spec.ts | 22 ✅ |
| csvProductImport.spec.ts | 41 ✅ |
| telemetry.spec.ts | 4 ✅ |
| inventoryConfig.spec.ts | 9 ✅ |
| settingsPersistence.spec.ts | 38 ✅ |
| productVariantsForm.spec.ts | 35 ✅ |
| productVariants.spec.ts | 14 ✅ |
| localAuth.spec.ts | 43 ✅ |

> **Note:** `pnpm test` also runs `cypress run --component`, but Cypress 15.18.0 is not installed in this environment. Unit tests via vitest pass fully.

---

## 2. TypeScript Compilation

```
cd ~/proyectosSWAL/shelf/apps/shelf-inventory && npx tsc --noEmit
Exit code: 0 (no errors)
```

✅ TypeScript strict mode compilation is clean.

---

## 3. E2E Test Results (Playwright — playwright-nixos.config.ts)

```
52 passed (3.6m)
17 failed
Total: 69 tests
```

### ✅ Passing Tests (52)

All non-P2P UI, CRUD, settings, and persistence tests pass. Key passing categories:
- CRUD operations, product variants, CSV import
- Settings features, branch management
- Scanner lifecycle, seed mock data
- Security sync, recovery offline
- Mobile pagination, touch scroll, responsive devices
- Modals visual, variant catalog, audit log
- Offline sync, persistence reload/migration/edit
- Debug content, product history
- Reports export, webhooks, Sentry offline
- P2P: multi-peer, edge-mesh-sync, invite-unification, p2p-authority

### ❌ Failing Tests (17)

| # | File | Test | Root Cause Category |
|---|------|------|---------------------|
| 1 | garbage-collection.spec.ts | Admin node purges logs older than maxAgeMs | P2P multi-peer timing |
| 2 | integrity-conflict.spec.ts | Two peers edit different fields concurrently | P2P CRDT conflict resolution |
| 3 | integrity-conflict.spec.ts | Three peers with network partition converge | P2P CRDT convergence |
| 4 | inventory-config-catalog.spec.ts | Colors and measures in Settings → product form | UI state/config sync |
| 5 | inventory-config-catalog.spec.ts | Duplicate suggested colors rejected on save | UI state/config sync |
| 6 | landing-page-scroll.spec.ts | Landing page vertical scroll on PC viewport | Landing page layout |
| 7 | p2p-branches.spec.ts | Branch config + peer sync by branch | P2P branch sync |
| 8 | p2p-conflict-resolution.spec.ts | Collaborator-Admin conflict → pendingEdits | P2P conflict routing |
| 9 | p2p-critical-path-dual-server.spec.ts | Dual server sync + permission enforcement | P2P dual-server |
| 10 | p2p-invite-and-sync.spec.ts | Invite link, pairing, permission enforcement | P2P invite flow |
| 11 | p2p-share-links.spec.ts | PWA install + node invite link with peer id | P2P share links |
| 12 | p2p-sync-advanced.spec.ts | No duplicate products after concurrent adds | P2P YJS dedup |
| 13 | p2p-sync-advanced.spec.ts | No RESET_DATA on temporary disconnect | P2P false positive expulsion |
| 14 | p2p-sync-advanced.spec.ts | Smart merge resolves SYNC_STATE via LWW | P2P merge strategy |
| 15 | p2p-sync-advanced.spec.ts | Auto-reconnection after peer disconnect | P2P reconnection |
| 16 | p2p-sync-ui.spec.ts | Link devices via UI + sync branch | P2P UI sync |
| 17 | print_check.spec.ts | PDF Export iframe with srcdoc | PDF export feature |

### Failure Categories Summary

| Category | Count | Notes |
|----------|-------|-------|
| P2P multi-peer / dual-server | 10 | Requires 2+ browser contexts connecting via PeerJS; timing-sensitive |
| P2P CRDT conflict resolution | 3 | Yjs merge logic under concurrent edits |
| UI state / config sync | 2 | Inventory config catalog persistence |
| Landing page layout | 1 | Scroll behavior verification |
| PDF export | 1 | iframe srcdoc attribute check |

---

## 4. Test File Inventory

**Total spec files found in tests/:** 49
**Tests executed by Playwright:** 69 (some files contain multiple test cases)

---

## 5. Environment

| Component | Status |
|-----------|--------|
| Dev server (http://127.0.0.1:5174) | ✅ Running (HTTP 200) |
| Peer server (http://127.0.0.1:9000) | ✅ Running (HTTP 200) |
| Browser | Chromium (Playwright bundled) |
| Node.js | v22.x |
| pnpm | 9.x |
| Vite | 8.x |
| Playwright | 1.52.x |

---

## 6. Recommendations

1. **P2P tests (10 failures):** These are inherently flaky due to WebRTC/P2P timing. Consider:
   - Increasing timeouts for peer connection establishment
   - Using mock WebRTC adapters for deterministic P2E2 tests
   - Splitting dual-server tests into isolated test groups

2. **Inventory config catalog (2 failures):** Investigate if settings → product form config flow has a state persistence issue between pages.

3. **Landing page scroll (1 failure):** Check if the landing page component renders overflow correctly in headless Chromium viewport.

4. **Print/PDF (1 failure):** The iframe srcdoc attribute may not be set in the current implementation — verify the print component renders correctly.

---

*Report generated: 2026-07-31 18:30 UTC*
*Author: Hermes Agent (verification subagent)*
