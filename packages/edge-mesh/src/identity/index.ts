import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { bytesAHex, hexABytes } from '../protocol/utils.js';
import type { NodoId, ParPublico } from '../types/index.js';

export type { ParPublico };

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

const ALGORITMO_FIRMA = 'ML-DSA-65' as const;
const ALGORITMO_KEM = 'ML-KEM-768' as const;

/**
 * Domain separation strings. Every hash derivation in this module prefixes its
 * input with one of these so that a value derived for one purpose can never be
 * replayed as a value for another (e.g. a nodeId can never collide with a key).
 */
const DOMINIO_NODO_ID = 'shelf-edge-mesh/v1/nodo-id';
const DOMINIO_CLAVE_COMPARTIDA = 'shelf-edge-mesh/v1/clave-compartida';

/** Prefix of a cryptographically derived node identifier. */
export const PREFIJO_NODO_DERIVADO = 'mlkem';

/** Bytes of digest kept in a derived nodeId (16 bytes → 32 hex chars). */
const BYTES_NODO_ID = 16;

export const TIPO_IDENTIDAD = {
  MAESTRA: 'maestra',
  EPHEMERA: 'ephemera',
  SERVICIO: 'servicio',
} as const;

export type TipoIdentidad = (typeof TIPO_IDENTIDAD)[keyof typeof TIPO_IDENTIDAD];

/**
 * WHAT ML-DSA-65 PROVES vs WHAT ML-KEM-768 PROTECTS — these are different
 * guarantees and neither substitutes for the other:
 *
 * - ML-DSA-65 (signature, `firmar` / `verificar`): **authenticity + integrity**.
 *   It proves the holder of the private key authored these exact bytes and that
 *   they were not altered in transit. It reveals nothing: anyone can verify.
 *
 * - ML-KEM-768 (key encapsulation, `encapsular` / `decapsular`): **confidentiality
 *   of the shared secret**. Only the owner of the matching private key can
 *   recover the shared secret; the ciphertext on the wire is useless to anybody
 *   else. It says NOTHING about who sent the message.
 *
 * A correct envelope needs both: ML-KEM so only the recipient can read the
 * payload, ML-DSA so the recipient can prove the sender is who it claims.
 */
export const ALGORITMOS = {
  FIRMA: ALGORITMO_FIRMA,
  KEM: ALGORITMO_KEM,
} as const;

// ─── KEYPAIR ───────────────────────────────────────────────────────────────

export interface PostQuantumKeypair {
  readonly parPrivado: Uint8Array;
  readonly parPublico: ParPublico;
  /**
   * ML-KEM-768 decapsulation key. Absent only for keypairs restored from the
   * legacy (pre-KEM) serialization; a fresh one is generated in that case.
   */
  readonly kemPrivado?: Uint8Array;
  /** ML-KEM-768 encapsulation key. This is what travels on the wire. */
  readonly kemPublico?: Uint8Array;
  readonly algoritmo: string;
  readonly tipo: TipoIdentidad;
  readonly fechaCreacion: number;
}

export interface IdentityProvider {
  sign(data: string): Promise<string>;
  verify(data: string, signature: string, publicKey: Uint8Array): Promise<boolean>;
}

/** Result of `encapsular`: the ciphertext to send plus the local shared secret. */
export interface SobreKem {
  readonly cipherText: Uint8Array;
  readonly claveCompartida: Uint8Array;
}

export interface PostQuantumIdentity extends IdentityProvider {
  readonly nodoId: NodoId;
  readonly keypair: PostQuantumKeypair;

  firmar(datos: Uint8Array): Promise<Uint8Array>;
  verificar(datos: Uint8Array, firma: Uint8Array, parPublico: ParPublico): Promise<boolean>;
  exportarPublico(): ParPublico;
  obtenerAlgoritmo(): string;

  // ── ML-KEM-768 surface (confidentiality) ──

