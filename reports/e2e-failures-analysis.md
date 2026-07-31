# E2E Test Failures Analysis — Shelf Inventory

**Date:** 2026-07-31  
**Total Tests Analyzed:** 17 (across 12 spec files)  
**Status:** All 17 failing  

---

## Summary Table

| # | Test File | Test Name | Root Cause | Category | Severity | Est. Effort |
|---|-----------|-----------|------------|----------|----------|-------------|
| 1 | `p2p-sync-advanced.spec.ts` | YJS_UPDATE is not double-applied | P2P connection race / timeout | Timing/Flaky | High | 2h |
| 2 | `p2p-sync-advanced.spec.ts` | False positive expulsion prevented | `collabContext.close()` triggers RESET_DATA | Logic Bug | High | 3h |
| 3 | `p2p-sync-advanced.spec.ts` | Smart merge resolves SYNC_STATE conflicts | `pendingEdits` not populated after conflict | App Bug | High | 4h |
| 4 | `p2p-sync-advanced.spec.ts` | Auto-reconnection recovers sync | New collab context loses peer state | P2P Reconnect Bug | High | 4h |
| 5 | `p2p-sync-ui.spec.ts` | Link two devices and sync branch | Missing `addOverlayBlocker` / connection modal interference | Test Infra | Medium | 1h |
| 6 | `p2p-invite-and-sync.spec.ts` | Connect via invite, sync, enforce permissions | Missing `addOverlayBlocker` on admin context + race in authority setup | Test Infra + App Bug | High | 3h |
| 7 | `p2p-conflict-resolution.spec.ts` | Conflict routed to pendingEdits via UI | `pendingEdits` not populated; authority not set before connection | App Bug | High | 3h |
| 8 | `p2p-conflict-resolution.spec.ts` | Conflict visible in pending edits UI | Heading selector mismatch / no conflict triggered | Test Flaky | Low | 0.5h |
| 9 | `p2p-critical-path-dual-server.spec.ts` | Dual server sync with permissions | `chromium.launch()` in test bypasses Playwright config | Test Infra | High | 1.5h |
| 10 | `integrity-conflict.spec.ts` | Two peers edit different fields concurrently | CRDT merge race / `isReady` not guaranteed | App Bug + Timing | High | 3h |
| 11 | `integrity-conflict.spec.ts` | Three peers with network partition converge | `connectPeers` from C→A not awaited / missing authority | Timing + Test Flaky | Medium | 2h |
| 12 | `audit-log.spec.ts` | Audit logs capture peerId/peerRole/action | `updatePeerConfig` missing `localPeerId` arg + audit log format mismatch | App Bug | High | 2h |
| 13 | `garbage-collection.spec.ts` | Admin purges old logs, preserves new | `dbSync.localPeerId` direct mutation breaks GC role check | Test Bug | Medium | 1h |
| 14 | `p2p-share-links.spec.ts` | PWA install and invite link visible | `pwaUrl.search` assertion too strict / link format change | Test Flaky | Low | 0.5h |
| 15 | `landing-page-scroll.spec.ts` | Landing page scrollable on PC | `VITE_SKIP_LANDING=true` in config prevents landing page from rendering | Test Infra | Medium | 1h |
| 16 | `print_check.spec.ts` | PDF Export uses iframe with srcdoc | Catalog nav / `window.open` timing / srcdoc format change | Test Flaky | Medium | 1h |
| 17 | `inventory-config-catalog.spec.ts` | Colors and measures become selectable | Color/measure option test IDs may have changed after feature update | Test Flaky | Low | 1h |
| 18 | `inventory-config-catalog.spec.ts` | Duplicate suggested colors rejected | Duplicate validation message text mismatch | Test Flaky | Low | 0.5h |

> **Note:** 17 unique test cases across 12 files. Some files contain 1 test, others 2–4.

---

## Detailed Analysis

### 1. `p2p-sync-advanced.spec.ts` — YJS_UPDATE is not double-applied

