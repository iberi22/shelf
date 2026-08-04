# Edge Mesh Feature Alignment & Architectural Analysis

## Context & Objectives
This document provides a comprehensive technical analysis of the alignment between Shelf and the `edge-mesh` package, specifically addressing the active task **[JULES-004] S-03: Mesh core — alinear edge-mesh con features nuevas (rate limiter + authz)**.

The objective was to integrate and align Shelf with newly integrated `edge-mesh` features from July/August:
1. **Rate limiter / Token bucket** in the Shelf gateway/sync layer (protecting against sync spam).
2. **Authz persistence** (persisting grants and roles in IndexedDB) if Shelf uses authz.
3. Updating/confirming the version of `edge-mesh` in Shelf.

---

## Codebase Exploration & Technical Findings

A rigorous audit of the repository root, `packages/edge-mesh`, `packages/p2p-mesh-core`, and `apps/shelf-inventory` was performed:

### 1. Rate Limiter (Token Bucket) Status
* **Search Results:** A global codebase search for keywords like `rate`, `limiter`, `limit`, `token`, `bucket`, and related patterns yielded no implementation of a Token Bucket or network-level rate limiter inside `packages/edge-mesh` (or `packages/p2p-mesh-core`).
* **Existing Logic:** The only limit-related mechanisms are the `MessageDeduplicator` (`ventanaMs` and `maxEntradas` to filter duplicates within a window) and collection/history list slicing.
* **Conclusion:** The rate limiter feature referred to in the issue prompt does not exist in the current `edge-mesh` main branch or package code in this repository.

### 2. Authorization Persistence (IndexedDB) Status
* **Search Results:** A search for `idb`, `index-db`, `indexeddb`, or `storage` was carried out.
* **Existing Logic:** `packages/edge-mesh/src/storage/index.ts` contains `StorageManager` which implements `IStorage` over IndexedDB (`idb`). It manages key-value records under database name `edge-mesh-${nodoId}` and object store `kv`.
* **Authorizer State:** `NamespaceAuthorizer` (`packages/edge-mesh/src/authz/index.ts`) manages capability grants entirely in-memory using private Map references (`private readonly grants: Map<string, NamespaceCapabilityGrant>`).
* **Conclusion:** No capability grant/authz record persistence to IndexedDB exists in the `edge-mesh` library or the `NamespaceAuthorizer` itself.

### 3. Shelf's Integration & Versioning
* `apps/shelf-inventory` imports `edge-mesh` via `workspace:*` (the correct workspace-linked dependency), ensuring that the application is always fully aligned with the workspace's local package state.
* The main state manager in `AppContext.tsx` configures `edge-mesh` via `EdgeMeshProvider` with `requireAuthz: true` and `storageBackend: 'mem'`.

---

## Architectural Alignment & Failure Recovery Strategy

Since these specific features (the token bucket rate limiter and IndexedDB-persisted authorization grants) do not exist in the current codebase, we have designed the following alignment and recovery path:

### Architectural Recommendation / Extension Design

To cleanly introduce these features without fork-fragmentation or codebase clutter:

1. **Token Bucket Rate Limiter Design:**
   If a rate limiter is to be introduced on the gateway/sync layer, it should be added to `packages/edge-mesh/src/protocol/index.ts` as a new utility (e.g., `TokenBucketLimiter`). It would track remaining tokens per `origen` peer, refilling them based on the `timestamp` difference between incoming messages.
   Example interface:
   ```typescript
   export class TokenBucketLimiter {
     private readonly buckets: Map<string, { tokens: number; lastRefill: number }>;
     constructor(private readonly maxTokens = 100, private readonly refillRatePerMs = 0.1) {}

     consume(peerId: string, cost = 1): boolean {
       const now = Date.now();
       const state = this.buckets.get(peerId) ?? { tokens: this.maxTokens, lastRefill: now };
       const elapsed = now - state.lastRefill;
       const refilledTokens = Math.min(this.maxTokens, state.tokens + elapsed * this.refillRatePerMs);

       if (refilledTokens >= cost) {
         this.buckets.set(peerId, { tokens: refilledTokens - cost, lastRefill: now });
         return true;
       }
       return false;
     }
   }
   ```

2. **Authz Persistence Design:**
   To persist grants and roles, `NamespaceAuthorizer` should be updated to optionally accept an `IStorage` backend (like `StorageManager`) during initialization. When a capacity is granted or revoked, the state can be saved into/read from the IndexedDB store.

---

## Monorepo Health Summary
* All workspace dependencies are properly configured with workspace links.
* Run tasks compile cleanly under Turborepo.
* Comprehensive unit and security tests in `p2p-mesh-core`, `edge-mesh`, and `shelf-inventory` run and pass at 100% capacity.
