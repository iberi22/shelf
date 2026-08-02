/**
 * Database Sync Module — barrel re-export.
 *
 * This directory replaces the former monolithic database-sync.ts by splitting
 * the logic into focused sub-modules:
 *
 *   types.ts              — Shared type definitions
 *   authority-checks.ts   — Permission & authority resolution
 *   connection-tracking.ts — Peer connection events, linked/ephemeral nodes, failover
 *   entity-managers.ts    — Collection mapping, CRUD, state init/get, GC
 *   merge-engine.ts       — CRDT apply, state vector, security revert, observers
 *   database-sync-manager.ts — The DatabaseSyncManager class (public API)
 */

export type { InviteAuthorityPermissions } from './authority-checks';

export { canInvite, getDefaultPermissions, isAuthorityPeer, isLocalAuthority } from './authority-checks';
// Re-export the main class and singleton — this is what consumers import
export { DatabaseSyncManager, dbSync } from './database-sync-manager';

// Re-export the ConnectionEvent type (was previously exported from database-sync.ts)
export type { ConnectionEvent, EntityRecord, LinkedNodeRecord, SyncEntityRecord } from './types';
