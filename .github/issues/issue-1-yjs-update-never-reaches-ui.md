---
title: "[P2P] Critical: P2P sync not working — YJS_UPDATE never reaches P2PSyncManager message handler"
labels: ["bug", "critical", "p2p"]
assignee: jules
---

## Bug: P2P data never syncs between peers

### Root Cause Analysis

After deep codebase scan, the **primary blocker** is that `P2PSyncManager.tsx` handles `STATE_UPDATE` and `REQUEST_FULL_STATE` messages but **never handles `YJS_UPDATE`**. The CRDT-based sync via Yjs exists in `p2p.ts` but the UI layer ignores Yjs updates entirely.

### Flow Breakdown

1. Peer A makes a change -> `AppContext.dispatch()` -> `dbSync.upsertEntity()` -> Yjs Y.Map update fires `doc.on('update')` -> `p2pManager.broadcast({ type: 'YJS_UPDATE', payload: { update: toHex(update) } })`
2. Peer B receives `YJS_UPDATE` -> `dbSync.applyUpdate(fromHex(...))` -> but **nobody dispatches a SYNC_STATE** after applying the update
3. `P2PSyncManager.handleMessage` only checks `case 'STATE_UPDATE'` and `case 'REQUEST_FULL_STATE'`, never `case 'YJS_UPDATE'`

### Impact

- Remote changes received via Yjs are applied to the Y.Doc but the React state NEVER updates
- UI stays stale — users think sync is happening (shows "Synced 100%") but data never appears
- Essentially a broken read path: CRDT updates -> DB -> never reflected in UI

### Required Fix

In `P2PSyncManager.tsx`, add a `case 'YJS_UPDATE'` handler:

```ts
case 'YJS_UPDATE':
  // dbSync.applyUpdate() is already called inside p2p.ts, but the React state
  // needs to be refreshed from the Y.Doc
  const remoteState = dbSync.getState(dbSync.localPeerId);
  dispatch({ type: 'SYNC_STATE', payload: remoteState });
  break;
```

Additionally, in `p2p.ts` inside `PQC_HANDSHAKE` handler and `PQC_KEM_REPLY` handler, after calling `dbSync.applyUpdate()`, the React state must also be notified via the P2PSyncManager callback.

### Verification

- Connect 2 browser tabs
- Add a product in tab A
- Tab B should show the product within seconds