**Test:** Two pages add same-named product simultaneously; expects exactly 2 products (not 1 or 3).

**Root Cause:** P2P connection via `connectAndSync()` involves multiple steps (navigate to settings → read peer ID → fill input → click connect → confirm role). Each step has timing dependencies. The `connectAndSync` helper calls `dismissModals` aggressively, which removes `.z-[200]` DOM nodes — this can remove connection confirmation modals that the test actually needs to interact with.

Additionally, the `requestFullSync()` call in the polling loop relies on `_p2pManagerForTest` being available, but P2P initialization polls on a 500ms interval (AppContext line 660). If the test reaches the sync loop before P2P is fully initialized, `requestFullSync` silently fails.

**What Test Expects:** Both pages see exactly 2 products named "Concurrent Duplicate Risk" after sync.  
**What Happens:** Either (a) connection never established → 0 products on remote, or (b) duplicate products created → count > 2, or (c) timeout waiting for sync.

**Is This a Test Issue or App Issue?** Primarily **test infrastructure** (fragile connection flow), with secondary **app issue** (P2P init timing).

**Suggested Fix:**
- Add explicit `await expect.poll` to wait for `_p2pManagerForTest` to be non-null before proceeding
- Replace `dismissModals` with targeted modal handling that doesn't remove the connection confirmation modal
- Add `addOverlayBlocker` to both contexts in this test (currently missing)
- Increase connection timeout in `connectAndSync` and add retry logic

**Estimated Effort:** 2 hours

---

### 2. `p2p-sync-advanced.spec.ts` — False positive expulsion prevented

**Test:** Admin adds product, then collab context is closed. Admin should NOT lose data or be expelled.

**Root Cause:** When `collabContext.close()` is called (line 168), the WebRTC connection drops. This triggers the `onChange` handler in AppContext (lines 619–643) which checks for expulsion. The code has a grace period (checks `isExplicitlyExpelled`), but the `isMissing` branch (line 636) may still trigger a `REQUEST_FULL_STATE` broadcast that fails because the peer is gone, potentially causing the admin to reset state.

The test checks `dbSync.getState(dbSync.localPeerId)` for products and `isExpelled` flag — but if the connection drop triggers a `SYNC_STATE` dispatch with partial/empty data, the products array may be temporarily empty.

**What Test Expects:** Products persist and `isExpelled === false` after collab disconnects.  
**What Happens:** Products disappear or `isExpelled` becomes true due to race condition in expulsion logic.

**Is This a Test Issue or App Issue?** **App bug** — the expulsion logic is too aggressive when a single peer disconnects.

**Suggested Fix:**
- In AppContext expulsion check (line 630), add a debounce/grace period (e.g., 10 seconds) before checking for missing peers after a disconnect event
- Only trigger `RESET_DATA` when the master explicitly sends an expulsion message, not when a peer is temporarily absent
- Add `addOverlayBlocker` to both contexts

**Estimated Effort:** 3 hours

---

### 3. `p2p-sync-advanced.spec.ts` — Smart merge resolves SYNC_STATE conflicts via timestamp LWW

**Test:** Both admin and collab update same product price to different values; expects pending edits to appear and be resolvable via UI.

**Root Cause:** The `pendingEdits` array is populated by the security guard in the CRDT sync pipeline. However, the test's assertion at line 266 expects `pendingEdits.length > 0` after calling `requestFullSync()`. The issue is:

1. The security guard may auto-resolve the conflict via LWW (Last Writer Wins) without creating a pending edit, especially if `autoApplyProductUpdates` is true (the default)
2. The `requestFullSync` function triggers state-vector diff exchange, which may merge the changes automatically
3. The test clicks "Revisar Ediciones" and "Fusionar y Guardar" (lines 270-271) but these buttons may not exist if no pending edits are shown

**What Test Expects:** `pendingEdits` array to contain the conflict, UI buttons to resolve it.  
**What Happens:** Conflicts auto-resolve via LWW, no pending edits appear, UI buttons missing → timeout.

