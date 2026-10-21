import { describe, expect, it, vi } from 'vitest';
import {
  SessionCipher,
  buildAad,
  buildHandshakeTranscript,
  decapsulate,
  deriveSessionKey,
  encapsulate,
  generateDSAKeyPair,
  generateKEMKeyPair,
  sign,
  toHex,
  verify,
} from '../src/crypto-pqc';
import { dbSync } from '../src/database-sync';
import { getSessionCipher, handleMessage, onConnectionOpen } from '../src/p2p/message-handler';
import type { MessageHandlerContext } from '../src/p2p/message-handler';

const kemA = generateKEMKeyPair();
const kemB = generateKEMKeyPair();
const enc = encapsulate(kemB.publicKey);
const base = {
  sharedSecret: enc.sharedSecret,
  kemCiphertext: enc.ciphertext,
  initiatorKemPublicKey: kemA.publicKey,
  responderKemPublicKey: kemB.publicKey,
  peerIdA: 'peer-a',
  peerIdB: 'peer-b',
};

/** Non-extractable keys can't be exported; compare by cross-decrypting. */
async function sameKey(k1: CryptoKey, k2: CryptoKey): Promise<boolean> {
  const iv = new Uint8Array(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k1, new Uint8Array([1, 2, 3]));
  try {
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k2, ct);
    return true;
  } catch {
    return false;
  }
}

describe('deriveSessionKey (HKDF v2)', () => {
  it('is deterministic, order-insensitive in peer ids, and non-extractable', async () => {
    const k1 = await deriveSessionKey(base);
    const k2 = await deriveSessionKey({ ...base, peerIdA: 'peer-b', peerIdB: 'peer-a' });
    expect(k1.extractable).toBe(false);
    expect(await sameKey(k1, k2)).toBe(true);
  });

  it('differs for different transcript material or peer ids', async () => {
    const k = await deriveSessionKey(base);
    const other = encapsulate(kemB.publicKey);
    expect(await sameKey(k, await deriveSessionKey({ ...base, kemCiphertext: other.ciphertext }))).toBe(false);
    expect(await sameKey(k, await deriveSessionKey({ ...base, initiatorKemPublicKey: kemB.publicKey }))).toBe(false);
    expect(await sameKey(k, await deriveSessionKey({ ...base, peerIdB: 'peer-c' }))).toBe(false);
  });
});

describe('SessionCipher', () => {
  async function pair() {
    const key = await deriveSessionKey(base);
    return { a: new SessionCipher(key, 'peer-a', 'peer-b'), b: new SessionCipher(key, 'peer-b', 'peer-a') };
  }

  it('round-trips and rejects AAD mismatch', async () => {
    const { a, b } = await pair();
    const sealed = await a.seal('hello', 'ENCRYPTED_PAYLOAD');
    await expect(b.open(sealed, 'OTHER_TYPE')).rejects.toBeTruthy();
    expect(await b.open(sealed, 'ENCRYPTED_PAYLOAD')).toBe('hello');
  });

  it('rejects wrong from/to in AAD (message replayed to wrong peer)', async () => {
    const { a } = await pair();
    const key = await deriveSessionKey(base);
    const mallory = new SessionCipher(key, 'peer-c', 'peer-a');
    const sealed = await a.seal('x', 'ENCRYPTED_PAYLOAD');
    await expect(mallory.open(sealed, 'ENCRYPTED_PAYLOAD')).rejects.toBeTruthy();
    expect(toHex(buildAad('t', 'f', 'to'))).not.toBe(toHex(buildAad('t', 'to', 'f')));
  });

  it('never repeats a nonce and rejects replays/reflection', async () => {
    const { a, b } = await pair();
    const nonces = new Set<string>();
    const sealed: string[] = [];
    for (let i = 0; i < 50; i++) {
      const s = await a.seal('m', 'ENCRYPTED_PAYLOAD');
      sealed.push(s);
      nonces.add(toHex(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).slice(0, 12)));
    }
    expect(nonces.size).toBe(50);
    expect(await b.open(sealed[0], 'ENCRYPTED_PAYLOAD')).toBe('m');
    await expect(b.open(sealed[0], 'ENCRYPTED_PAYLOAD')).rejects.toThrow(/replay/);
    await expect(a.open(sealed[1], 'ENCRYPTED_PAYLOAD')).rejects.toBeTruthy(); // reflection
  });
});

dbSync.isReady = true;
dbSync.localPeerId = 'local-peer';

function makeNode(id: string, pinned: Record<string, string> = {}) {
  const kem = generateKEMKeyPair();
  const dsa = generateDSAKeyPair();
  const ctx: Partial<MessageHandlerContext> = {
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
    signFn: (m) => sign(m, dsa.secretKey),
    verifyFn: (sig, m, pk) => {
      try {
        return verify(sig, m, Uint8Array.from(pk.match(/../g)!.map((h) => Number.parseInt(h, 16))));
      } catch {
        return false;
      }
    },
    getPinnedDsaKey: (p) => pinned[p],
  };
  return { ctx: ctx as MessageHandlerContext, dsaHex: toHex(dsa.publicKey) };
}

function makeConn(peer: string) {
  return { peer, open: true, sent: [] as any[], send(m: any) { this.sent.push(m); }, close: vi.fn() } as any;
}

