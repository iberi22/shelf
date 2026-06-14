import * as Y from 'yjs';

export interface Transport {
  send(to: string, data: Uint8Array): void;
  broadcast(data: Uint8Array): void;
  onMessage(callback: (from: string, data: Uint8Array) => void): void;
  onPeerConnect(callback: (peerId: string) => void): void;
  onPeerDisconnect(callback: (peerId: string) => void): void;
}

export interface CrdtAdapter {
  applyUpdate(update: Uint8Array, origin?: any): void;
  getUpdate(): Uint8Array;
  onChange(callback: (update: Uint8Array, origin: any) => void): void;
  doc: Y.Doc;
}

export interface EdgeMeshConfig {
  transport: Transport;
  localPeerId: string;
}
