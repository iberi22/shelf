/**
 * SyncMessage type definitions and related types for the P2P mesh.
 *
 * Extracted from p2p.ts for modularity — every export here was previously
 * exported from the monolithic p2p.ts module.
 */

import type { PeerHealthState } from 'edge-mesh';
import type { AppState, P2PRole, PeerInfo, PeerPermissions } from '../types';

// ─── Signed CRDT envelope (SHELF-113) ───────────────────────────────────────

/**
 * Signed CRDT envelope carried by `YJS_UPDATE` messages.
 *
 * Wire format (JSON-safe, hex-encoded):
 *   { data: YjsUpdate (hex), signature: ML-DSA-65 (hex), peerId, timestamp }
 *
 * The ML-DSA signature is computed over the raw `data` bytes with the
 * sender's registered public key (stored in the CRDT `linkedNodes` metadata
 * document). Receivers MUST verify the signature against the peer's
 * registered key and reject envelopes with invalid/missing signatures.
 */
export interface CrdtEnvelope {
  /** Yjs update bytes, hex-encoded for JSON transport. */
  data: string;
  /** ML-DSA-65 signature over `data` (hex-encoded). */
  signature: string;
  /** Peer ID of the signing peer. MUST match the connection peer at receive time. */
  peerId: string;
  /** Envelope creation time (ms epoch). Rejected when stale or in the future. */
  timestamp: number;
}

// ─── Public SyncMessage union ───────────────────────────────────────────────

export type SyncMessage =
  | { type: 'ENCRYPTED_PAYLOAD'; payload: { ciphertext: string } }
  /** Sent after local AES key is ready; peer marks dual-ready when both have keys. */
  | { type: 'ENCRYPTION_READY'; payload?: { v?: number } }
  | { type: 'STATE_UPDATE'; payload: Partial<AppState> }
  | { type: 'REQUEST_FULL_STATE' }
  | {
      type: 'PROMOTE_ADMIN';
      payload: { targetPeerId: string; signature?: string; dsaPublicKey?: string };
    }
  | {
      type: 'CHANGE_ROLE';
      payload: {
        targetPeerId: string;
        role: P2PRole;
        permissions?: PeerPermissions;
        /** SHELF-104: ML-DSA admin-claim signature over `shelf:admin-claim:<senderPeerId>`. */
        signature?: string;
        /** SHELF-104: sender DSA public key (must match CRDT-registered key). */
        dsaPublicKey?: string;
      };
    }
  | { type: 'PEER_LIST_UPDATE'; payload: PeerInfo[] }
  | {
      type: 'PQC_HANDSHAKE';
      payload: {
        kemPublicKey: string;
        dsaPublicKey: string;
        challenge: string;
      };
    }
  | {
      type: 'PQC_KEM_REPLY';
      payload: {
        ciphertext: string;
        signature: string;
        responderChallenge: string;
        dsaPublicKey?: string;
      };
    }
  | {
      type: 'PQC_KEM_REPLY_ACK';
      payload: {
        signature: string;
      };
    }
  | {
      type: 'PQC_HANDSHAKE_REQUEST';
      payload: { kemPubKey: string; dsaPubKey: string; deviceName: string };
    }
  | {
      type: 'PQC_HANDSHAKE_RESPONSE';
      payload: { cipherText: string; signature: string; dsaPubKey: string };
    }
  | {
      type: 'YJS_UPDATE';
      payload: {
        update: string;
        branchId?: string;
        /** SHELF-113 signed envelope — signature is mandatory on the mesh. */
        signature?: string;
        signerPeerId?: string;
        timestamp?: number;
      };
    }
  | {
      type: 'YJS_SYNC_REQUEST';
      payload: { stateVector: string; branchId?: string; respondWithRequest?: boolean };
    }
  | { type: 'SET_ACTIVE_BRANCH'; payload: { branchId: string } }
  | {
      type: 'UPDATE_PEER_PERMISSIONS';
      payload: {
        targetPeerId: string;
        permissions: PeerPermissions;
        role?: P2PRole;
        /** SHELF-104: ML-DSA admin-claim signature over `shelf:admin-claim:<senderPeerId>`. */
        signature?: string;
        /** SHELF-104: sender DSA public key (must match CRDT-registered key). */
        dsaPublicKey?: string;
      };
    }
  | { type: 'PING'; peerId?: string; timestamp?: number }
  | { type: 'PONG'; peerId?: string; timestamp?: number }
  // Auth recovery messages
  | {
      type: 'REQUEST_ACCOUNT_RECOVERY';
      payload: {
        requestId: string;
        email: string;
        deviceName: string;
        deviceId: string;
      };
    }
  | {
      type: 'RECOVERY_APPROVED';
      payload: { requestId: string; encryptedSeed: string; tempKey: string };
    }
  | { type: 'RECOVERY_DENIED'; payload: { requestId: string; reason: string } }
  | {
      type: 'DEVICE_AUTHORIZED';
      payload: { deviceId: string; deviceName: string; authorizedAt: string };
    }
  | { type: 'CRDT_SYNC_ENVELOPE'; payload: { envelope: CrdtEnvelope; branchId?: string } }
  | { type: 'EDGE_MESH_SYNC'; payload: Uint8Array }
  /** Phase C: edge-mesh Envolvente over the same PeerJS data channel. */
  | {
      type: 'EDGE_MESH_ENVELOPE';
      payload: { envelope: import('../p2p-transport-adapter').EdgeMeshEnvelopeWire };
    };

// ─── Supporting types ───────────────────────────────────────────────────────

export type ConnectionErrorInfo = {
  peerId?: string;
  type?: string;
  message: string;
  source: 'peerjs' | 'connection';
};

export type PeerHealthInfo = PeerHealthState;

export type HandshakeRequestPayload = {
  kemPubKey: string;
  dsaPubKey: string;
  deviceName: string;
};

export type HandshakeResponsePayload = {
  cipherText: string;
  signature: string;
  dsaPubKey: string;
};