describe('handshake v2', () => {
  async function setup(pinA = true, pinB = true) {
    // 'peer-z' > 'peer-a' so peer-z initiates
    const z = makeNode('peer-z');
    const a = makeNode('peer-a');
    (z.ctx as any).getPinnedDsaKey = (p: string) => (pinA && p === 'peer-a' ? a.dsaHex : undefined);
    (a.ctx as any).getPinnedDsaKey = (p: string) => (pinB && p === 'peer-z' ? z.dsaHex : undefined);
    const zToA = makeConn('peer-a'); // z's connection to a
    const aToZ = makeConn('peer-z');
    return { z, a, zToA, aToZ };
  }

  it('completes with matching session ciphers and signed transcript', async () => {
    const { z, a, zToA, aToZ } = await setup();
    zToA.send = (m: any) => zToA.sent.push(m);
    onConnectionOpen(z.ctx, { ...zToA, peer: 'peer-a' });
    const hello = zToA.sent.find((m: any) => m.type === 'PQC_HANDSHAKE');
    expect(hello.payload.cryptoV).toBe(2);
    await handleMessage(a.ctx, aToZ, hello);
    const reply = aToZ.sent.find((m: any) => m.type === 'PQC_KEM_REPLY');
    expect(reply.payload.cryptoV).toBe(2);
    await handleMessage(z.ctx, zToA, reply);
    const ack = zToA.sent.find((m: any) => m.type === 'PQC_KEM_REPLY_ACK');
    await handleMessage(a.ctx, aToZ, ack);
    const cz = getSessionCipher(z.ctx, 'peer-a')!;
    const ca = getSessionCipher(a.ctx, 'peer-z')!;
    expect(cz && ca).toBeTruthy();
    expect(await ca.open(await cz.seal('ping', 'ENCRYPTED_PAYLOAD'), 'ENCRYPTED_PAYLOAD')).toBe('ping');
  });

  it('rejects a tampered transcript signature', async () => {
    const { z, a, zToA, aToZ } = await setup();
    onConnectionOpen(z.ctx, zToA);
    await handleMessage(a.ctx, aToZ, zToA.sent.find((m: any) => m.type === 'PQC_HANDSHAKE'));
    const reply = aToZ.sent.find((m: any) => m.type === 'PQC_KEM_REPLY');
    const sig = reply.payload.signature as string;
    reply.payload.signature = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
    await handleMessage(z.ctx, zToA, reply);
    expect(zToA.close).toHaveBeenCalled();
    expect(getSessionCipher(z.ctx, 'peer-a')).toBeUndefined();
  });

  it('rejects a v1 reply when we advertised v2 (downgrade)', async () => {
    const { z, zToA } = await setup();
    onConnectionOpen(z.ctx, zToA);
    await handleMessage(z.ctx, zToA, {
      type: 'PQC_KEM_REPLY',
      payload: { ciphertext: '00', signature: '00', responderChallenge: '00' },
    } as any);
    expect(zToA.close).toHaveBeenCalled();
    expect(z.ctx.sharedSecrets.size).toBe(0);
  });

  it('does not trust an unpinned DSA key silently (invitation flow)', async () => {
    const { z, a, zToA, aToZ } = await setup(true, false);
    onConnectionOpen(z.ctx, zToA);
    await handleMessage(a.ctx, aToZ, zToA.sent.find((m: any) => m.type === 'PQC_HANDSHAKE'));
    expect(aToZ.sent.find((m: any) => m.type === 'PQC_KEM_REPLY')).toBeUndefined();
    expect(a.ctx.emitConnectionError).toHaveBeenCalledWith(expect.objectContaining({ type: 'UNPINNED_DSA_KEY' }));
    expect(a.ctx.encryptionKeys.size).toBe(0);
  });

  it('still accepts v1 from a peer that does not advertise v2', async () => {
    const { a, aToZ } = await setup();
    const z = makeNode('peer-z');
    await handleMessage(a.ctx, aToZ, {
      type: 'PQC_HANDSHAKE',
      payload: {
        kemPublicKey: toHex(z.ctx.kemKeyPair.publicKey),
        dsaPublicKey: z.dsaHex,
        challenge: toHex(new Uint8Array(32)),
      },
    } as any);
    expect(aToZ.sent[0].type).toBe('PQC_KEM_REPLY');
    expect(aToZ.sent[0].payload.cryptoV).toBeUndefined();
  });
});

describe('transcript', () => {
  it('changes when any bound field changes', async () => {
    const d = generateDSAKeyPair();
    const t = {
      initiatorId: 'a', responderId: 'b',
      initiatorKemPublicKey: kemA.publicKey, responderKemPublicKey: kemB.publicKey,
      initiatorDsaPublicKey: d.publicKey, responderDsaPublicKey: d.publicKey,
      kemCiphertext: enc.ciphertext, challenge: new Uint8Array(32), responderChallenge: new Uint8Array(32),
    };
    const h1 = toHex(await buildHandshakeTranscript(t));
    expect(toHex(await buildHandshakeTranscript({ ...t, responderId: 'c' }))).not.toBe(h1);
    expect(toHex(await buildHandshakeTranscript({ ...t, challenge: new Uint8Array(32).fill(1) }))).not.toBe(h1);
    void decapsulate;
  });
});
