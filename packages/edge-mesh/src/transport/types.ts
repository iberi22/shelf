export interface ITransport {
  send(peerId: string, data: Uint8Array): Promise<void>;
  broadcast(data: Uint8Array): Promise<void>;
  onMessage(callback: (peerId: string, data: Uint8Array) => void): void;
  onConnect(callback: (peerId: string) => void): void;
  onDisconnect(callback: (peerId: string) => void): void;
  connect(peerId: string): Promise<void>;
  disconnect(): Promise<void>;
}
