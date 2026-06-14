declare module 'edge-mesh' {
  export interface EdgeMeshConfig {
    localPeerId: string;
    transport: {
      send(to: string, data: Uint8Array): void;
      broadcast(data: Uint8Array): void;
      onMessage(callback: (from: string, data: Uint8Array) => void): void;
      onPeerConnect(callback: (peerId: string) => void): void;
      onPeerDisconnect(callback: (peerId: string) => void): void;
    };
  }

  export class EdgeMesh {
    constructor(config: EdgeMeshConfig);
    getNamespace(name: string): {
      doc: import('yjs').Doc;
    };
  }
}