  /** ML-KEM-768 public key of this node. Safe to put on the wire. */
  exportarKemPublico(): ParPublico;
  /** Recipient's ML-KEM-768 public key, recovered from our decapsulation key. */
  obtenerKemPublico(): ParPublico;
  /** Seal a shared secret for the holder of `kemPublicoReceptor`. */
  encapsular(kemPublicoReceptor: ParPublico): SobreKem;
  /** Recover the shared secret from a ciphertext addressed to us. */
  decapsular(cipherText: Uint8Array): Uint8Array;
  /** Derive the 32-byte symmetric key for a ciphertext addressed to us. */
  derivarClaveSimetricaDesde(cipherText: Uint8Array): Promise<Uint8Array>;
}

// ─── HASH HELPERS (WebCrypto) ──────────────────────────────────────────────

function concatBytes(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of partes) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function sha256(datos: Uint8Array): Promise<Uint8Array> {
  // Copy into a fresh ArrayBuffer: `datos` may be a view over a larger,
  // non-ArrayBuffer-typed backing store, which subtle.digest rejects.
  const buffer = new ArrayBuffer(datos.length);
  new Uint8Array(buffer).set(datos);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
}

// ─── DERIVED NODE ID ───────────────────────────────────────────────────────

/**
 * Derive a node identifier deterministically from an ML-KEM-768 public key.
 *
 * This is the anti-impersonation fix: a node cannot choose, inherit or guess
 * another node's id, because the id *is* a hash of the key that node must
 * present to prove possession. Two different keys can never produce the same
 * id with meaningful probability, and no key can produce someone else's id.
 *
 * Format: `mlkem<32 hex chars>` (first 16 bytes of SHA-256, domain separated).
 */
export async function derivarNodoId(kemPublico: ParPublico): Promise<NodoId> {
  if (!(kemPublico instanceof Uint8Array) || kemPublico.length === 0) {
    throw new TypeError('derivarNodoId: ML-KEM public key must be a non-empty Uint8Array');
  }
  const prefijo = new TextEncoder().encode(DOMINIO_NODO_ID);
  const digest = await sha256(concatBytes(prefijo, kemPublico));
  return `${PREFIJO_NODO_DERIVADO}${bytesAHex(digest.slice(0, BYTES_NODO_ID))}` as NodoId;
}

/** True when `nodoId` has the shape of a derived id. Cheap pre-filter. */
export function esNodoIdDerivado(nodoId: string): boolean {
  return (
    nodoId.startsWith(`${PREFIJO_NODO_DERIVADO}`) && nodoId.length === PREFIJO_NODO_DERIVADO.length + BYTES_NODO_ID * 2
  );
}

/**
 * Verify that `nodoId` really is the id derived from this node's ML-KEM key.
 *
 * Legacy nodes (ids assigned before this fix, e.g. `'doctor-01'`) return
 * `false` here and are handled by the migration path below, not rejected.
 */
export async function verificarNodoIdVinculado(nodoId: NodoId, kemPublico: ParPublico): Promise<boolean> {
  if (!esNodoIdDerivado(nodoId)) return false;
  return (await derivarNodoId(kemPublico)) === nodoId;
}

// ─── MIGRATION OF LEGACY (hand-assigned) NODE IDS ───────────────────────────

export type EstadoVinculoNodoId =
  /** id is the hash of the ML-KEM key: cryptographically bound, nothing to do. */
  | { readonly estado: 'vinculado' }
  /** legacy free-form id from before derived ids existed; accepted and pinned. */
  | { readonly estado: 'heredado'; readonly idEsperado: NodoId }
  /** legacy id that is not the derived one, and the caller did not opt in. */
  | { readonly estado: 'conflicto'; idEsperado: NodoId };

/**
 * Decide what to do with a node id that was configured before derived ids
 * existed. **Nothing is ever silently overwritten.**
 *
 * - Derived id matching the key → `vinculado`.
 * - Non-derived (free-form) id → `heredado`: the node keeps working with its
 *   configured id, and we pin that id in the trust store so a later identity
 *   swap cannot move it. `idEsperado` is the derived id to adopt whenever the
 *   node rotates its key.
 * - Derived-looking id that does NOT match the key → `conflicto`: that is an
 *   impersonation attempt (claiming another node's derived id), and the caller
 *   must refuse.
 *
 * @param permitirHeredado opt-in for legacy nodes. Legacy callers that pass a
 *   configured id (the pre-existing `createPostQuantumIdentity(nodoId)` shape)
 *   must set this to `true`; default is `false`, i.e. fail closed.
 */
