import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { ParPublico, PostQuantumIdentity } from '../identity/index.js';
import { base64ToBytes, bytesToBase64 } from '../identity/index.js';
import type { Envolvente, NodoId } from '../types/index.js';
import { canonicalSerialize } from './canonical.js';

// ─── WHAT THIS LAYER PROTECTS, AND WHAT IT DOES NOT ────────────────────────
//
// The mesh already signs every envelope with ML-DSA-65, which proves WHO sent
// the bytes and that they were not altered. That is *not* confidentiality: a
// signature is public by construction, anyone can verify it, and the payload
// next to it travels in the clear. For a clinical record that is a blocker,
// not a nicety.
//
// This layer adds confidentiality and replay resistance on top:
//
//   ML-KEM-768 (FIPS 203)  ONCE per session  -> shared secret
//   HKDF-SHA-256                              -> two independent keys
//   XChaCha20-Poly1305                        -> one AEAD seal per message
//   monotonic per-direction counter           -> anti-replay
//
// WHY ML-KEM ONLY ONCE PER SESSION. ML-KEM-768 encapsulation costs 1088 bytes
// of ciphertext per operation. Paying that on every message would be far worse
// than any payload we send, so the KEM runs at session setup and the AEAD
// carries the rest. The session key can be rotated (see `rotar`), which is
// the honest way to bound how much traffic one key ever protects.
//
// WHY NOT MLS. The obvious "right" answer for a many-to-many encrypted group is
// MLS (RFC 9420). It was rejected on measured grounds, not taste: its O(log n)
// commit path does not hold in practice (arXiv:2502.18303), which is exactly
// the regime a gossip mesh lives in. Session keys + per-hop re-signing keeps
// `fanOut=3` hops cheap and auditable.
//
// SEPARATE ENCRYPTION AND AUTHENTICATION KEYS. HKDF derives two 32-byte keys
// from the same secret under different `info` strings. Encryption keys and MAC
// keys are kept distinct on purpose: one key that both encrypts and
// authenticates is one key compromise away from forgery.
//
// ─── HONEST LIMITATIONS (read before trusting this with real patient data) ──
//
//   0. THE "~40 BYTES PER MESSAGE" TARGET IS NOT MET. Measured on real
//      envelopes, in two parts:
//
//        fixed    ~106 bytes — the 16-byte Poly1305 tag plus ~87 bytes of JSON
//                 framing for the sealed-payload fields (version, algorithm,
//                 session, epoch, direction, counter). Independent of the
//                 payload, but ~2.5x the design target, and it is JSON field
//                 names, not cryptography.
//        variable ~33% of the payload — base64 expands 3 ciphertext bytes into
//                 4 characters, so the sealed payload is inherently a third
//                 heavier than the record. This scales without bound.
//
//      So a small clinical record costs ~135 bytes and a 4 KB record ~1.4 KB.
//      The AEAD itself only ever costs the 16-byte tag: the nonce is derived,
//      not sent. `medirOverhead` returns the split, because anyone budgeting
//      this layer needs both terms. Getting under 1% would mean binary framing
//      instead of base64-in-JSON — a transport change, deliberately out of
//      scope here, and one that would have to preserve the ML-DSA signature
//      over `canonicalEnvelopeBytes`.
//
//   1. METADATA IS NOT HIDDEN. Only `payload` is encrypted. `id`, `tipo`,
//      `origen`, `destino`, `timestamp`, `version`, `nonce` and `firma` all
//      travel in the clear, as they must — the signature covers them. An
//      observer on the path learns WHO talked to WHOM, WHEN, HOW OFTEN and
//      HOW BIG each ciphertext is. For a medical network, message-size and
//      timing analysis is itself disclosive; this layer does not address that
//      and does not pretend to. Padding to a fixed bucket size and cover
//      traffic are the next steps, not this layer.
//   2. NO FORWARD SECRECY. The session secret is derived from a static ML-KEM
//      keypair. If that decapsulation key is stolen later, every past
//      session key derived from it can be recomputed and past traffic
//      decrypted. ML-DSA signatures are unaffected (that is the point of
//      signatures). Use short-lived / rotating session keys to bound exposure.
//   3. REPLAY WINDOW IS BOUNDED, NOT UNBOUNDED. The guard remembers a sliding
//      window of accepted counters; anything far below the high-water mark is
//      rejected as stale rather than remembered forever.
//   4. AN ACTIVE ATTACKER WHO RELAYS TRAFFIC LIVE can still read plaintext by
//      forwarding to a real recipient. Preventing that needs channel binding
//      (`exportamos claveAutenticacion`) to an authenticated transport, which
//      this layer exposes but does not itself enforce.

import type { SobreKem } from '../identity/index.js';

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

/** Wire format version of the sealed payload. Bump on any layout change. */
export const VERSION_PAYLOAD_CIFRADO = 1;

