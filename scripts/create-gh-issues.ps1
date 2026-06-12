# Create GitHub issues for P2P sync anomalies
# Repo: iberi22/shelf

$REPO = "iberi22/shelf"
$LABEL_CRITICAL = "--label bug --label critical --label p2p"
$LABEL_P2P = "--label enhancement --label p2p"
$LABEL_SECURITY = "--label bug --label security --label p2p"
$LABEL_REFACTOR = "--label refactor --label p2p"
$LABEL_PERFORMANCE = "--label enhancement --label performance --label p2p"

# Issue 1 - CRITICAL: YJS_UPDATE handler missing
gh issue create --repo $REPO `
  --title "[P2P] Critical: YJS_UPDATE never reaches P2PSyncManager - UI never updates on remote changes" `
  --label "bug" --label "critical" --label "p2p" `
  --body "## Bug: P2P data never syncs between peers

### Root Cause
\`P2PSyncManager.tsx\` handles \`STATE_UPDATE\` and \`REQUEST_FULL_STATE\` but **never handles \`YJS_UPDATE\`**. Yjs CRDT updates arrive at \`p2p.ts\` → \`dbSync.applyUpdate()\` → Y.Doc updated → but React state is never refreshed. The UI stays stale while showing \"Synced 100%\".

### Flow
1. Peer A changes a product → \`dbSync.upsertEntity()\` → \`YJS_UPDATE\` broadcast
2. Peer B receives \`YJS_UPDATE\` → \`dbSync.applyUpdate()\` → Y.Doc has new data
3. **React state never dispatches SYNC_STATE** → UI invisible
4. State_UPDATE messages via P2PManager are encrypted and only used for initial full-state sync, not incremental updates

### Fix Required
- \`P2PSyncManager.tsx\`: add \`case 'YJS_UPDATE'\` that calls \`dbSync.getState()\` → \`dispatch({ type: 'SYNC_STATE', payload: remoteState })\`
- Ensure \`dbSync.onChange()\` in \`AppContext.tsx\` properly dispatches SYNC_STATE for remote origins

### Files
- apps/shelf-inventory/components/P2PSyncManager.tsx (lines ~78-110)
- packages/p2p-mesh-core/src/p2p.ts (YJS_UPDATE send/receive handlers)
- apps/shelf-inventory/context/AppContext.tsx (dbSync.onChange handler)

### Verification
Open 2 browser tabs, connect them (same room), add a product in tab A. Tab B should show it within 2 seconds."

# Issue 2 - Critical: YJS_UPDATE broadcast happens before state is initialized
gh issue create --repo $REPO `
  --title "[P2P] Critical: YJS_UPDATE broadcast races with dbSync.initWithState - sends empty state" `
  --label "bug" --label "critical" --label "p2p" `
  --body "## Bug: Initial state sync sends empty state to new peers

### Root Cause
When the PeerJS connection opens, \`p2p.ts\` immediately sets up \`dbSync.onChange()\` callback that broadcasts \`YJS_UPDATE\`. However, \`dbSync.initWithState(state)\` in \`AppContext.tsx\` (line ~168) runs **asynchronously** after \`isLoaded\` is true but doesn't wait for first state population.

For a newly connected peer:
1. \`p2p.init()\` fires \`peer.on('open')\`
2. Inside \`peer.on('open')\`, \`dbSync.onChange()\` is registered → broadcasts empty Y.Doc
3. New peer connects, receives empty state
4. \`dbSync.initWithState(state)\` runs later → overwrites local Y.Doc with loaded state → triggers another broadcast
5. Race condition: new peer may have already accepted the empty state as ground truth

### Fix Required
- Defer \`dbSync.onChange()\` registration until \`initWithState()\` has completed
- OR use a \`ready\` flag checked inside onChange to skip broadcasts before initialization
- OR move the onChange registration to AFTER \`AppContext\` calls \`dbSync.initWithState()\`

### Files
- packages/p2p-mesh-core/src/p2p.ts (lines ~139-143: onChange registration in peer.on('open'))
- apps/shelf-inventory/context/AppContext.tsx (lines ~160-173: initWithState call)"

# Issue 3 - Critical: EXPULSION loop via RESET_DATA destroys all data
gh issue create --repo $REPO `
  --title "[P2P] Critical: Expelled peer races into RESET_DATA loop - data wipe on reconnect" `
  --label "bug" --label "critical" --label "p2p" `
  --body "## Bug: Expelled peer loop destroys data