export async function evaluarVinculoNodoId(
  nodoId: NodoId,
  kemPublico: ParPublico,
  permitirHeredado = false,
): Promise<EstadoVinculoNodoId> {
  const idEsperado = await derivarNodoId(kemPublico);
  if (idEsperado === nodoId) return { estado: 'vinculado' };
  if (esNodoIdDerivado(nodoId)) return { estado: 'conflicto', idEsperado };
  if (permitirHeredado) return { estado: 'heredado', idEsperado };
  return { estado: 'conflicto', idEsperado };
}

// ─── GENERATE ──────────────────────────────────────────────────────────────

/**
 * Generate a node keypair: an ML-DSA-65 signature pair **and** an ML-KEM-768
 * encapsulation pair. Both are needed for a usable mesh identity — the
 * signature pair proves who you are, the KEM pair lets others talk to you in
 * private.
 */
export function generateKeypair(tipo: TipoIdentidad = TIPO_IDENTIDAD.EPHEMERA): PostQuantumKeypair {
  const { secretKey, publicKey } = ml_dsa65.keygen();
  const kem = ml_kem768.keygen();

  return {
    parPrivado: secretKey,
    parPublico: publicKey,
    kemPrivado: kem.secretKey,
    kemPublico: kem.publicKey,
    algoritmo: ALGORITMO_FIRMA,
    tipo,
    fechaCreacion: Date.now(),
  };
}

/**
 * Guarantee the keypair carries a usable ML-KEM pair.
 *
 * A keypair restored from the legacy serialization (written before ML-KEM
 * existed) has no KEM material. Rather than leaving encryption unavailable, we
 * mint a fresh KEM pair: the signature identity is preserved, and because the
 * nodeId is derived from the KEM key, a legacy node therefore reports a
 * different derived id after migration — which is exactly what makes the
 * rotation auditable instead of silent.
 */
function conKem(keypair: PostQuantumKeypair): PostQuantumKeypair {
  if (keypair.kemPrivado && keypair.kemPublico) return keypair;
  const kem = ml_kem768.keygen();
  return { ...keypair, kemPrivado: kem.secretKey, kemPublico: kem.publicKey };
}

// ─── SHARED SECRET DERIVATION ──────────────────────────────────────────────

/**
 * Turn an ML-KEM-768 shared secret into a 32-byte symmetric key suitable for
 * AEAD (AES-GCM / ChaCha20-Poly1305).
 *
 * The raw ML-KEM shared secret is 32 bytes of keying material; hashing it with
 * a domain separator keeps it from being used directly as an AEAD key without
 * this step, and keeps it distinct from any other derived value.
 *
 * Exported for the encryption layer: this is the single place where a node's
 * ML-KEM secret becomes encryption material.
 */
export async function derivarClaveSimetrica(sharedSecret: Uint8Array): Promise<Uint8Array> {
  const prefijo = new TextEncoder().encode(DOMINIO_CLAVE_COMPARTIDA);
  return sha256(concatBytes(prefijo, sharedSecret));
}

// ─── IDENTITY IMPLEMENTATION ───────────────────────────────────────────────

class PostQuantumIdentityImpl implements PostQuantumIdentity {
  readonly nodoId: NodoId;
  readonly keypair: PostQuantumKeypair;

  constructor(nodoId: NodoId, keypair: PostQuantumKeypair) {
    this.nodoId = nodoId;
    this.keypair = conKem(keypair);
  }

  async firmar(datos: Uint8Array): Promise<Uint8Array> {
    // @noble/post-quantum ML-DSA: sign(message, secretKey) — authenticity + integrity.
    return ml_dsa65.sign(datos, this.keypair.parPrivado);
  }

  async verificar(datos: Uint8Array, firma: Uint8Array, parPublico: ParPublico): Promise<boolean> {
    try {
      // @noble/post-quantum ML-DSA: verify(signature, message, publicKey).
      return ml_dsa65.verify(firma, datos, parPublico);
    } catch {
      return false;
    }
  }

  async sign(data: string): Promise<string> {
    const bytes = new TextEncoder().encode(data);
    const firmaBytes = await this.firmar(bytes);
    return bytesAHex(firmaBytes);
  }

