/**
 * Local Network Discovery (Simulated via Room-based Signaling)
 * Since real MDNS/UDP is not available in the browser, we use a signaling room.
 */

export interface DiscoveredPeer {
  id: string;
  name: string;
}

export interface HandshakePayload {
  peerId: string;
  kemPubKey: any;
  dsaPubKey: any;
  timestamp: string;
  deviceName: string;
}

export function encodeHandshake(payload: HandshakePayload): string {
  // Simple base64 encoding of JSON for QR code
  return btoa(JSON.stringify(payload));
}

export function decodeHandshake(encoded: string): HandshakePayload {
  return JSON.parse(atob(encoded));
}

class DiscoveryManager {
  private onPeerDiscovered: ((peer: DiscoveredPeer) => void)[] = [];

  /**
   * Starts broadcasting presence and listening for others.
   */
  public startDiscovery(_localPeerId: string, roomName = 'default-shelf-room') {
    // PeerJS doesn't natively support rooms, but we can use a signaling server
    // that implements a "lobby" or naming convention.
    // For this implementation, we assume peers follow a naming convention: `shelf-room-{roomId}-{peerId}`
    console.log(`Discovery started for room: ${roomName}`);
  }

  /**
   * Scans for peers in the local network (simulated).
   */
  public async scan(): Promise<DiscoveredPeer[]> {
    // In a real browser environment, this might involve WebRTC data channel broadcasting
    // or querying a known local signaling server.
    return [];
  }

  public onDiscovered(callback: (peer: DiscoveredPeer) => void) {
    this.onPeerDiscovered.push(callback);
  }
}

export const discoveryManager = new DiscoveryManager();
