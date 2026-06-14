import type { EdgeMeshNode, PeerDescriptor } from '../types';

export class PresenceManager {
  private peers: Map<string, PeerDescriptor> = new Map();
  private node: EdgeMeshNode;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private isStarted = false;

  private boundOnPeerConnected = (peerId: string) => this.onPeerConnected(peerId);
  private boundOnPeerDisconnected = (peerId: string) => this.onPeerDisconnected(peerId);
  private boundOnMessage = (message: any) => this.onMessage(message);

  constructor(node: EdgeMeshNode) {
    this.node = node;
  }

  start() {
    if (this.isStarted) return;
    this.isStarted = true;

    this.node.on('peer:connected', this.boundOnPeerConnected);
    this.node.on('peer:disconnected', this.boundOnPeerDisconnected);
    this.node.on('message', this.boundOnMessage);

    this.heartbeatInterval = setInterval(() => {
      this.node.broadcast({
        type: 'mesh:heartbeat',
        payload: { timestamp: Date.now() },
      }).catch(err => console.error('Failed to send heartbeat', err));
    }, 30000);
  }

  stop() {
    if (!this.isStarted) return;
    this.isStarted = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    this.node.off('peer:connected', this.boundOnPeerConnected);
    this.node.off('peer:disconnected', this.boundOnPeerDisconnected);
    this.node.off('message', this.boundOnMessage);
  }

  private onPeerConnected(peerId: string) {
    this.peers.set(peerId, { id: peerId, status: 'online', lastSeen: Date.now() });
  }

  private onPeerDisconnected(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.status = 'offline';
      peer.lastSeen = Date.now();
    }
  }

  private onMessage({ type, payload, sourcePeerId }: { type: string; payload: any; sourcePeerId: string }) {
    if (type === 'mesh:heartbeat') {
      this.peers.set(sourcePeerId, {
        id: sourcePeerId,
        status: 'online',
        lastSeen: Date.now(),
        ...payload,
      });
    }
  }

  getPeers(): PeerDescriptor[] {
    return Array.from(this.peers.values());
  }

  getOnlinePeers(): PeerDescriptor[] {
    return this.getPeers().filter(p => p.status === 'online');
  }
}
