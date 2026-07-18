# [Ola H · 01] Encrypt EDGE_MESH_ENVELOPE when dual-ready (SRC-PQC-001)

> Wave: **Ola H — Close Partial Features** for Shelf offline-first inventory monorepo.  
> SSOT gap: SRC-PQC-001 ~78% — dual-ready YJS app-AES works for `YJS_*` but **envelope wire path is plaintext app-layer**.  
> Prefer PR base: **`develop`** (primary integration branch). Default branch is `main` — if Jules targets main, cherry-pick logic is identical on develop HEAD.

## Web Research Required (Jules must search the web)

1. **WebRTC DataChannel security model** — search: `"WebRTC DTLS datachannel encryption" application layer encryption` — understand DTLS ≠ application payload encryption.
2. **AES-GCM + envelope size** — search: `Web Crypto AES-GCM encrypt JSON payload best practices` for existing `encryptData` pattern in this repo.
3. Do **not** invent a new crypto stack; reuse `@noble` / existing `encryptData` from `p2p-mesh-core`.

## Exact Technical Context

- **File**: `packages/p2p-mesh-core/src/p2p.ts` (~1311 lines)
- **Function**: `private shouldEncryptMessage(peerId, message)` at **~lines 1089–1110**
- **Call site**: `sendTo` at **~1077–1087** already encrypts when `shouldEncryptMessage` returns true → wraps as `{ type: "ENCRYPTED_PAYLOAD", payload: { ciphertext } }`
- **Envelope senders**: `sendEdgeMeshEnvelope` / `broadcastEdgeMeshEnvelope` at **~1284–1300** call `sendTo`/`broadcast` with `{ type: "EDGE_MESH_ENVELOPE", payload: { envelope } }`
- **Existing dual-ready flag**: `encryptYjsWhenDualReady` (default `true`) + `dualReadyEncryption: Set<string>`
- **Test pattern**: `packages/p2p-mesh-core/tests/security.test.ts` describe `"Security: dual-ready YJS app encryption"` (~lines 226–268) already calls `shouldEncryptMessage` via `(p2p as any)`

### Current code (must change)

```ts
// shouldEncryptMessage ~1090
if (message.type === "YJS_UPDATE" || message.type === "YJS_SYNC_REQUEST") {
  return this.encryptYjsWhenDualReady && this.dualReadyEncryption.has(peerId);
}
return false; // EDGE_MESH_ENVELOPE falls through → NOT encrypted
```

### Required change

When `message.type === "EDGE_MESH_ENVELOPE"`, return the **same dual-ready condition** as YJS:

```ts
if (message.type === "EDGE_MESH_ENVELOPE") {
  return this.encryptYjsWhenDualReady && this.dualReadyEncryption.has(peerId);
}
```

Optional (recommended): add `"EDGE_MESH_ENVELOPE"` to `isSensitive()` list (~1113–1121) for logging/consistency if that list is used for security decisions.

Also update `isYjsAppEncryptedForPeer` docs/comment OR add sibling helper:

```ts
public isEdgeMeshEnvelopeEncryptedForPeer(peerId: string): boolean {
  return this.isYjsAppEncryptedForPeer(peerId);
}
```

(Only if useful for tests; not required if tests call `shouldEncryptMessage` directly.)

## Problem

Phase E routes CRDT via `EDGE_MESH_ENVELOPE` when dual-ready peers exist. App-layer AES currently only covers authority + classic `YJS_*`. Inventory deltas on the envelope path can leave the app layer **unencrypted** (still DTLS, but fails product AC for selective app-AES on mesh CRDT).

## Acceptance Criteria

- [ ] `shouldEncryptMessage(peerId, { type: "EDGE_MESH_ENVELOPE", ... })` returns `false` when peer is NOT in `dualReadyEncryption`
- [ ] returns `true` when `encryptYjsWhenDualReady && dualReadyEncryption.has(peerId)` (same as YJS)
- [ ] Unit test in `packages/p2p-mesh-core/tests/security.test.ts` asserts both cases (mirror existing YJS test)
- [ ] `pnpm --dir packages/p2p-mesh-core test` passes
- [ ] No change to handshake / authority encrypt rules
- [ ] Do **not** encrypt envelopes when `encryptYjsWhenDualReady === false`

## Files to Modify

| File | Change |
|------|--------|
| `packages/p2p-mesh-core/src/p2p.ts` | Extend `shouldEncryptMessage` (+ optional `isSensitive`) |
| `packages/p2p-mesh-core/tests/security.test.ts` | New assertions for EDGE_MESH_ENVELOPE |

**DO NOT touch:** `apps/shelf-inventory/**`, `packages/edge-mesh/**` (except if type import needed — should not be), other wave issues.

**NEVER create `.patch` / loose root scripts.** Edit TypeScript sources only.

## Verification

```bash
pnpm --dir packages/p2p-mesh-core test
pnpm --dir packages/p2p-mesh-core exec tsc --noEmit   # if available
```

## Dependencies and Merge Order

- **Depends on:** nothing
- **Can run in parallel with:** Ola H · 02, 03, 04 (no shared files)
- **SRC-ID:** SRC-PQC-001 / ROADMAP-010 residual
