import { type DataConnection, Peer } from 'peerjs';
import type { AppState, P2PRole, PeerInfo } from '../types';

export type SyncMessage =
  | { type: 'STATE_UPDATE'; payload: Partial<AppState> }
  | { type: 'REQUEST_FULL_STATE' }
  | { type: 'PROMOTE_ADMIN'; payload: { targetPeerId: string } }
  | { type: 'PEER_LIST_UPDATE'; payload: PeerInfo[] }
  // Auth recovery messages
  | {
      type: 'REQUEST_ACCOUNT_RECOVERY';
      payload: { requestId: string; email: string; deviceName: string; deviceId: string };
    }
  | { type: 'RECOVERY_APPROVED'; payload: { requestId: string; encryptedSeed: string; tempKey: string } }
  | { type: 'RECOVERY_DENIED'; payload: { requestId: string; reason: string } }
  | { type: 'DEVICE_AUTHORIZED'; payload: { deviceId: string; deviceName: string; authorizedAt: string } };

class P2PManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private onMessageCallbacks: ((message: SyncMessage, fromPeerId: string) => void)[] = [];
  private onConnectionChangeCallbacks: ((peers: PeerInfo[]) => void)[] = [];
  private onRecoveryRequestCallbacks: ((
    requestId: string,
    email: string,
    deviceName: string,
    fromPeerId: string,
  ) => void)[] = [];

  public localPeerId: string | null = null;
  public role: P2PRole = 'collaborator';
  private peers: PeerInfo[] = [];

  public init(peerId?: string) {
    if (this.peer) return;

    this.peer = peerId ? new Peer(peerId) : new Peer();

    this.peer.on('open', (id) => {
      this.localPeerId = id;
      console.log(`My peer ID is: ${id}`);
      // Master node is admin by default
      if (peerId === 'shelf-master') {
        this.role = 'admin';
      }
    });

    this.peer.on('connection', (conn) => {
      this.handleConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS error:', err);
    });
  }

  private handleConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.updatePeerList(conn.peer, 'collaborator');

      conn.on('data', (data) => {
        const message = data as SyncMessage;
        // Route recovery requests to dedicated callbacks
        if (message.type === 'REQUEST_ACCOUNT_RECOVERY') {
          for (const cb of this.onRecoveryRequestCallbacks) {
            cb(message.payload.requestId, message.payload.email, message.payload.deviceName, conn.peer);
          }
          return;
        }
        for (const cb of this.onMessageCallbacks) {
          cb(message, conn.peer);
        }
      });

      conn.on('close', () => {
        this.connections.delete(conn.peer);
        this.peers = this.peers.filter((p) => p.id !== conn.peer);
        this.notifyConnectionChange();
      });
    });
  }

  public connect(peerId: string) {
    if (!this.peer || this.connections.has(peerId)) return;
    const conn = this.peer.connect(peerId);
    this.handleConnection(conn);
  }

  public broadcast(message: SyncMessage) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }

  public sendTo(peerId: string, message: SyncMessage) {
    const conn = this.connections.get(peerId);
    if (conn?.open) {
      conn.send(message);
    }
  }

  private updatePeerList(id: string, role: P2PRole) {
    if (!this.peers.find((p) => p.id === id)) {
      this.peers.push({ id, role, lastSeen: new Date().toISOString() });
      this.notifyConnectionChange();
    }
  }

  private notifyConnectionChange() {
    for (const cb of this.onConnectionChangeCallbacks) {
      cb([...this.peers]);
    }
  }

  public onMessage(cb: (message: SyncMessage, fromPeerId: string) => void) {
    this.onMessageCallbacks.push(cb);
  }

  public onConnectionChange(cb: (peers: PeerInfo[]) => void) {
    this.onConnectionChangeCallbacks.push(cb);
  }

  /**
   * Register a callback for incoming account recovery requests.
   * Called on the master device when another device wants to recover.
   */
  public onRecoveryRequest(cb: (requestId: string, email: string, deviceName: string, fromPeerId: string) => void) {
    this.onRecoveryRequestCallbacks.push(cb);
  }

  /**
   * Send an account recovery request to a peer (master device).
   */
  public sendRecoveryRequest(toPeerId: string, requestId: string, email: string, deviceName: string, deviceId: string) {
    this.sendTo(toPeerId, {
      type: 'REQUEST_ACCOUNT_RECOVERY',
      payload: { requestId, email, deviceName, deviceId },
    });
  }

  /**
   * Approve a recovery request — sends the encrypted seed to the requesting device.
   */
  public approveRecovery(toPeerId: string, requestId: string, encryptedSeed: string, tempKey: string) {
    this.sendTo(toPeerId, {
      type: 'RECOVERY_APPROVED',
      payload: { requestId, encryptedSeed, tempKey },
    });
  }

  /**
   * Deny a recovery request.
   */
  public denyRecovery(toPeerId: string, requestId: string, reason = 'Request denied by user') {
    this.sendTo(toPeerId, {
      type: 'RECOVERY_DENIED',
      payload: { requestId, reason },
    });
  }

  public disconnect() {
    for (const conn of Array.from(this.connections.values())) {
      conn.close();
    }
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

export const p2pManager = new P2PManager();
