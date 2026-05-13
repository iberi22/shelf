import { type DataConnection, Peer } from 'peerjs';
import type { AppState, P2PRole, PeerInfo } from '../types';

export type SyncMessage =
  | { type: 'STATE_UPDATE'; payload: Partial<AppState> }
  | { type: 'REQUEST_FULL_STATE' }
  | { type: 'PROMOTE_ADMIN'; payload: { targetPeerId: string } }
  | { type: 'PEER_LIST_UPDATE'; payload: PeerInfo[] };

class P2PManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private onMessageCallbacks: ((message: SyncMessage, fromPeerId: string) => void)[] = [];
  private onConnectionChangeCallbacks: ((peers: PeerInfo[]) => void)[] = [];

  public localPeerId: string | null = null;
  public role: P2PRole = 'collaborator';
  private peers: PeerInfo[] = [];

  constructor() {}

  public init(peerId?: string) {
    if (this.peer) return;

    this.peer = peerId ? new Peer(peerId) : new Peer();

    this.peer.on('open', (id: string) => {
      this.localPeerId = id;
      console.log('My peer ID is: ' + id);
      // Master node is admin by default
      if (peerId === 'shelf-master') {
        this.role = 'admin';
      }
    });

    this.peer.on('connection', (conn: DataConnection) => {
      this.handleConnection(conn);
    });

    this.peer.on('error', (err: any) => {
      console.error('PeerJS error:', err);
    });
  }

  private handleConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.updatePeerList(conn.peer, 'collaborator');

      conn.on('data', (data: any) => {
        this.onMessageCallbacks.forEach((cb) => cb(data as SyncMessage, conn.peer));
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
    if (conn && conn.open) {
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
    this.onConnectionChangeCallbacks.forEach((cb) => cb([...this.peers]));
  }

  public onMessage(cb: (message: SyncMessage, fromPeerId: string) => void) {
    this.onMessageCallbacks.push(cb);
  }

  public onConnectionChange(cb: (peers: PeerInfo[]) => void) {
    this.onConnectionChangeCallbacks.push(cb);
  }

  public disconnect() {
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

export const p2pManager = new P2PManager();
