import { describe, expect, it, vi } from 'vitest';
import { generateDSAKeyPair, generateKEMKeyPair, sign, toHex, verify } from '../src/crypto-pqc';
import { dbSync } from '../src/database-sync';
import { getSessionCipher, handleEncryptedMessage, handleMessage, onConnectionOpen } from '../src/p2p/message-handler';
import type { MessageHandlerContext } from '../src/p2p/message-handler';
import { frameOutgoingPayload } from '../src/p2p/send-payload';

dbSync.isReady = true;
dbSync.localPeerId = 'local-peer';

function makeNode(id: string) {
  const kem = generateKEMKeyPair();
  const dsa = generateDSAKeyPair();
  const received: any[] = [];
  const ctx = {
    localPeerId: id,
    role: 'collaborator',
    kemKeyPair: kem,
    dsaKeyPair: dsa,
    sharedSecrets: new Map(),
    encryptionKeys: new Map(),
    peerDsaKeys: new Map(),
    pendingChallenges: new Map(),
    dualReadyEncryption: new Set(),
    pendingEncryptionReady: new Set(),
    connections: new Map(),
    connectingPeers: new Set(),
    lastSentStateVectors: new Map(),
    health: { markConnected: vi.fn(), markOffline: vi.fn(), markPing: vi.fn(), markPong: vi.fn() },
    updatePeerList: vi.fn(),
    broadcastPeerList: vi.fn(),
    sendTo: vi.fn(async () => {}),
    broadcast: vi.fn(),
    lastMessageTime: new Map(),
    emitConnectionError: vi.fn(),
    emitMessageCallbacks: (m: any, from: string) => received.push({ m, from }),
    onMessageCallbacks: [],
    signFn: (m: Uint8Array) => sign(m, dsa.secretKey),
    verifyFn: (sig: Uint8Array, m: Uint8Array, pk: string) => {
      try {
        return verify(sig, m, Uint8Array.from(pk.match(/../g)!.map((h) => Number.parseInt(h, 16))));
      } catch {
        return false;
      }
    },
    getPinnedDsaKey: undefined as any,
  } as unknown as MessageHandlerContext;
  return { ctx, dsaHex: toHex(dsa.publicKey), received };
}

/** In-memory channel: each side's connection delivers to the other side's handler. */
async function connected() {
  const a = makeNode('peer-a');
  const z = makeNode('peer-z'); // z > a: z initiates
  (a.ctx as any).getPinnedDsaKey = (p: string) => (p === 'peer-z' ? z.dsaHex : undefined);
  (z.ctx as any).getPinnedDsaKey = (p: string) => (p === 'peer-a' ? a.dsaHex : undefined);
  const queue: Array<() => Promise<void>> = [];
  const mk = (peer: string, target: () => { ctx: MessageHandlerContext; conn: any }) =>
    ({
      peer,
      open: true,
      sent: [] as any[],
      close: vi.fn(),
      send(m: any) {
        this.sent.push(m);
        queue.push(() => handleMessage(target().ctx, target().conn, JSON.parse(JSON.stringify(m))));
      },
    }) as any;
  const zToA: any = mk('peer-a', () => ({ ctx: a.ctx, conn: aToZ }));
  const aToZ: any = mk('peer-z', () => ({ ctx: z.ctx, conn: zToA }));
  a.ctx.connections.set('peer-z', aToZ);
  z.ctx.connections.set('peer-a', zToA);
  onConnectionOpen(a.ctx, aToZ);
  onConnectionOpen(z.ctx, zToA);
  while (queue.length) await queue.shift()!();
  return { a, z, zToA, aToZ };
}

describe('2-peer session integration (v2)', () => {
  it('completes the handshake with pinned keys and exchanges messages both ways', async () => {
    const { a, z } = await connected();
    expect(getSessionCipher(a.ctx, 'peer-z')).toBeTruthy();
    expect(getSessionCipher(z.ctx, 'peer-a')).toBeTruthy();

    const legacy = vi.fn(async () => 'LEGACY');
    const m1 = await frameOutgoingPayload(a.ctx, 'peer-z', { type: 'PING', payload: { n: 1 } } as any, legacy);
    expect(m1.type).toBe('ENCRYPTED_PAYLOAD');
    expect(legacy).not.toHaveBeenCalled();
    await handleEncryptedMessage(z.ctx, 'peer-a', m1.payload.ciphertext);

    const cz = getSessionCipher(z.ctx, 'peer-a')!;
    const ca = getSessionCipher(a.ctx, 'peer-z')!;
    const m2 = await frameOutgoingPayload(z.ctx, 'peer-a', { type: 'PING', payload: { n: 2 } } as any, legacy);
    expect(await ca.open(m2.payload.ciphertext, 'ENCRYPTED_PAYLOAD')).toContain('"n":2');
    const m3 = await frameOutgoingPayload(a.ctx, 'peer-z', { type: 'PING', payload: { n: 3 } } as any, legacy);
    expect(await cz.open(m3.payload.ciphertext, 'ENCRYPTED_PAYLOAD')).toContain('"n":3');
  });

  it('the helper output is opened by the receiver (A -> B) and tampered AAD is rejected', async () => {
    const { a, z } = await connected();
    const legacy = async () => 'LEGACY';
    const sealed = async () =>
      (await frameOutgoingPayload(a.ctx, 'peer-z', { type: 'PING', payload: {} } as any, legacy)).payload.ciphertext;
    const cz = getSessionCipher(z.ctx, 'peer-a')!;
    // wrong type
    await expect(cz.open(await sealed(), 'OTHER')).rejects.toBeTruthy();
    // wrong from/to: a cipher with swapped ids
    const { SessionCipher } = await import('../src/crypto-pqc');
    const key = (z.ctx.encryptionKeys.get('peer-a')) as CryptoKey;
    const wrongFrom = new SessionCipher(key, 'peer-z', 'peer-x');
    await expect(wrongFrom.open(await sealed(), 'ENCRYPTED_PAYLOAD')).rejects.toBeTruthy();
    const wrongTo = new SessionCipher(key, 'peer-x', 'peer-a');
    await expect(wrongTo.open(await sealed(), 'ENCRYPTED_PAYLOAD')).rejects.toBeTruthy();
    // untampered still opens
    expect(await cz.open(await sealed(), 'ENCRYPTED_PAYLOAD')).toContain('PING');
  });

  it('falls back to the legacy path for a peer without a v2 cipher', async () => {
    const a = makeNode('peer-a');
    const legacy = vi.fn(async () => 'LEGACY');
    const out = await frameOutgoingPayload(a.ctx, 'peer-v1', { type: 'PING', payload: {} } as any, legacy);
    expect(out).toEqual({ type: 'ENCRYPTED_PAYLOAD', payload: { ciphertext: 'LEGACY' } });
  });
});