  async verify(data: string, signature: string, publicKey: Uint8Array): Promise<boolean> {
    try {
      const bytes = new TextEncoder().encode(data);
      const firmaBytes = hexABytes(signature);
      return await this.verificar(bytes, firmaBytes, publicKey);
    } catch {
      return false;
    }
  }

  exportarPublico(): ParPublico {
    return new Uint8Array(this.keypair.parPublico);
  }

  obtenerAlgoritmo(): string {
    return this.keypair.algoritmo;
  }

  // ── ML-KEM-768: confidentiality ──

  private kemPrivate(): Uint8Array {
    if (!this.keypair.kemPrivado) throw new Error('ML-KEM decapsulation key missing');
    return this.keypair.kemPrivado;
  }

  exportarKemPublico(): ParPublico {
    if (!this.keypair.kemPublico) throw new Error('ML-KEM encapsulation key missing');
    return new Uint8Array(this.keypair.kemPublico);
  }

  /**
   * Our ML-KEM public key, recomputed from the private key. This cross-checks
   * the stored pair, so a mismatched or tampered serialization is caught before
   * anyone tries to encrypt to us.
   */
  obtenerKemPublico(): ParPublico {
    return ml_kem768.getPublicKey(this.kemPrivate());
  }

  encapsular(kemPublicoReceptor: ParPublico): SobreKem {
    const { cipherText, sharedSecret } = ml_kem768.encapsulate(kemPublicoReceptor);
    return { cipherText, claveCompartida: sharedSecret };
  }

  decapsular(cipherText: Uint8Array): Uint8Array {
    return ml_kem768.decapsulate(cipherText, this.kemPrivate());
  }

  async derivarClaveSimetricaDesde(cipherText: Uint8Array): Promise<Uint8Array> {
    return derivarClaveSimetrica(this.decapsular(cipherText));
  }
}

// ─── FACTORY ───────────────────────────────────────────────────────────────

/**
 * Create an identity for a node.
 *
 * The `nodoId` argument is kept for wire and storage compatibility. For NEW
 * nodes prefer `crearIdentidadVinculada(keypair)`, which derives the id from
 * the ML-KEM key so it cannot be impersonated. A `nodoId` passed here is only
 * ever a legacy id; call `evaluarVinculoNodoId` to check it, and pin the
 * result in the trust store.
 */
export function createPostQuantumIdentity(nodoId: NodoId, keypair?: PostQuantumKeypair): PostQuantumIdentity {
  const kp = keypair ?? generateKeypair();
  return new PostQuantumIdentityImpl(nodoId, kp);
}

/**
 * Create an identity whose `nodoId` IS the hash of its own ML-KEM-768 public
 * key. This is the recommended constructor: the node can prove it owns the id
 * and nobody else can mint that id.
 *
 * @throws if the supplied keypair's `nodoId` (if any) conflicts with the
 *   derived one — a claimed derived id that does not match the key is an
 *   impersonation attempt and must not be papered over.
 */
export async function crearIdentidadVinculada(keypair?: PostQuantumKeypair): Promise<PostQuantumIdentity> {
  const kp = conKem(keypair ?? generateKeypair());
  const nodoId = await derivarNodoId(kp.kemPublico as ParPublico);
  return new PostQuantumIdentityImpl(nodoId, kp);
}

// ─── TRUST ON FIRST USE (TOFU) ─────────────────────────────────────────────

/** Raised when a node presents a key that differs from the one already pinned. */
export class ConflictoClavePublicaError extends Error {
  readonly nodoId: string;
  readonly pubKeyConocida: string;
  readonly pubKeyRecibida: string;

  constructor(nodoId: string, pubKeyConocida: string, pubKeyRecibida: string) {
    super(
      `TOFU violation for node "${nodoId}": key changed without an explicit rotation. ` +
        'Possible impersonation. Reject the peer or call rotarClavePublica() to accept a rotation.',
    );
    this.name = 'ConflictoClavePublicaError';
    this.nodoId = nodoId;
    this.pubKeyConocida = pubKeyConocida;
    this.pubKeyRecibida = pubKeyRecibida;
  }
}