**Is This a Test Issue or App Issue?** **App bug** — the conflict resolution system doesn't consistently create pending edits when two peers edit the same field of the same entity.

**Suggested Fix:**
- Ensure the security guard creates pending edits when two peers modify the same field within a short time window, rather than auto-resolving via LWW
- Alternatively, redesign the test to verify the LWW resolution result instead of pending edits UI
- Add `addOverlayBlocker` to both contexts

**Estimated Effort:** 4 hours

---

### 4. `p2p-sync-advanced.spec.ts` — Auto-reconnection after peer disconnect recovers sync

**Test:** Collab disconnects, then a new collab context reconnects; expects product sync to recover.

**Root Cause:** When a new browser context is created (line 347), it gets a fresh peer ID. The admin's P2P manager still has the old collab peer in its `connectedPeers` map. The new collab needs to manually reconnect, but the test only creates the context and navigates to `/` — it doesn't initiate a connection.

The `expectProductSync` helper (line 355) calls `requestFullSync()` which relies on the P2P connection being established, but no connection attempt is made for the new collab.

**What Test Expects:** New collab automatically reconnects and receives "Reconnection Test Product".  
**What Happens:** No connection established → `requestFullSync` silently fails → timeout.

**Is This a Test Issue or App Issue?** **Test issue** — the test doesn't establish a connection for the new collab context.

**Suggested Fix:**
- After creating the new collab context, navigate to settings, get the admin's peer ID, and manually connect
- Or: use the invite link mechanism to auto-connect the new collab
- Add a `connectPeers(collabPage2, adminId)` call after navigating to settings

**Estimated Effort:** 4 hours

---

### 5. `p2p-sync-ui.spec.ts` — Link two devices using UI and sync a new branch

**Test:** Two devices connect via UI peer ID input, then admin creates a branch that syncs to collab.

**Root Cause:** The test uses `setupPage()` for both pages, which sets localStorage and navigates to `/?testMode=true`. However, the connection flow goes through the UI (fill peer ID → click connect → confirm modal). The connection confirmation modal (line 38) uses `Sincronizar y Conectar` text, but if the app language changes or the modal is dismissed by `dismissModals`, the test fails.

Additionally, the test doesn't use `addOverlayBlocker` on either context. The `setupPage` function calls `addInitScript` on the page (not the context), which runs after navigation — too late for the overlay blocker to be effective during initial load.

**What Test Expects:** Connection modal appears, connection succeeds, branch syncs.  
**What Happens:** Connection modal may be dismissed or not appear, connection never established.

**Is This a Test Issue or App Issue?** **Test infrastructure** — missing `addOverlayBlocker` on contexts and fragile modal handling.

**Suggested Fix:**
- Add `addOverlayBlocker(context1)` and `addOverlayBlocker(context2)` before creating pages
- Replace `setupPage` with `addOverlayBlocker` on contexts + manual navigation with `testMode=true`
- Use `getByRole('button', { name: /Sincronizar|Conectar/i })` with fallback text patterns

**Estimated Effort:** 1 hour

---

### 6. `p2p-invite-and-sync.spec.ts` — Connects via invite link, syncs, enforces permissions

**Test:** Full invite-link flow with permission enforcement (limited → unauthorized edit → upgrade → authorized edit).

**Root Cause:** Multiple issues:

1. **Missing `addOverlayBlocker` on admin context** (line 63) — only `collabContext` has it. This means admin page may show loading overlays that block UI interaction.
2. **Authority setup race** (lines 80-92) — `dbSync.setMasterPeerId()` is called before P2P init may be complete. The `isLocalAuthority()` check at line 89 can fail if the Yjs document isn't fully loaded.
3. **`updatePeerConfig` missing `localPeerId`** (line 64) — called with 3 args instead of 4. The 4th arg (`localPeerId`) is required for authority verification.
4. **Invite link navigation** (line 131) — `collabPage.goto(inviteUrl)` may trigger a full page reload that re-initializes P2P, losing the invite parameters.