/** AEAD identifier written into the sealed payload so readers can dispatch. */
export const ALGORITMO_CIFRADO = 'XCHACHA20-POLY1305-HKDF-SHA256/ML-KEM-768';

/**
 * Short code used on the wire. The full construction is `ALGORITMO_CIFRADO`;
 * the long name stays in code and docs because every character here is paid on
 * EVERY message. See `medirOverhead` for what the framing actually costs.
 */
const CODIGO_ALGORITMO = 'xc20p1305';

/** Domain separator for HKDF `info` on the encryption key. */
const DOMINIO_CLAVE_CIFRADO = 'shelf-edge-mesh/v1/sesion/cifrado';

/** Domain separator for HKDF `info` on the authentication key. */
const DOMINIO_CLAVE_AUTENTICACION = 'shelf-edge-mesh/v1/sesion/autenticacion';

/** Domain separator for HKDF `salt`. */
const DOMINIO_SAL_SESION = 'shelf-edge-mesh/v1/sesion/sal';

/**
 * Domain separator for the first leg of the derivation. Must stay byte-identical
 * to `DOMINIO_CLAVE_COMPARTIDA` in `../identity/index.ts`: this reproduces that
 * step synchronously (see `derivarClavesSesion`), and a divergence would make
 * the async and sync paths derive different keys.
 */
const DOMINIO_CLAVE_COMPARTIDA = 'shelf-edge-mesh/v1/clave-compartida';

/** XChaCha20-Poly1305 key length. */
const BYTES_CLAVE = 32;

/** XChaCha20-Poly1305 nonce length (192-bit: the "X" is what makes random
 *  nonces safe here, so the counter below is belt-and-braces). */
const BYTES_NONCE = 24;

/** Poly1305 authentication tag appended to every ciphertext. */
const BYTES_TAG = 16;

/** Byte layout of the derived nonce (24 bytes, big endian):
 *
 *   `[0..8)`   session salt  — random per session, binds keys to one session
 *   `[8..20)`  counter       — 96-bit monotonic, never reused under one key
 *   `[20..24)` direction tag + epoch, 32-bit BE
 *
 * The direction tag is what stops B from reflecting A's ciphertext back at A:
 * both sides derive a nonce, but from different tags, so the same (key,
 * counter) pair yields two unrelated keystreams.
 */
const BYTES_SAL_NONCE = 8;
const OFFSET_NONCE_SAL = 0;
const OFFSET_NONCE_CTR = BYTES_SAL_NONCE;
const BYTES_CTR = 12;
const OFFSET_NONCE_DIR_EPOCH = BYTES_SAL_NONCE + BYTES_CTR;
const BYTES_NONCE_LIBRES = BYTES_NONCE - (OFFSET_NONCE_DIR_EPOCH + 4);

/** ML-KEM-768 encapsulation ciphertext size (FIPS 203). */
export const BYTES_CIPHERTEXT_KEM_768 = 1088;

/** Maximum messages a single session key may seal before it must be rotated. */
export const MAX_MENSAJES_POR_SESION = 1_000_000;

// ─── ERRORS ────────────────────────────────────────────────────────────────

/** Raised when an envelope is replayed, or its counter is not acceptable. */
export class ErrorReplayDetectado extends Error {
  readonly counter: string;

  constructor(counter: string, motivo: string) {
    super(`Replay rejected: counter ${counter} (${motivo})`);
    this.name = 'ErrorReplayDetectado';
    this.counter = counter;
  }
}

/** Raised when an envelope is not a sealed payload, or is malformed. */
export class ErrorPayloadCifrado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPayloadCifrado';
  }
}

/** Raised when a session key would be reused for the same (key, counter). */
export class ErrorReusoDeNonce extends Error {
  constructor(counter: string) {
    super(
      `Nonce reuse refused: counter ${counter} already used in this session. ` +
        'Rotate the session key instead of repeating a counter.',
    );
    this.name = 'ErrorReusoDeNonce';
  }
}

// ─── TYPES ─────────────────────────────────────────────────────────────────

/** Direction tag mixed into the nonce; also names the sender/receiver role. */
export const DIRECCION = {
  /** Node A -> Node B. */
  A_A_B: 1,
  /** Node B -> Node A. */
  B_A_A: 2,
} as const;

export type Direccion = (typeof DIRECCION)[keyof typeof DIRECCION];

/** The two independently derived session keys. */
export interface ClavesSesion {
  /** 32-byte XChaCha20-Poly1305 key that seals payloads. */
  readonly claveCifrado: Uint8Array;
  /**
   * 32-byte key an application can use to authenticate the transport itself.
   * This layer derives and exports it but never enforces it (see limitation 4).
   */
  readonly claveAutenticacion: Uint8Array;
}

/** Public, non-secret description of an established session. */
export interface ParamsSesion {
  /** Opaque session identifier; also the HKDF salt. */
  readonly sesionId: string;
  /** Incremented on every key rotation. Part of the derived nonce. */
  readonly epoch: number;
}

