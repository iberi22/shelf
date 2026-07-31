import type { PeerInfo, PeerPermissions } from '../types';

/**
 * Connection event tracking a peer's status transitions over time.
 */
export type ConnectionEvent = {
  peerId: string;
  eventType: 'connected' | 'verified' | 'offline' | 'disconnected' | 'reconnected';
  timestamp: number;
};

/**
 * Base shape of an entity stored in any Y.Map collection.
 */
export type EntityRecord = {
  id: string;
  lastSeen?: string;
  action?: string;
  timestamp?: string;
  updatedAt?: string;
  updatedBy?: string;
};

/**
 * Extended entity record that carries a base timestamp for merge resolution.
 */
export type SyncEntityRecord = EntityRecord & {
  __baseUpdatedAt?: string;
};

/**
 * A peer node persisted in the CRDT (linkedNodes map).
 */
export type LinkedNodeRecord = Omit<PeerInfo, 'lastSeen'> & {
  permissions?: PeerPermissions;
  isMaster?: boolean;
  lastSeen: string;
  status?: 'connected' | 'verified' | 'offline';
  connectedAt?: string;
  verifiedAt?: string;
};

/**
 * Minimal context interface that extracted helper functions operate on.
 * Avoids passing 10+ arguments to every function.
 */
export interface SyncContext {
  doc: import('yjs').Doc;
  localPeerId: string | null;
  activeBranchId: string | undefined;
  isReady: boolean;
  masterRole: string | null;
  metadata: import('yjs').Map<string>;
  linkedNodes: import('yjs').Map<LinkedNodeRecord>;
  ephemeralNodes: Map<string, Partial<LinkedNodeRecord>>;
  peerHistory: Map<string, ConnectionEvent[]>;
}
