## Problem
Pro users need guaranteed cloud backups beyond local P2P.

## Solution
Build cloud-sync.ts to periodically push the Yjs CRDT state to Supabase.

## Testing
- Integration tests mocking the Supabase REST API.
- Verify sync conflict resolution.