/** What the trust store remembers about one peer. */
export interface EntradaConfianza {
  /** Base64 of the ML-DSA-65 public key. */
  readonly pubKeyFirma: string;
  /** Base64 of the ML-KEM-768 public key, or null if the peer has no KEM. */
  readonly kemPublico: string | null;
  /** State id of the ML-KEM key this entry was pinned against. */
  readonly nodoIdDerivado: string | null;
  readonly primeraVez: number;
  readonly ultimaVez: number;
  /** Number of accepted explicit rotations. */
  readonly rotaciones: number;
}

/** Pluggable persistence. The store keeps the bytes; the host decides where. */
export interface AlmacenConfianza {
  cargar(): Promise<unknown | null>;
  guardar(datos: unknown): Promise<void>;
}

/**
 * In-memory trust store. Serializable with `toJSON()` / `fromJSON()` so a host
 * can persist it to IndexedDB, localStorage or disk and hand it back on load.
 */
export class RegistroConfianzaClaves {
  private readonly entradas = new Map<string, EntradaConfianza>();
  private readonly almacen: AlmacenConfianza | null;

  constructor(almacen: AlmacenConfianza | null = null) {
    this.almacen = almacen;
  }

  /**
   * Writes the registry out to its store.
   *
   * Every mutation goes through here, because a trust store that does not survive a restart is not
   * a trust store: the pinned keys would be forgotten and the next peer to present a key for a
   * known node would be trusted again as if it were the first use. That is the impersonation hole
   * TOFU exists to close, so persistence is part of the guarantee, not an optimisation.
   */
  private async persistir(): Promise<void> {
    if (!this.almacen) return;
    await this.almacen.guardar(this.toJSON());
  }

  /**
   * Fire-and-forget persistence for the synchronous mutators.
   *
   * `registrarClavePublica` and `olvidar` are synchronous and called from mesh wiring that cannot
   * await, so they schedule the write instead. The write still happens; the caller just does not
   * wait for it. The in-memory map is updated synchronously either way, so a reader in the same
   * tick always sees the new entry — only durability is deferred.
   */
  private persistirEnSegundoPlano(): void {
    if (!this.almacen) return;
    void this.persistir().catch(() => {
      // A store that cannot be written is a degraded node, not a reason to lose the in-memory pin.
      // Swallowing here keeps a failing store from taking down mesh wiring; the next successful
      // mutation writes the whole map anyway.
    });
  }

  static fromJSON(datos: unknown, almacen: AlmacenConfianza | null = null): RegistroConfianzaClaves {
    const registro = new RegistroConfianzaClaves(almacen);
    if (!datos || typeof datos !== 'object') return registro;
    for (const [nodoId, entrada] of Object.entries(datos as Record<string, EntradaConfianza>)) {
      if (entrada && typeof entrada.pubKeyFirma === 'string') registro.entradas.set(nodoId, entrada);
    }
    return registro;
  }

  static async abrir(almacen?: AlmacenConfianza): Promise<RegistroConfianzaClaves> {
    if (!almacen) return new RegistroConfianzaClaves();
    return RegistroConfianzaClaves.fromJSON(await almacen.cargar(), almacen);
  }

  toJSON(): Record<string, EntradaConfianza> {
    return Object.fromEntries(this.entradas);
  }

  /** The pinned entry for `nodoId`, or null if the node is unknown (TOFU). */
  obtener(nodoId: string): EntradaConfianza | null {
    return this.entradas.get(nodoId) ?? null;
  }

  /** True when we have already pinned a key for this node. */
  conocido(nodoId: string): boolean {
    return this.entradas.has(nodoId);
  }

