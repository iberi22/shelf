/** Pure PeerJS options resolution. Never falls back to the public PeerJS broker. */
export interface PeerSignaling {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

export type PeerOptionsResult =
  | { enabled: true; options: Record<string, unknown> }
  | { enabled: false; reason: 'unconfigured' };

export function resolvePeerOptions(input: { isDev: boolean; signaling?: PeerSignaling }): PeerOptionsResult {
  if (input.isDev) {
    return {
      enabled: true,
      options: {
        host: '127.0.0.1',
        port: 9000,
        path: '/',
        secure: false,
        pingInterval: 5000,
        debug: 1,
        config: { iceServers: [] },
      },
    };
  }
  if (input.signaling) {
    const { host, port, path, secure } = input.signaling;
    return { enabled: true, options: { host, port, path, secure, debug: 1, pingInterval: 5000 } };
  }
  return { enabled: false, reason: 'unconfigured' };
}