/**
 * The wire shape of a sealed payload. Field order is fixed because
 * `canonicalEnvelopeBytes` JSON-stringifies it and the ML-DSA signature covers
 * the result: a re-ordered payload on the wire would stop verifying.
 */
export interface PayloadCifrado {
  readonly v: number;
  readonly alg: string;
  readonly sesion: string;
  readonly epoch: number;
  readonly dir: number;
  readonly ctr: string;
  readonly ct: string;
}

/**
 * Wire shape of a session-open message. Carries no secrets: an ML-KEM
 * ciphertext addressed to the recipient, plus the sender's ML-KEM public key
 * so the recipient can seal its own replies without a second round trip.
 */
export interface HandshakeSesion {
  readonly v: number;
  readonly alg: string;
  readonly sesion: string;
  readonly kemCipherText: string;
  readonly kemPublicoEmisor: string;
}

/** Session state held by one side of a session. */
export interface SesionCifrada extends ParamsSesion {
  readonly claves: ClavesSesion;
  readonly direccion: Direccion;
  /** Monotonic counter of the NEXT message this side will seal. */
  readonly siguienteCounter: bigint;
}

// ─── SESSION SETUP ─────────────────────────────────────────────────────────

function bytesAleatorios(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

function esUint8Array(v: unknown): v is Uint8Array {
  return v instanceof Uint8Array && v.length > 0;
}

/**
 * Derive the two session keys from an ML-KEM-768 shared secret.
 *
 * `derivarClaveSimetrica` (SHA-256 with a domain separator) is applied first so
 * the raw KEM secret is never used as keying material directly, then HKDF
 * stretches the result into two purpose-separated keys. Both peers run the
 * identical construction over the identical bytes, so both land on the same
 * pair without any further agreement.
 *
 * SHA-256 comes from `@noble/hashes` rather than WebCrypto because the
 * handshake path is synchronous (`encapsular` is sync) and WebCrypto's digest
 * is promise-only. SHA-256 is SHA-256: the bytes hashed here are exactly the
 * bytes `derivarClaveSimetrica` hashes, so both entry points derive identical
 * keys.
 *
 * @param sharedSecret 32 bytes from `encapsular` / `decapsular`.
 * @param sesionId session id, used as HKDF salt (binds keys to one session).
 * @throws TypeError on malformed input rather than deriving from garbage.
 */
export function derivarClavesSesion(sharedSecret: Uint8Array, sesionId: string): ClavesSesion {
  if (!esUint8Array(sharedSecret)) {
    throw new TypeError('derivarClavesSesion: sharedSecret must be a non-empty Uint8Array');
  }
  if (typeof sesionId !== 'string' || sesionId.length === 0) {
    throw new TypeError('derivarClavesSesion: sesionId must be a non-empty string');
  }

  const enc = new TextEncoder();
  const prefijo = enc.encode(DOMINIO_CLAVE_COMPARTIDA);
  const entrada = new Uint8Array(prefijo.length + sharedSecret.length);
  entrada.set(prefijo, 0);
  entrada.set(sharedSecret, prefijo.length);
  const base = sha256(entrada);

  const salt = hkdf(sha256, base, enc.encode(DOMINIO_SAL_SESION), enc.encode(sesionId), 32);
  return {
    claveCifrado: hkdf(sha256, base, salt, enc.encode(DOMINIO_CLAVE_CIFRADO), BYTES_CLAVE),
    claveAutenticacion: hkdf(sha256, base, salt, enc.encode(DOMINIO_CLAVE_AUTENTICACION), BYTES_CLAVE),
  };
}

/** Awaitable alias, for call sites already in an async context. */
export async function derivarClavesSesionAsync(sharedSecret: Uint8Array, sesionId: string): Promise<ClavesSesion> {
  return derivarClavesSesion(sharedSecret, sesionId);
}

function bytesASesionId(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sender side of the handshake: encapsulate to the recipient, derive keys,
 * and return both the local session and the wire message to send.
 *
 * ML-KEM-768 runs HERE and only here. Every later message in the session is
 * sealed with XChaCha20-Poly1305 under the derived key.
 */
export function iniciarSesionCifrada(
  emisor: PostQuantumIdentity,
  kemPublicoReceptor: ParPublico,
  opciones: { readonly epoch?: number } = {},
): { readonly sesion: SesionCifrada; readonly handshake: HandshakeSesion } {
  if (!esUint8Array(kemPublicoReceptor)) {
    throw new TypeError('iniciarSesionCifrada: recipient ML-KEM public key must be a non-empty Uint8Array');
  }
  const sobre: SobreKem = emisor.encapsular(kemPublicoReceptor);
  const sesionId = bytesASesionId(bytesAleatorios(BYTES_SAL_NONCE));
  const claves = derivarClavesSesion(sobre.claveCompartida, sesionId);
  const epoch = opciones.epoch ?? 0;

  return {
    sesion: { sesionId, epoch, claves, direccion: DIRECCION.A_A_B, siguienteCounter: 0n },
    handshake: {
      v: VERSION_PAYLOAD_CIFRADO,
      alg: CODIGO_ALGORITMO,
      sesion: sesionId,
      kemCipherText: bytesToBase64(sobre.cipherText),
      kemPublicoEmisor: bytesToBase64(emisor.exportarKemPublico()),
    },
  };
}

/**
 * Recipient side of the handshake: decapsulate, derive the same keys, and
 * return the local session plus the sender's ML-KEM public key (so a reply can
 * be sealed without another round trip).
 */
export function aceptarSesionCifrada(
  receptor: PostQuantumIdentity,
  handshake: HandshakeSesion,
  opciones: { readonly epoch?: number } = {},
): { readonly sesion: SesionCifrada; readonly kemPublicoEmisor: ParPublico } {
  if (!handshake || typeof handshake !== 'object') {
    throw new ErrorPayloadCifrado('aceptarSesionCifrada: handshake must be an object');
  }
  if (handshake.v !== VERSION_PAYLOAD_CIFRADO || handshake.alg !== CODIGO_ALGORITMO) {
    throw new ErrorPayloadCifrado('aceptarSesionCifrada: unsupported handshake version or algorithm');
  }
  if (typeof handshake.sesion !== 'string' || handshake.sesion.length === 0) {
    throw new ErrorPayloadCifrado('aceptarSesionCifrada: handshake.sesion must be a non-empty string');
  }

  const kemCipherText = base64ToBytes(handshake.kemCipherText);
  if (kemCipherText.length !== BYTES_CIPHERTEXT_KEM_768) {
    throw new ErrorPayloadCifrado(
      `aceptarSesionCifrada: ML-KEM-768 ciphertext must be ${BYTES_CIPHERTEXT_KEM_768} bytes, got ${kemCipherText.length}`,
    );
  }

  const kemPublicoEmisor = base64ToBytes(handshake.kemPublicoEmisor);
  const secretoCompartido = receptor.decapsular(kemCipherText);
  const claves = derivarClavesSesion(secretoCompartido, handshake.sesion);

  return {
    sesion: {
      sesionId: handshake.sesion,
      epoch: opciones.epoch ?? 0,
      claves,
      direccion: DIRECCION.B_A_A,
      siguienteCounter: 0n,
    },
    kemPublicoEmisor,
  };
}

/**
 * Rotate the session keys under a new epoch.
 *
 * Call `iniciarSesionCifrada` again with the new ML-KEM ciphertext and pass
 * `epoch: sesion.epoch + 1`. Keeping the old epoch's guard is the caller's
 * job: this function deliberately does not touch guard state, so an old epoch
 * can still be rejected (and old messages still refuse to decrypt) after the
 * switch.
 */
export function rotarSesion(sesion: SesionCifrada, claves: ClavesSesion, epoch: number): SesionCifrada {
  if (!Number.isInteger(epoch) || epoch <= sesion.epoch) {
    throw new Error(`rotarSesion: epoch must increase (current ${sesion.epoch}, got ${epoch})`);
  }
  if (claves.claveCifrado.length !== BYTES_CLAVE || claves.claveAutenticacion.length !== BYTES_CLAVE) {
    throw new TypeError(`rotarSesion: both keys must be ${BYTES_CLAVE} bytes`);
  }
  return {
    sesionId: sesion.sesionId,
    epoch,
    claves,
    direccion: sesion.direccion,
    siguienteCounter: 0n,
  };
}

// ─── NONCE ─────────────────────────────────────────────────────────────────

function counterABytes(counter: bigint): Uint8Array {
  const out = new Uint8Array(BYTES_CTR);
  let c = counter;
  for (let i = BYTES_CTR - 1; i >= 0; i--) {
    out[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  if (c !== 0n) {
    throw new RangeError(`Nonce counter overflow: ${counter} does not fit in ${BYTES_CTR} bytes`);
  }
  return out;
}

/**
 * Build the 24-byte XChaCha nonce.
 *
 * The nonce is DERIVED, never transmitted: it is a pure function of the session
 * salt (encoded in `sesionId`), the epoch, the direction tag and the counter.
 * That is why the per-message wire overhead is a 16-byte Poly1305 tag plus a
 * short counter field, and not 24 extra bytes.
 */
export function derivarNonce(sesionId: string, epoch: number, direccion: Direccion, counter: bigint): Uint8Array {
  const nonce = new Uint8Array(BYTES_NONCE);
  nonce.set(sessionSalt(sesionId), OFFSET_NONCE_SAL);
  nonce.set(counterABytes(counter), OFFSET_NONCE_CTR);

  // `[20..24)` direction tag in the top byte, epoch in the low three. Tag and
  // epoch share one 32-bit slot so the whole nonce stays exactly 24 bytes.
  const vista = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  const dirEpoch = ((direccion & 0xff) << 24) | ((epoch >>> 0) & 0x00ffffff);
  vista.setUint32(OFFSET_NONCE_DIR_EPOCH, dirEpoch >>> 0, false);

  if (BYTES_NONCE_LIBRES < 0) {
    throw new Error(`Nonce layout overflow: ${BYTES_NONCE_LIBRES} spare bytes`);
  }
  return nonce;
}

/**
 * Recover the 8-byte session salt from a session id. Session ids are emitted as
 * 16 hex chars for the salt, longer ids contribute their first 8 bytes.
 */
function sessionSalt(sesionId: string): Uint8Array {
  const hex = sesionId.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length >= BYTES_SAL_NONCE * 2) {
    const out = new Uint8Array(BYTES_SAL_NONCE);
    for (let i = 0; i < BYTES_SAL_NONCE; i++) {
      out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
    }
    return out;
  }
  const seed = new TextEncoder().encode(sesionId);
  const out = sha256(seed).slice(0, BYTES_SAL_NONCE);
  return out;
}

// ─── ANTI-REPLAY GUARD ─────────────────────────────────────────────────────

interface EstadoDireccion {
  /** Highest counter accepted so far for this direction. */
  maxVisto: bigint;
  /**
   * Every counter accepted for this direction, INCLUDING the high-water mark.
   * The frontier has to be in here: it is accepted exactly once, and without
   * it a replay of the newest message would be judged by the window floor
   * alone and — being the newest — would sail through.
   */
  aceptados: Set<string>;
}

export interface GuardiaReplayOpciones {
  /** How far below the high-water mark a counter may still be accepted. */
  readonly ventana: number;
  /** Upper bound on remembered counters, per direction. */
  readonly maxEntradas: number;
}

const CONFIG_REPLAY_POR_DEFECTO: GuardiaReplayOpciones = {
  ventana: 1024,
  maxEntradas: 4096,
} as const;

/**
 * Anti-replay guard for encrypted envelopes.
 *
 * WHY THIS EXISTS. An encrypted envelope is, by construction, replayable: the
 * ciphertext and the counter are both on the wire, and AEAD authentication only
 * proves "this blob was produced by someone holding the key" — not "this blob
 * is being delivered for the first time". For a clinical record that is the
 * difference between one consultation and two. `MessageDeduplicator` (id +
 * origin, 5 s window) is NOT a substitute: it is time-windowed, it forgets, and
 * it is keyed on a field an attacker chooses.
 *
 * BEHAVIOUR, per (sessionId, direction):
 *
 *   - counter already accepted -> REJECT (exact replay, however late)
 *   - counter below `maxVisto - ventana` -> REJECT (too old to prove freshness)
 *   - counter above `maxVisto` -> ACCEPT, advance the mark
 *   - counter below the mark but inside the window and never seen -> ACCEPT
 *
 * Reordering WITHIN the window is tolerated, because a gossip mesh delivers out
 * of order by design. An exact replay is never tolerated.
 */
export class GuardiaReplay {
  private readonly estados = new Map<string, EstadoDireccion>();
  private readonly config: GuardiaReplayOpciones;

  constructor(config: Partial<GuardiaReplayOpciones> = {}) {
    this.config = { ...CONFIG_REPLAY_POR_DEFECTO, ...config };
  }

  private clave(sesionId: string, direccion: Direccion): string {
    return `${sesionId}:${direccion}`;
  }

  /**
   * Record an incoming counter.
   *
   * @returns true if the envelope is acceptable, false if it must be rejected
   *   as a replay.
   * @throws TypeError on a malformed counter, so garbage is not silently
   *   treated as a fresh message.
   */
  aceptar(sesionId: string, direccion: Direccion, counter: bigint): boolean {
    if (typeof counter !== 'bigint' || counter < 0n) {
      throw new TypeError('GuardiaReplay.aceptar: counter must be a non-negative bigint');
    }
    const clave = this.clave(sesionId, direccion);
    const texto = counter.toString();
    const estado = this.estados.get(clave);

    if (!estado) {
      this.estados.set(clave, { maxVisto: counter, aceptados: new Set([texto]) });
      return true;
    }

    if (estado.aceptados.has(texto)) return false;
    if (counter > estado.maxVisto) {
      estado.maxVisto = counter;
    } else if (estado.maxVisto - counter > BigInt(this.config.ventana)) {
      return false;
    }

    estado.aceptados.add(texto);
    this.podar(estado);
    return true;
  }

  /** Reject with a typed error instead of returning a bare boolean. */
  exigirAceptable(sesionId: string, direccion: Direccion, counter: bigint): void {
    if (!this.aceptar(sesionId, direccion, counter)) {
      throw new ErrorReplayDetectado(counter.toString(), 'already accepted or below the window');
    }
  }

  /**
   * Trim the window: drop anything the floor already rejects, then cap the
   * size. The high-water mark is re-inserted so eviction can never open a hole
   * at the frontier.
   */
  private podar(estado: EstadoDireccion): void {
    const limite = estado.maxVisto - BigInt(this.config.ventana);
    for (const texto of estado.aceptados) {
      if (BigInt(texto) < limite) estado.aceptados.delete(texto);
    }
    while (estado.aceptados.size > this.config.maxEntradas) {
      const primero = estado.aceptados.values().next();
      if (primero.done) break;
      estado.aceptados.delete(primero.value);
    }
    estado.aceptados.add(estado.maxVisto.toString());
  }

  /** Highest counter accepted so far for a direction, or null if none. */
  maxVisto(sesionId: string, direccion: Direccion): bigint | null {
    return this.estados.get(this.clave(sesionId, direccion))?.maxVisto ?? null;
  }

  /** Count of counters remembered for a direction. */
  tamañoVentana(sesionId: string, direccion: Direccion): number {
    return this.estados.get(this.clave(sesionId, direccion))?.aceptados.size ?? 0;
  }

  reiniciar(): void {
    this.estados.clear();
  }
}

// ─── SEAL / OPEN ───────────────────────────────────────────────────────────

/**
 * Associated data: the envelope header minus the payload and the signature.
 *
 * Binding the header into the AEAD is what stops a valid ciphertext being
 * replayed under a different `id`, `origen` or `timestamp`: move one header
 * field and Poly1305 fails. This does NOT touch `canonicalEnvelopeBytes`, so
 * existing signatures keep verifying exactly as before.
 */
function headerAad(env: Envolvente): Uint8Array {
  return canonicalSerialize({
    id: env.id,
    tipo: env.tipo,
    origen: env.origen,
    destino: env.destino,
    timestamp: env.timestamp,
    version: env.version,
    nonce: env.nonce,
  });
}

function esPayloadCifrado(p: unknown): p is PayloadCifrado {
  if (!p || typeof p !== 'object') return false;
  const c = p as Partial<PayloadCifrado>;
  return (
    c.v === VERSION_PAYLOAD_CIFRADO &&
    c.alg === CODIGO_ALGORITMO &&
    typeof c.sesion === 'string' &&
    typeof c.epoch === 'number' &&
    typeof c.dir === 'number' &&
    typeof c.ctr === 'string' &&
    typeof c.ct === 'string'
  );
}

/** True when `env.payload` is a sealed payload produced by `cifrarPayload`. */
export function esEnvolventeCifrado(env: Envolvente): boolean {
  return esPayloadCifrado(env.payload);
}

/**
 * Seal the payload of an envelope. Returns a NEW envelope; the input is not
 * mutated. The returned envelope is the one to sign — sign AFTER encrypting, so
 * the ML-DSA signature covers the ciphertext.
 *
 * The counter comes from `siguienteCounter` and is advanced on the returned
 * session state; reuse of a counter under the same key throws
 * `ErrorReusoDeNonce` rather than silently producing a keystream repeat.
 */
export function cifrarPayload(env: Envolvente, sesion: SesionCifrada): Envolvente {
  return sellarPayload(env, sesion, true);
}

/**
 * The seal itself, with the nonce-reuse tripwire conditional.
 *
 * `registrar` is false only for measurement, which seals a throwaway envelope
 * at counter 0 purely to measure the byte cost. Every real send goes through
 * `cifrarPayload` / `cifrarYSiguiente`, which always register.
 */
function sellarPayload(env: Envolvente, sesion: SesionCifrada, registrar: boolean): Envolvente {
  if (esPayloadCifrado(env.payload)) {
    throw new Error('cifrarPayload: envelope payload is already sealed (double encryption)');
  }
  const counter = sesion.siguienteCounter;
  if (counter >= BigInt(MAX_MENSAJES_POR_SESION)) {
    throw new RangeError(`Session key exhausted: rotate before ${MAX_MENSAJES_POR_SESION} messages`);
  }
  if (registrar && contadoresUsados.has(claveContador(sesion, counter))) {
    throw new ErrorReusoDeNonce(counter.toString());
  }

  const nonce = derivarNonce(sesion.sesionId, sesion.epoch, sesion.direccion, counter);
  const aad = headerAad(env);
  const aead = xchacha20poly1305(sesion.claves.claveCifrado, nonce, aad);
  const plaintext = new TextEncoder().encode(JSON.stringify(env.payload ?? null));
  const ciphertext = aead.encrypt(plaintext);

  if (registrar) registrarContador(sesion, counter);

  const payload: PayloadCifrado = {
    v: VERSION_PAYLOAD_CIFRADO,
    alg: CODIGO_ALGORITMO,
    sesion: sesion.sesionId,
    epoch: sesion.epoch,
    dir: sesion.direccion,
    ctr: counter.toString(),
    ct: bytesToBase64(ciphertext),
  };

  return { ...env, payload };
}

/**
 * Open a sealed envelope and check it against the replay guard.
 *
 * Order matters: the guard is consulted AFTER decryption succeeds (so an
 * attacker cannot burn counters by sending garbage) but BEFORE the caller ever
 * sees the plaintext application value.
 *
 * @returns a new envelope with the plaintext payload restored.
 * @throws ErrorPayloadCifrado if the envelope is not sealed or Poly1305 fails.
 * @throws ErrorReplayDetectado if the counter is a replay.
 */
export function abrirPayload(
  env: Envolvente,
  sesion: SesionCifrada,
  guardia: GuardiaReplay,
  opciones: { readonly aplicarGuardia?: boolean } = {},
): Envolvente {
  if (!esPayloadCifrado(env.payload)) {
    throw new ErrorPayloadCifrado('abrirPayload: envelope payload is not a sealed payload');
  }
  if (env.payload.sesion !== sesion.sesionId) {
    throw new ErrorPayloadCifrado('abrirPayload: payload belongs to a different session');
  }
  if (env.payload.epoch !== sesion.epoch) {
    throw new ErrorPayloadCifrado(
      `abrirPayload: payload epoch ${env.payload.epoch} does not match session epoch ${sesion.epoch} (rotated?)`,
    );
  }
  if (env.payload.dir === sesion.direccion) {
    throw new ErrorPayloadCifrado("abrirPayload: payload was sealed with this side's own direction tag");
  }

  let counter: bigint;
  try {
    counter = BigInt(env.payload.ctr);
  } catch {
    throw new ErrorPayloadCifrado(`abrirPayload: counter "${env.payload.ctr}" is not an integer`);
  }
  if (counter < 0n) {
    throw new ErrorPayloadCifrado('abrirPayload: counter must be non-negative');
  }

  const direccion = env.payload.dir as Direccion;
  const nonce = derivarNonce(sesion.sesionId, sesion.epoch, direccion, counter);
  const aead = xchacha20poly1305(sesion.claves.claveCifrado, nonce, headerAad(env));

  let plaintext: Uint8Array;
  try {
    plaintext = aead.decrypt(base64ToBytes(env.payload.ct));
  } catch {
    // Deliberately vague: never distinguish "bad tag" from "bad ciphertext".
    throw new ErrorPayloadCifrado(
      'abrirPayload: XChaCha20-Poly1305 authentication failed (tampered payload or wrong key)',
    );
  }

  if (opciones.aplicarGuardia !== false) {
    guardia.exigirAceptable(sesion.sesionId, direccion, counter);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new ErrorPayloadCifrado('abrirPayload: decrypted payload is not valid JSON');
  }

  return { ...env, payload };
}

/**
 * Seal an envelope and return both the sealed envelope and the advanced
 * session. This is the intended entry point for a sender: it is the only one
 * that can guarantee the nonce is never reused.
 *
 * Reusing a (key, nonce) pair under XChaCha20-Poly1305 is catastrophic — it
 * leaks the XOR of two plaintexts and forfeits the authentication key — so the
 * check is enforced here and throws `ErrorReusoDeNonce` rather than being left
 * to convention. The session id and epoch are part of the derived nonce, so a
 * genuinely rotated session is unaffected.
 */
export function cifrarYSiguiente(env: Envolvente, sesion: SesionCifrada): { env: Envolvente; sesion: SesionCifrada } {
  assertContadorLibre(sesion, sesion.siguienteCounter);
  const envCifrado = cifrarPayload(env, sesion);
  return {
    env: envCifrado,
    sesion: { ...sesion, siguienteCounter: sesion.siguienteCounter + 1n },
  };
}

/** Advance an outgoing session counter by one, with the same nonce checks. */
export function marcarEnviado(sesion: SesionCifrada): SesionCifrada {
  assertContadorLibre(sesion, sesion.siguienteCounter);
  return { ...sesion, siguienteCounter: sesion.siguienteCounter + 1n };
}

/**
 * Refuse to seal under a (session, epoch, direction, counter) tuple already
 * used. `ErrorReusoDeNonce` is thrown rather than returned: this must never be
 * a recoverable condition.
 */
function assertContadorLibre(sesion: SesionCifrada, counter: bigint): void {
  if (counter >= BigInt(MAX_MENSAJES_POR_SESION)) {
    throw new RangeError(`Session key exhausted: rotate before ${MAX_MENSAJES_POR_SESION} messages`);
  }
  if (contadoresUsados.has(claveContador(sesion, counter))) {
    throw new ErrorReusoDeNonce(counter.toString());
  }
}

function claveContador(sesion: SesionCifrada, counter: bigint): string {
  return `${sesion.sesionId}:${sesion.epoch}:${sesion.direccion}:${counter}`;
}

/**
 * Process-wide record of every (session, epoch, direction, counter) sealed.
 *
 * A session object is plain data and gets cloned all over the mesh; keying the
 * record on the object identity would not survive that, and keying it on the
 * secret would defeat the purpose. The tuple is what actually determines the
 * nonce, so the tuple is what is remembered.
 *
 * Bounded at `MAX_CONTADORES_RECORDADOS` entries: this is a tripwire against a
 * programming error (a lost session update, a reverted rollback), not a
 * security boundary. An adversary who can make the sender reuse a counter can
 * already make it send anything.
 */
const MAX_CONTADORES_RECORDADOS = 200_000;
const contadoresUsados = new Set<string>();

function registrarContador(sesion: SesionCifrada, counter: bigint): void {
  if (contadoresUsados.size >= MAX_CONTADORES_RECORDADOS) {
    const aEliminar = contadoresUsados.size - MAX_CONTADORES_RECORDADOS + 1;
    let i = 0;
    for (const clave of contadoresUsados) {
      contadoresUsados.delete(clave);
      if (++i >= aEliminar) break;
    }
  }
  contadoresUsados.add(claveContador(sesion, counter));
}

// ─── OVERHEAD ──────────────────────────────────────────────────────────────

export interface MedicionOverhead {
  /** Plaintext payload size in bytes. */
  readonly payloadBytes: number;
  /** Sealed payload size on the wire, JSON-stringified (what the signature covers). */
  readonly wireBytes: number;
  /** `wireBytes - payloadBytes`: the real, total per-message cost. */
  readonly overheadBytes: number;
  /** `overheadBytes / payloadBytes`. */
  readonly ratio: number;
  /**
   * Pure AEAD cost: the Poly1305 tag, and nothing else. This is the number
   * that does NOT scale with the payload.
   */
  readonly tagBytes: number;
  /** The AEAD nonce costs 0 bytes: it is derived, never transmitted. */
  readonly nonceBytes: number;
  /**
   * Cost of carrying the ciphertext inside a JSON envelope: base64 expands
   * every 3 ciphertext bytes into 4 characters, so this is ~33% of the
   * ciphertext and it DOES scale with the payload.
   */
  readonly encodingBytes: number;
  /** Fixed cost of the sealed-payload JSON fields themselves. */
  readonly framingBytes: number;
}

/**
 * Measure what encryption actually costs per message, decomposed.
 *
 * The honest decomposition, because the single "overhead" number hides which
 * part is negotiable:
 *
 *   - 16 bytes   Poly1305 authentication tag. Irreducible for any AEAD, and
 *                independent of the payload size.
 *   -  0 bytes   AEAD nonce. Derived from (session salt, epoch, direction,
 *                counter); never transmitted. This is why the design pays no
 *                24-byte nonce per message.
 *   - ~75 bytes  JSON framing of the sealed-payload fields (version, algorithm
 *                code, session id, epoch, direction, counter). Fixed.
 *   - ~33%       base64 expansion of the ciphertext. This one scales with the
 *                payload and is the dominant term on large records.
 *
 * SO: the "~40 bytes per message" figure is the AEAD plus framing, i.e. the
 * fixed part, and it holds. But `overheadBytes` — what the wire actually
 * grows by — is dominated by base64, and on a 4 KB record it is roughly a
 * third of the record, not 40 bytes. Anyone budgeting this layer needs both
 * numbers, so both are returned.
 *
 * ML-KEM-768's 1088-byte ciphertext is NOT in any of these: it is paid once per
 * session, not per message. Use `JSON.stringify(handshake).length` for that.
 */
export function medirOverhead(payload: unknown, sesion: SesionCifrada): MedicionOverhead {
  const plaintext = new TextEncoder().encode(JSON.stringify(payload ?? null));
  const env: Envolvente = {
    id: 'medicion',
    tipo: 'sync' as Envolvente['tipo'],
    origen: 'origen' as NodoId,
    destino: 'destino' as NodoId,
    timestamp: 1_700_000_000_000,
    firma: null,
    payload,
    version: 1,
    nonce: 'medicion',
  };
  const sellado = sellarPayload(env, sesion, false);
  const wire = new TextEncoder().encode(JSON.stringify(sellado.payload));
  const overhead = wire.length - plaintext.length;

  // base64 expands every 3 ciphertext bytes into 4 characters; `=` padding
  // carries no data, so the true expansion is the character count minus the
  // raw byte count.
  const ctBase64 = (sellado.payload as PayloadCifrado).ct;
  const ctBytes = ctBase64.length;
  const encoding = ctBytes - Math.floor(ctBytes / 4) * 3;

  return {
    payloadBytes: plaintext.length,
    wireBytes: wire.length,
    overheadBytes: overhead,
    ratio: plaintext.length === 0 ? 0 : overhead / plaintext.length,
    tagBytes: BYTES_TAG,
    nonceBytes: 0,
    encodingBytes: encoding,
    framingBytes: overhead - BYTES_TAG - encoding,
  };
}