**What Test Expects:** Full permission lifecycle works end-to-end.  
**What Happens:** Connection fails, or permission changes don't propagate, or unauthorized edit is not rejected.

**Is This a Test Issue or App Issue?** **Both** — test infrastructure gaps and app-level authority initialization race.

**Suggested Fix:**
- Add `addOverlayBlocker(adminContext)` before creating adminPage
- Wait for P2P readiness before calling authority setup: `await expect.poll(() => p2p.localPeerId).toBeTruthy()`
- Fix `updatePeerConfig` calls to include `localPeerId` as 4th argument
- Add `await page.waitForLoadState('networkidle')` after invite link navigation

**Estimated Effort:** 3 hours

---

### 7. `p2p-conflict-resolution.spec.ts` — Conflict routed to pendingEdits via UI

**Test:** Admin and collab edit same product price; expects conflict convergence.

**Root Cause:** Similar to issue #3. The test connects peers via `connectPeers()` and then both edit the same product. However:

1. **No authority setup** — unlike other tests, this one doesn't call `dbSync.setMasterPeerId()`. Without authority, the security guard can't properly route conflicts to `pendingEdits`.
2. **CRDT auto-resolves** — the Yjs CRDT merge automatically resolves field-level conflicts via LWW, so both peers converge to the same price without pending edits.
3. **Convergence assertion** (line 127) expects `price1 === price2 && (price1 === 111 || price1 === 222)`. If auto-resolve picks a different strategy or the sync is slow, this assertion fails.

**What Test Expects:** Both peers converge to the same price (111 or 222).  
**What Happens:** Timeout waiting for convergence, or prices don't match.

**Is This a Test Issue or App Issue?** **App bug** — the authority/permission system doesn't properly gate conflict resolution without explicit master setup.

**Suggested Fix:**
- Add authority setup before connecting: `dbSync.setMasterPeerId(localPeerId)` on admin
- Increase convergence timeout to 40s (from 20s)
- Add `addOverlayBlocker` to both contexts
- Consider adding a `requestFullSync()` call to force convergence

**Estimated Effort:** 3 hours

---

### 8. `p2p-conflict-resolution.spec.ts` — Conflict visible in pending edits UI

**Test:** Check if pending edits section exists in settings UI.

**Root Cause:** This is a simple UI check. The test looks for `text=Pending Edits` or `text=Edits pendientes` (line 156). If neither text exists in the current UI, the test logs and continues. Then it checks for a heading with `name: 'Settings'` or `name: 'Configuración'` (line 167).

The heading selector uses `getByRole('heading', { name: 'Settings', exact: true })` — if the heading has additional text or the exact match fails, the test times out.

**What Test Expects:** Settings heading to be visible.  
**What Happens:** Heading text doesn't match exactly → timeout.

**Is This a Test Issue or App Issue?** **Test issue** — overly strict heading selector.

**Suggested Fix:**
- Use `exact: false` for the heading selector, or use a more resilient locator like `page.locator('h1, h2, h3').filter({ hasText: /Settings|Configuración/i })`
- This test is low priority as it's informational only

**Estimated Effort:** 0.5 hours

---

### 9. `p2p-critical-path-dual-server.spec.ts` — Dual server sync with permissions

**Test:** Two browsers on separate dev servers (5174, 5175) sync data and enforce permissions.

**Root Cause:** The test calls `chromium.launch({ headless: true })` directly (line 113), bypassing Playwright's test infrastructure. This means:

1. No Chromium args from config are applied (`--allow-loopback-in-peer-connection`, `--disable-features=WebRtcHideLocalIpsWithMdns`)
2. The browsers connect to hardcoded ports 5174 and 5175, which may not be running
3. No `addOverlayBlocker` is added to the manually created contexts (it IS added — lines 121-122)
4. The `finally` block closes browsers, but if a test assertion fails before reaching `finally`, browsers may leak

