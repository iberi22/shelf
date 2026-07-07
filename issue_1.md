## Problem
Double source of truth exists: UI dispatches local React state AND calls dbSync.upsertEntity() simultaneously.

## Solution
Adopt a unidirectional reactive pattern. The UI should only listen to Yjs/CRDT state changes, and mutations should ONLY occur via dbSync.

## Testing
- Update p2p-sync-ui.spec.ts to ensure offline writes still reflect instantly.
- Unit test the custom reactive hooks.