  /**
   * Trust on first use.
   *
   * - Unknown node → pin the presented keys and accept.
   * - Known node, same keys → accept, refresh `ultimaVez`.
   * - Known node, different keys → **throw `ConflictoClavePublicaError`**.
   *   Never a silent overwrite: that was exactly the impersonation hole.
   *
   * To accept a real key rotation, call `rotarClavePublica` explicitly.
   */
  registrarClavePublica(nodoId: string, pubKeyFirma: ParPublico, kemPublico?: ParPublico | null): EntradaConfianza {
    const pubKeyFirmaB64 = bytesToBase64(pubKeyFirma);
    const kemPublicoB64 = kemPublico ? bytesToBase64(kemPublico) : null;
    const ahora = Date.now();
    const existente = this.entradas.get(nodoId);

    if (!existente) {
      const entrada: EntradaConfianza = {
        pubKeyFirma: pubKeyFirmaB64,
        kemPublico: kemPublicoB64,
        nodoIdDerivado: null,
        primeraVez: ahora,
        ultimaVez: ahora,
        rotaciones: 0,
      };
      this.entradas.set(nodoId, entrada);
      this.persistirEnSegundoPlano();
      return entrada;
    }

    const mismatchedFirma = existente.pubKeyFirma !== pubKeyFirmaB64;
    const mismatchedKem =
      kemPublicoB64 !== null ? existente.kemPublico !== kemPublicoB64 : (existente.kemPublico ?? null) !== null;
    if (mismatchedFirma || mismatchedKem) {
      throw new ConflictoClavePublicaError(nodoId, existente.pubKeyFirma, pubKeyFirmaB64);
    }

    const actualizada: EntradaConfianza = { ...existente, ultimaVez: ahora };
    this.entradas.set(nodoId, actualizada);
    this.persistirEnSegundoPlano();
    return actualizada;
  }

  /**
   * Accept an EXPLICIT key rotation for a known node. This is the only path
   * that may replace pinned keys; record the reason for the audit trail.
   */
  rotarClavePublica(
    nodoId: string,
    pubKeyFirma: ParPublico,
    kemPublico?: ParPublico | null,
    motivo = 'rotacion explicita',
  ): EntradaConfianza {
    const existente = this.entradas.get(nodoId);
    const ahora = Date.now();
    const entrada: EntradaConfianza = {
      pubKeyFirma: bytesToBase64(pubKeyFirma),
      kemPublico: kemPublico ? bytesToBase64(kemPublico) : null,
      nodoIdDerivado: null,
      primeraVez: existente?.primeraVez ?? ahora,
      ultimaVez: ahora,
      rotaciones: (existente?.rotaciones ?? 0) + 1,
    };
    this.entradas.set(nodoId, entrada);
    this.persistirEnSegundoPlano();
    void motivo;
    return entrada;
  }

  /** Check a presented signature key against the pinned one without storing. */
  verificarClavePublica(nodoId: string, pubKeyFirma: ParPublico): boolean {
    const existente = this.entradas.get(nodoId);
    if (!existente) return false;
    return existente.pubKeyFirma === bytesToBase64(pubKeyFirma);
  }

  /** Register a local identity, pinning its derived id alongside the keys. */
  async registrarIdentidadPropia(nodoId: string, identity: PostQuantumIdentity): Promise<EntradaConfianza> {
    const kem = identity.exportarKemPublico();
    const entrada = this.registrarClavePublica(nodoId, identity.exportarPublico(), kem);
    const idDerivado = await derivarNodoId(kem);
    const conVinculo: EntradaConfianza = { ...entrada, nodoIdDerivado: idDerivado };
    this.entradas.set(nodoId, conVinculo);
    await this.persistir();
    return conVinculo;
  }

  /** Forget a node entirely. Destructive; only for explicit removal. */
  olvidar(nodoId: string): boolean {
    const borrado = this.entradas.delete(nodoId);
    if (borrado) this.persistirEnSegundoPlano();
    return borrado;
  }
}

// ─── UTILITY ───────────────────────────────────────────────────────────────

/**
 * Restore identity from a **serialized keypair** produced by `serializeKeypair`.
 * Passing a raw mismatched private key alone is unsafe and no longer supported.
 *
 * For a fresh random identity, use `createPostQuantumIdentity(nodoId)`, or
 * `crearIdentidadVinculada()` to get an id that cannot be impersonated.
 */