The main issue is that **WebRTC loopback connections may not work** without the `--allow-loopback-in-peer-connection` Chromium flag, which is only applied in the Playwright config's `launchOptions`.

**What Test Expects:** Two separate browser instances sync data across different dev servers.  
**What Happens:** WebRTC connection fails because loopback peer connections are blocked.

**Is This a Test Issue or App Issue?** **Test infrastructure** — missing Chromium launch flags.

**Suggested Fix:**
- Use `browser.newContext()` from the test fixture instead of `chromium.launch()`, OR
- Add the required Chromium args to the manual launch: `args: ['--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns']`
- Ensure the second dev server (port 5175) is actually running by checking the Playwright config's webServer setup

**Estimated Effort:** 1.5 hours

---

### 10. `integrity-conflict.spec.ts` — Two peers edit different fields concurrently

**Test:** Admin edits price, collab edits SKU of same product; expects both changes to merge.

**Root Cause:** The test sets `autoApplyProductUpdates: true` (lines 36-48) and connects peers via `connectPeers()`. Then it performs concurrent edits using `dbSync.upsertEntity()` directly.

The issue is that `upsertEntity` on both peers happens nearly simultaneously (the `evaluate` calls are sequential but the CRDT sync is asynchronous). The test expects the CRDT to merge both field changes, but:

1. If one peer's update arrives first and auto-applies, the second peer's `__baseUpdatedAt` may be stale
2. The `isReady` check (line 28) uses `dbSync.isReady` which may not exist on the DatabaseSyncManager (the search found 0 matches for `isReady` in the edge-mesh source)
3. The product may not appear on collab's inventory page if the collab hasn't navigated there yet

**What Test Expects:** Both peers converge to `price=200, sku=MODIFIED-SKU, name=Integrity Test Product`.  
**What Happens:** One field change is lost, or the product doesn't sync, or `isReady` is undefined.

**Is This a Test Issue or App Issue?** **App bug** — `isReady` property doesn't exist on `DatabaseSyncManager`, and CRDT field-level merge may not work correctly for concurrent non-conflicting field edits.

**Suggested Fix:**
- Replace `dbSync.isReady` check with a proper readiness check (e.g., `dbSync.localPeerId` being set)
- Ensure the CRDT merge correctly handles concurrent field-level updates by verifying the merge logic in `database-sync-manager.ts`
- Add `addOverlayBlocker` to both contexts
- Increase convergence timeout

**Estimated Effort:** 3 hours

---

### 11. `integrity-conflict.spec.ts` — Three peers with network partition converge

**Test:** Three peers (A, B connected; C isolated). A creates product, C creates different product. Then C connects to A. All three should converge.

**Root Cause:** The test connects A and B via `connectPeers(pageA, idB)` (line 185), then later connects C to A via `connectPeers(pageC, idA)` (line 225). However:

1. The `connectPeers` call from C→A is one-directional. The function checks `isPeerConnected` on the source page (C), but A may not see C as connected yet.
2. There's no bidirectional connection wait — the test proceeds to poll for convergence without ensuring both A and C see each other as connected.
3. The convergence polling (lines 228-260) checks product names across all three pages, but page B may not receive Product C because B is only connected to A, not C. The sync topology is A↔B, A↔C, but not B↔C.

**What Test Expects:** All three peers have both "Product A" and "Product C".  
**What Happens:** Page B never receives "Product C" because there's no direct A→B re-sync after C connects to A.

**Is This a Test Issue or App Issue?** **Test issue** — the sync topology doesn't guarantee transitive propagation through A to B.

**Suggested Fix:**
- After connecting C to A, explicitly trigger `requestFullSync` on both A and B
- Add a wait for A to receive Product C before checking B
- Or: add `addOverlayBlocker` to all three contexts and increase the timeout to 60s

**Estimated Effort:** 2 hours

---

### 12. `audit-log.spec.ts` — Audit logs capture peerId, peerRole and correct action