### Root Cause
In \`AppContext.tsx\` \`dbSync.onChange()\` handler (lines ~135-145), when a peer reconnects after being removed from \`linkedNodes\`:
1. \`masterId !== localPeerId && linkedNodes.length > 0\` is true
2. \`!linkedNodes.some(n => n.id === localPeerId)\` is true
3. Calls \`p2pManager.disconnect()\`, \`dispatch({ type: 'RESET_DATA' })\`, \`dispatch({ type: 'SET_EXPELLED', payload: true })\`

Problem: The \`masterId\` lookup via \`dbSync.getMasterPeerId()\` iterates all linked nodes. If the master peer has NOT explicitly removed this peer — but the Yjs state simply hasn't synced the linkedNodes Y.Map yet — this triggers a **false positive expulsion**.

Result: On every reconnect, the reconnecting peer's data gets wiped. This makes P2P sync useless for any peer that disconnects and reconnects.

### Fix Required
- Add a grace period: don't consider expelled until N seconds of absence
- Only trigger expulsion if a specific 'expelled' flag is set on the peer's node, not just absence from linkedNodes
- Add a confirmation handshake before wiping local data
- Log the masterId and linkedNodes for debugging

### Files
- apps/shelf-inventory/context/AppContext.tsx (lines ~135-145)"

# Issue 4 - CRITICAL: SYNC_STATE overwrites entire local state
gh issue create --repo $REPO `
  --title "[P2P] Critical: SYNC_STATE action overwrites entire AppState - data loss on merge" `
  --label "bug" --label "critical" --label "p2p" `
  --body "## Bug: SYNC_STATE replacement merge causes data loss

### Root Cause
\`AppContext.tsx\` reducer for \`SYNC_STATE\` does \`return { ...state, ...action.payload }\`. This is a **destructive replacement merge**:

- If Peer A has 100 products and Peer B has 50 products, after SYNC_STATE both have 50 products
- If action.payload contains empty arrays for some collections (because they haven't been synced yet), those collections get wiped
- There's no timestamp-ordered conflict resolution, no last-writer-wins, no 3-way merge

### Impact
- Peers lose data on every full-state sync
- A slow peer can 'blank' a fast peer's data
- No convergence guarantee

### Fix Required
Replace with a **smart merge** that:
- For each collection in the payload, compare item IDs and merge by latest updatedAt
- Never replace a populated array with an empty array from a stale peer
- For YJS_UPDATE path (issue #1), use incremental CRDT merge (Yjs handles this), only dispatch full SYNC_STATE on initial connection
- Add merge strategy: local wins for items with newer updatedAt, remote wins for older items

### Files
- apps/shelf-inventory/context/AppContext.tsx (line ~196: SYNC_STATE case)"

# Issue 5 - Security: Encrypted payload routing bypass (double-handled YJS_UPDATE)
gh issue create --repo $REPO `
  --title "[P2P] Security: Double-handled YJS_UPDATE in encrypted and unencrypted paths" `
  --label "bug" --label "security" --label "p2p" `
  --body "## Security: Double-handled YJS_UPDATE

### Root Cause
\`YJS_UPDATE\` is classified as \`isSensitive\` (line ~263 in p2p.ts), so it gets encrypted via \`ENCRYPTED_PAYLOAD\`. But the **unencrypted** \`YJS_UPDATE\` path still exists:

1. \`sendTo()\` encrypts YJS_UPDATE if key exists → wraps in \`ENCRYPTED_PAYLOAD\`
2. On receive, \`ENCRYPTED_PAYLOAD\` handler decrypts → extracts YJS_UPDATE → calls \`dbSync.applyUpdate()\`
3. Then the message loop continues and hits \`YJS_UPDATE\` handler → calls \`dbSync.applyUpdate()\` **again**

This double-apply corrupts the Yjs document state.

### Fix Required
After handling \`ENCRYPTED_PAYLOAD\`, the message should be returned/consumed — don't fall through to the regular message callbacks. Add a \`return\` after the encrypted payload handler.

### Files
- packages/p2p-mesh-core/src/p2p.ts (lines ~285-300: handleEncryptedMessage + message loop fallthrough)"

# Issue 6 - Architecture: Missing observeDeep pattern for real-time incremental sync
gh issue create --repo $REPO `
  --title "[P2P] Architecture: Missing observeDeep on each Y.Map - incremental YJS_UPDATE relies on user action" `
  --label "enhancement" --label "p2p" `
  --body "## Enhancement: Real-time incremental sync is broken