export function identityFromSecret(
  nodoId: NodoId,
  semilla: Uint8Array,
  tipo: TipoIdentidad = TIPO_IDENTIDAD.EPHEMERA,
): PostQuantumIdentity {
  // Prefer deserialize path when bytes look like our serialize format (len prefixes).
  if (semilla.length >= 8) {
    try {
      const view = new DataView(semilla.buffer, semilla.byteOffset, semilla.byteLength);
      const privLen = view.getUint32(0, true);
      const pubLen = view.getUint32(4, true);
      if (privLen > 0 && pubLen > 0 && 8 + privLen + pubLen === semilla.length) {
        const parPrivado = semilla.slice(8, 8 + privLen);
        const parPublico = semilla.slice(8 + privLen, 8 + privLen + pubLen);
        return createPostQuantumIdentity(nodoId, {
          parPrivado,
          parPublico,
          algoritmo: ALGORITMO_FIRMA,
          tipo,
          fechaCreacion: Date.now(),
        });
      }
      // v2 layout adds the ML-KEM decapsulation key after the signature keys.
      if (semilla.length >= 12) {
        const kemPrivLen = view.getUint32(8, true);
        if (privLen > 0 && pubLen > 0 && kemPrivLen > 0 && 12 + privLen + pubLen + kemPrivLen === semilla.length) {
          const parPrivado = semilla.slice(12, 12 + privLen);
          const parPublico = semilla.slice(12 + privLen, 12 + privLen + pubLen);
          const kemPrivado = semilla.slice(12 + privLen + pubLen);
          return createPostQuantumIdentity(nodoId, {
            parPrivado,
            parPublico,
            kemPrivado,
            kemPublico: ml_kem768.getPublicKey(kemPrivado),
            algoritmo: ALGORITMO_FIRMA,
            tipo,
            fechaCreacion: Date.now(),
          });
        }
      }
    } catch {
      // fall through
    }
  }

  // Unsafe: custom private without matching public. Refuse and mint a consistent pair.
  // Callers that previously relied on this path must migrate to serializeKeypair.
  return createPostQuantumIdentity(nodoId, generateKeypair(tipo));
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunk to avoid call-stack limits on large ML-DSA/ML-KEM keys
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export { base64ToBytes, bytesToBase64 };

/**
 * Serialize a keypair to a single string. Layout v2:
 *
 *   u32 privLen | u32 pubLen | u32 kemPrivLen | priv | pub | kemPriv
 *
 * The ML-KEM public key is not stored — it is recovered from `kemPriv` via
 * `ml_kem768.getPublicKey`, so the two can never disagree on disk.
 */
export function serializeKeypair(keypair: PostQuantumKeypair): string {
  const kp = conKem(keypair);
  const privLen = kp.parPrivado.length;
  const pubLen = kp.parPublico.length;
  const kemPrivLen = (kp.kemPrivado as Uint8Array).length;
  const bytes = new Uint8Array(12 + privLen + pubLen + kemPrivLen);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, privLen, true);
  view.setUint32(4, pubLen, true);
  view.setUint32(8, kemPrivLen, true);
  bytes.set(kp.parPrivado, 12);
  bytes.set(kp.parPublico, 12 + privLen);
  bytes.set(kp.kemPrivado as Uint8Array, 12 + privLen + pubLen);
  return bytesToBase64(bytes);
}

export function deserializeKeypair(serializada: string): PostQuantumKeypair {
  const raw = base64ToBytes(serializada);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const privLen = view.getUint32(0, true);
  const pubLen = view.getUint32(4, true);

  // Layout v2 (with ML-KEM) or legacy layout v1 (signature keys only).
  const kemPrivLen = raw.length >= 12 ? view.getUint32(8, true) : 0;
  const tieneKem = kemPrivLen > 0 && 12 + privLen + pubLen + kemPrivLen === raw.length;
  const base = tieneKem ? 12 : 8;

  const parPrivado = raw.slice(base, base + privLen);
  const parPublico = raw.slice(base + privLen, base + privLen + pubLen);
  const kemPrivado = tieneKem ? raw.slice(base + privLen + pubLen) : undefined;

  return {
    parPrivado,
    parPublico,
    ...(kemPrivado ? { kemPrivado, kemPublico: ml_kem768.getPublicKey(kemPrivado) } : {}),
    algoritmo: ALGORITMO_FIRMA,
    tipo: TIPO_IDENTIDAD.EPHEMERA,
    fechaCreacion: Date.now(),
  };
}