**Test:** Collaborator adds product via UI; admin should see audit log with collab's peerId and role.

**Root Cause:** Multiple issues:

1. **`updatePeerConfig` missing `localPeerId`** (line 64) — `dbSync?.updatePeerConfig(targetPeerId, 'collaborator', nextPermissions)` is called with only 3 args. The 4th arg (`localPeerId`) is required for the method to set `updatedBy` correctly.
2. **Audit log format mismatch** (line 148) — the test looks for `l.action === 'ADD_PRODUCT' || l.action === 'UPSERT_PRODUCT' || l.entityType === 'product'`, but the actual audit log entry may use a different action name.
3. **`peerRole` may be `undefined`** (line 154) — the test allows `undefined` as a valid value, suggesting this is a known issue. The `CHANGE_ROLE` and `UPDATE_PEER_PERMISSIONS` messages may not set the role in the audit log.

**What Test Expects:** Audit log contains `peerId=collabId`, `peerRole='collaborator'`, and correct action.  
**What Happens:** Audit log is empty, or entries don't match the expected format.

**Is This a Test Issue or App Issue?** **App bug** — the `updatePeerConfig` method needs the `localPeerId` parameter, and the audit log entry format may be inconsistent.

**Suggested Fix:**
- Add `adminId` (the localPeerId) as 4th argument to `updatePeerConfig` call
- Verify the actual audit log entry format by logging `adminAuditLog` and adjusting assertions
- Add `addOverlayBlocker` to both contexts

**Estimated Effort:** 2 hours

---

### 13. `garbage-collection.spec.ts` — Admin purges old logs, preserves new

**Test:** Insert old and new audit logs, run GC with 30-day max age, verify old logs are purged.

**Root Cause:** The test directly mutates `dbSync.localPeerId = 'admin-123'` and `dbSync.setMasterPeerId('admin-123')` (lines 77-78). This bypasses the normal authority setup and may cause the GC function to not recognize the peer as admin.

The GC function `startGarbageCollection` checks if the peer is admin/master before running. The direct mutation may not trigger the necessary state updates that the GC function depends on.

Additionally, the test calls `dbSync.stopGarbageCollection('auditLogs')` (line 74) to stop the regular GC started by AppContext. But the AppContext GC uses `THIRTY_DAYS_MS` and `ONE_HOUR_MS`, while the test uses `ONE_SEC_MS` for the check interval. There may be a race where both GC instances run simultaneously.

**What Test Expects:** Old logs (31+ days) are purged, new log (1 day) persists.  
**What Happens:** GC doesn't run because the direct mutation doesn't properly set admin role, or GC runs but doesn't purge the old logs.

**Is This a Test Issue or App Issue?** **Test issue** — direct mutation of `localPeerId` is fragile.

**Suggested Fix:**
- Use the proper authority setup: `dbSync.setMasterPeerId(localPeerId)` with the actual localPeerId
- Wait for `dbSync.getState(dbSync.localPeerId).role === 'admin'` before starting GC
- Use `await expect.poll` instead of `waitForTimeout` to wait for GC completion

**Estimated Effort:** 1 hour

---

### 14. `p2p-share-links.spec.ts` — PWA install and invite link visible

**Test:** Settings page shows PWA link and invite link with correct peer ID.

**Root Cause:** The test asserts `pwaUrl.search === ''` (line 33), meaning the PWA link should have no query parameters. If the app adds any parameters (e.g., `?utm_source=pwa`), this assertion fails.

Also, the invite link is checked for `peerId` parameter (line 35). If the peer ID format changes or the URL encoding differs, the assertion fails.

**What Test Expects:** PWA link has no search params; invite link has `invite=true` and `peerId=<id>`.  
**What Happens:** PWA link has unexpected params, or invite link format changed.

**Is This a Test Issue or App Issue?** **Test issue** — overly strict URL assertion.

