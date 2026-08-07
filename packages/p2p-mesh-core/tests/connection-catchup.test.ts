import { describe, expect, it, vi, beforeEach } from 'vitest';
import { onConnectionOpen } from '../src/p2p/message-handler';
import { dbSync } from '../src/database-sync';
import type { MessageHandlerContext } from '../src/p2p/message-handler';

describe('P2P Connection Catch-up Sync', () => {
  beforeEach(() => {
    dbSync.isReady = true;
    dbSync.localPeerId = 'local-peer';
  });

  it('triggers YJS_SYNC_REQUEST on connection open', async () => {
    const sentMessages: { peerId: string; message: any }[] = [];
    const broadcastMessages: any[] = [];

    const mockCtx: Partial<MessageHandlerContext> = {
      localPeerId: 'local-peer',
      role: 'collaborator',
      connections: new Map(),
      connectingPeers: new Set(),
      lastSentStateVectors: new Map(),
      dualReadyEncryption: new Set(),
      health: {
        markConnected: vi.fn(),
        markOffline: vi.fn(),
        markPing: vi.fn(),
        markPong: vi.fn(),
      },
      updatePeerList: vi.fn(),
      broadcastPeerList: vi.fn(),
      sendTo: async (peerId, message) => {
        sentMessages.push({ peerId, message });
      },
      broadcast: (message) => {
        broadcastMessages.push(message);
      },
      kemKeyPair: { publicKey: new Uint8Array(), secretKey: new Uint8Array() },
      dsaKeyPair: { publicKey: new Uint8Array(), secretKey: new Uint8Array() },
      pendingChallenges: new Map(),
    };

    const mockConn: any = {
      peer: 'peer-b',
      open: true,
      send: vi.fn(),
    };

    onConnectionOpen(mockCtx as MessageHandlerContext, mockConn);

    // Verify that requestYjsSync was triggered, which sent a YJS_SYNC_REQUEST to peer-b
    const syncRequest = sentMessages.find(
      (s) => s.peerId === 'peer-b' && s.message.type === 'YJS_SYNC_REQUEST'
    );

    expect(syncRequest).toBeDefined();
    expect(syncRequest?.message.payload).toEqual(
      expect.objectContaining({
        respondWithRequest: true,
      })
    );
  });
});