### Root Cause
\`p2p.ts\` registers \`dbSync.onChange()\` inside \`peer.on('open')\` (lines ~139-143). This broadcasts the entire Y.Doc state as \`YJS_UPDATE\` on **any** change. This is correct for incremental Yjs sync.

However, the **local dispatch chain** is:
1. User action → \`dispatch({ type: 'ADD_PRODUCT', payload })\` → \`rawDispatch\` (React state update)
2. The \`dispatch\` wrapper then calls \`dbSync.upsertEntity()\` → \`Y.Map.set(id, item)\` → \`doc.on('update')\` fires → \`YJS_UPDATE\` broadcast

Problem: Step 2 fails silently if a \`TYPE: 'DELETE_PRODUCT'\` is dispatched — \`dbSync.deleteEntity()\` removes from Y.Map but the Yjs update that fires is about a value deletion rather than a map set. This may or may not sync properly depending on Yjs internal behavior.

Additionally, for batch operations like \`BATCH_UPDATE_PRODUCTS\` or \`IMPORT_PRODUCTS\`, the dispatch wrapper doesn't call \`dbSync.upsertEntity()\` for each product — it only does so for single \`ADD_*\` / \`UPDATE_*\` actions. So **batch operations never reach the CRDT**.

### Fix Required
- Add missing CRDT sync for \`BATCH_UPDATE_PRODUCTS\` and \`IMPORT_PRODUCTS\` in AppContext dispatch wrapper
- Add \`observeDeep\` on each Y.Map for reactive updates instead of relying on manual dispatch interception
- Ensure delete operations produce correct Yjs updates

### Files
- apps/shelf-inventory/context/AppContext.tsx (dispatch wrapper, lines ~175-210)
- packages/p2p-mesh-core/src/database-sync.ts (add observeDeep method)"

# Issue 7 - Improvements: GC, logging, reconnection strategy
gh issue create --repo $REPO `
  --title "[P2P] Improvement: Add proper GC coordination, connection health checks, and debug logging" `
  --label "enhancement" --label "p2p" `
  --body "## Improvement: GC, health checks, and logging

### Issues Found

1. **GC runs on ALL peers**, not just admin/master. \`database-sync.ts\` \`startGarbageCollection()\` checks role each cycle, but race conditions exist where non-admin peers purge data before the admin syncs their state.

2. **No reconnection backoff**. \`p2p.ts\` uses \`setTimeout(() => this.init(id), 2000)\` with fixed 2s delay. No exponential backoff, no max retry limit, no state tracking for retry attempts.

3. **No connection health ping/pong**. \`PeerJS pingInterval: 5000\` is set but there's no application-level heartbeat. If the signaling server is alive but the WebRTC data channel degrades, \`peer.on('disconnected')\` won't fire.

4. **Missing debugging infrastructure**. The console.log messages are sparse and don't include timestamps or peer IDs. When sync fails, there's no way to trace the failure.

5. **No monorepo TypeScript project references**. \`p2p-mesh-core\` is a separate package, but no \`tsconfig.json\` references exist in the workspace — import resolution relies on hoisted node_modules.

### Fix Required
- \`startGarbageCollection()\`: Only admin/master should execute GC. Verify role check happens inside the interval callback, not outside.
- Add exponential backoff to reconnection: start at 1s, double each attempt up to 30s max
- Add application-level ping/pong messages every 30s
- Add timestamped debug logging with \`[P2P]\` prefix and peer ID
- Add proper monorepo TypeScript configuration

### Files
- packages/p2p-mesh-core/src/database-sync.ts (GC method)
- packages/p2p-mesh-core/src/p2p.ts (reconnection, ping/pong, logging)
- Root tsconfig.json and packages/p2p-mesh-core/tsconfig.json"