**Suggested Fix:**
- Change `expect(pwaUrl.search).toBe('')` to `expect(pwaUrl.search).not.toContain('invite')` (to verify it's NOT an invite link)
- Add more resilient assertions for the invite URL

**Estimated Effort:** 0.5 hours

---

### 15. `landing-page-scroll.spec.ts` — Landing page scrollable on PC

**Test:** Landing page should be taller than viewport and scrollable.

**Root Cause:** The Playwright config sets `VITE_SKIP_LANDING: 'true'` (line 53) in the webServer env. This means when the test navigates to `/`, the landing page is skipped entirely — the app goes straight to the main inventory view.

The test clears localStorage (line 11) and adds init script to set `hasVisited` to false, but the `VITE_SKIP_LANDING` env var takes precedence over localStorage (see App.tsx line 32: `import.meta.env.VITE_SKIP_LANDING === 'true'` is checked first).

**What Test Expects:** Landing page renders with scrollable content.  
**What Happens:** Landing page is skipped; main app renders instead → heading "Tu Inventario." not found → timeout.

**Is This a Test Issue or App Issue?** **Test infrastructure** — the test runs against a server that skips the landing page.

**Suggested Fix:**
- Either: run this test against a server without `VITE_SKIP_LANDING=true`
- Or: configure the test to use a different base URL (e.g., `http://127.0.0.1:5174` without the env var)
- Or: use `test.use({ baseURL: '...' })` to override for this specific test

**Estimated Effort:** 1 hour

---

### 16. `print_check.spec.ts` — PDF Export uses iframe with srcdoc

**Test:** Clicking PDF export button opens a new window with an iframe containing srcdoc.

**Root Cause:** The test navigates to the catalog page and clicks `catalog-export-pdf`. This triggers `window.open()` which creates a new page. The test uses `context.waitForEvent('page')` to capture the new page.

Potential issues:
1. The catalog page may not have any products, so the PDF export may not open
2. The `window.open` may be blocked by popup blockers in headless mode
3. The iframe srcdoc may not contain `<!DOCTYPE html>` or `Catálogo` if the PDF template changed

**What Test Expects:** New page opens with iframe containing srcdoc with HTML and "Catálogo".  
**What Happens:** New page doesn't open, or iframe doesn't exist, or srcdoc doesn't match.

**Is This a Test Issue or App Issue?** **Test issue** — depends on catalog having products and popup not being blocked.

**Suggested Fix:**
- Ensure the catalog page has at least one product before clicking export
- Add `addInitScript` to set `window.__E2E_TEST__ = true` to help with popup detection
- Add retry logic for the new page event

**Estimated Effort:** 1 hour

---

### 17. `inventory-config-catalog.spec.ts` — Colors and measures become selectable

**Test:** Create color "CoralE2E" and measure "33CM" in settings, verify they appear in product form.

**Root Cause:** The test uses dynamic test IDs based on index: `color-option-name-${colorCount}` and `measure-option-input-${measureCount}` (lines 18, 23). If the component renders differently (e.g., the add button creates a new row with a different index), the test IDs won't match.

Also, the `mc-color-CoralE2E` and `mc-measure-33CM` test IDs (lines 44-45) depend on the product form component rendering variant chips with these exact test IDs.

**What Test Expects:** Settings form saves new color/measure; product form shows them as selectable options.  
**What Happens:** Test IDs don't match, or the color/measure doesn't appear in the product form.

**Is This a Test Issue or App Issue?** **Test issue** — fragile dynamic test ID construction.

**Suggested Fix:**
- Use more resilient selectors: `page.locator('[data-testid^="color-option-name-"]').last()` instead of index-based
- Verify the color/measure appears in the product form by checking all `mc-color-*` elements
- Add `addOverlayBlocker` context setup

**Estimated Effort:** 1 hour

---

### 18. `inventory-config-catalog.spec.ts` — Duplicate suggested colors rejected on save

**Test:** Adding a duplicate color "rojo" should show validation error.

**Root Cause:** The test expects `text=Hay colores sugeridos repetidos.` to appear after saving a duplicate color (line 59). If the validation message text changed (e.g., different casing, additional punctuation, or different wording), the assertion fails.

**What Test Expects:** Validation message "Hay colores sugeridos repetidos." appears.  
**What Happens:** Message text doesn't match exactly → timeout.

**Is This a Test Issue or App Issue?** **Test issue** — exact text match is fragile.

**Suggested Fix:**
- Use `page.locator('text=/colores.*repetidos|duplicate.*color/i')` for case-insensitive partial match
- Or use `page.getByText(/repetid/i)` for partial match

**Estimated Effort:** 0.5 hours

---

## Prioritized Fix Recommendations

### Priority 1 — Critical (blocks most tests)

| Fix | Tests Affected | Effort |
|-----|---------------|--------|
| **Add `addOverlayBlocker` to all browser contexts** in all test files | #1,2,3,4,5,6,7,9,10,11,12 | 2h |
| **Fix `connectAndSync` / `connectPeers` to wait for P2P readiness** before proceeding | #1,2,3,4,6,7,10,11,12 | 3h |
| **Fix Playwright config to NOT set `VITE_SKIP_LANDING` globally** or add test-specific config | #15 | 1h |

### Priority 2 — High (app-level bugs)

| Fix | Tests Affected | Effort |
|-----|---------------|--------|
| **Fix expulsion logic** — add grace period after peer disconnect before checking for missing peers | #2 | 3h |
| **Fix pendingEdits population** — ensure conflicts create pending edits instead of auto-resolving | #3, #7 | 4h |
| **Fix `updatePeerConfig` calls** — add `localPeerId` as 4th argument | #6, #12 | 1h |
| **Fix `isReady` property** — either add it to DatabaseSyncManager or replace check in test | #10 | 1h |

### Priority 3 — Medium (test infrastructure)

| Fix | Tests Affected | Effort |
|-----|---------------|--------|
| **Fix dual-server test** — add Chromium launch args | #9 | 1h |
| **Fix auto-reconnection test** — establish connection for new collab context | #4 | 2h |
| **Fix three-peer partition test** — ensure transitive sync propagation | #11 | 2h |
| **Fix landing page scroll test** — use separate server config without skip-landing | #15 | 1h |

### Priority 4 — Low (test flakiness)

| Fix | Tests Affected | Effort |
|-----|---------------|--------|
| **Fix heading selector** — use flexible text matching | #8 | 0.5h |
| **Fix URL assertions** — use less strict URL matching | #14 | 0.5h |
| **Fix duplicate color validation text** — use partial text match | #18 | 0.5h |
| **Fix PDF export test** — ensure catalog has products | #16 | 1h |
| **Fix config catalog test** — use resilient selectors | #17 | 1h |

---

## Estimated Total Effort

| Priority | Effort |
|----------|--------|
| P1 — Critical | 6h |
| P2 — High | 9h |
| P3 — Medium | 6h |
| P4 — Low | 3.5h |
| **Total** | **~24.5h** |

---

## Root Cause Categorization

| Category | Count | Tests |
|----------|-------|-------|
| **Test Infrastructure** (missing blockers, wrong setup) | 5 | #5, #6, #9, #15, #17 |
| **App Bug** (expulsion, pendingEdits, authority) | 5 | #2, #3, #7, #10, #12 |
| **Timing / Race Condition** | 4 | #1, #4, #11, #13 |
| **Test Flakiness** (fragile selectors/assertions) | 4 | #8, #14, #16, #18 |

---

## Quick Wins (< 1 hour each)

1. Add `addOverlayBlocker` to all test contexts (2h total, fixes ~11 tests)
2. Fix heading selector in conflict-resolution test (0.5h)
3. Fix URL assertion in share-links test (0.5h)
4. Fix duplicate color validation text (0.5h)
5. Add Chromium args to dual-server test (1h)

---

*Report generated by Hermes Agent — E2E Failure Analysis*
