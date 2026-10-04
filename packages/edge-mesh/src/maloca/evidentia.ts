import type { PostQuantumIdentity } from '../identity/index.js';
import type { MeshManager } from '../mesh/index.js';
import { canonicalSerialize } from '../protocol/canonical.js';
import { bytesAHex, hexABytes } from '../protocol/utils.js';
import type { NodoId, ParPublico } from '../types/index.js';

// ─── EVIDENTIA ─────────────────────────────────────────────────────────────

/**
 * Provenance block: who issued the evidence, when, and WHAT it backs.
 *
 * Without it a notarization is just a signed assertion: the signature proves
 * that some key said something, but not what was being attested. In the
 * medical mesh (verified doctors) the attestation subject is the whole point:
 * "an accredited doctor attests that this vaccination record is true" must be
 * distinguishable from "a node said something about a document".
 */
export interface Procedencia {
  /** Emission time (epoch ms). */
  readonly fechaEmision: number;
  /** Issuer node id. Must equal `Evidentia.emisor` (checked at verify time). */
  readonly emisor: NodoId;
  /** What the evidence actually backs, in the issuer's own words. */
  readonly queRespalda: string;
  /** Optional human label for the issuer (e.g. "Cardenal XYZ, licence 1234"). */
  readonly descripcionEmisor?: string;
  /** Optional pointer to the underlying proof (external record id, hash, URL). */
  readonly referencia?: string;
}

export interface Evidentia {
  readonly hash: string;
  readonly tipo: string;
  readonly contenidoHash: string;
  readonly emisor: NodoId;
  readonly firmaPQC: string;
  readonly red: string;
  readonly confirmaciones: number;
  readonly timestamp: number;
  /** Signed provenance block. Required: an evidence without it is rejected. */
  readonly procedencia: Procedencia;
}

/** Result of a full verification, with the reason for a rejection. */
export interface VerificacionEvidencia {
  readonly valido: boolean;
  readonly motivo: string;
}

/**
 * Exact fields covered by the ML-DSA-65 signature.
 *
 * `hash`, `firmaPQC`, `confirmaciones` and `red` are deliberately excluded:
 * they are either derived, mutable, or transport metadata. Everything that
 * carries meaning (what, who, when, what-it-proves) IS signed.
 */
export interface EvidentiaFirmada {
  readonly version: 1;
  readonly tipo: string;
  readonly contenidoHash: string;
  readonly emisor: NodoId;
  readonly timestamp: number;
  readonly procedencia: Procedencia;
}

/** Canonical byte serialization of the signed body (ML-DSA message). */
export function canonicalEvidentiaBytes(cuerpo: EvidentiaFirmada): Uint8Array {
  return canonicalSerialize({
    version: cuerpo.version,
    tipo: cuerpo.tipo,
    contenidoHash: cuerpo.contenidoHash,
    emisor: cuerpo.emisor,
    timestamp: cuerpo.timestamp,
    procedencia: {
      fechaEmision: cuerpo.procedencia.fechaEmision,
      emisor: cuerpo.procedencia.emisor,
      queRespalda: cuerpo.procedencia.queRespalda,
      descripcionEmisor: cuerpo.procedencia.descripcionEmisor ?? null,
      referencia: cuerpo.procedencia.referencia ?? null,
    },
  });
}

/** Build the signed body out of a full Evidentia. */
export function cuerpoFirmado(ev: Evidentia): EvidentiaFirmada {
  return {
    version: 1,
    tipo: ev.tipo,
    contenidoHash: ev.contenidoHash,
    emisor: ev.emisor,
    timestamp: ev.timestamp,
    procedencia: ev.procedencia,
  };
}

// ─── EVIDENTIA MANAGER ─────────────────────────────────────────────────────

/** Clock skew tolerated on `fechaEmision` / `timestamp` before rejection. */
const TOLERANCIA_RELOJ_MS = 5 * 60 * 1000;

export class EvidentiaManager extends EventTarget {
  private readonly identity: PostQuantumIdentity;
  private readonly mesh: MeshManager;
  private readonly evidentias: Map<string, Evidentia>;
  /** Issuer public keys known out-of-band. Never read from an evidence payload. */
  private readonly clavesPublicas: Map<string, ParPublico>;
  private readonly NAMESPACE = '_maloca:evidentia';

  constructor(identity: PostQuantumIdentity, mesh: MeshManager) {
    super();
    this.identity = identity;
    this.mesh = mesh;
    this.evidentias = new Map();
    this.clavesPublicas = new Map();
    // The local keypair is trusted by construction: we hold the private half.
    this.registrarEmisor(identity.nodoId, identity.exportarPublico());
  }

  /**
   * Register an issuer public key. Only keys obtained through a trusted
   * channel (identity handshake, admin roster) may be registered here —
   * `verify()` deliberately refuses to trust a pubkey carried inside the
   * evidence it is asked to validate.
   */
  registrarEmisor(emisor: NodoId | string, parPublico: ParPublico): void {
    if (!parPublico || parPublico.length === 0) return;
    this.clavesPublicas.set(String(emisor), new Uint8Array(parPublico));
  }

  clavePublicaDe(emisor: NodoId | string): ParPublico | undefined {
    return this.clavesPublicas.get(String(emisor));
  }

  async notarize(contenido: unknown, tipo: string, procedencia?: Partial<Procedencia>): Promise<Evidentia> {
    const encoder = new TextEncoder();
    const contenidoStr = JSON.stringify(contenido);
    const contenidoBytes = encoder.encode(contenidoStr);

    // Hashear contenido (SHA-256)
    const digest = await crypto.subtle.digest('SHA-256', contenidoBytes);
    const contenidoHash = bytesAHex(new Uint8Array(digest));

    const emisor = this.identity.nodoId;
    const timestamp = Date.now();

    // Provenance is part of the signed body, so it must be resolved BEFORE signing.
    const proc: Procedencia = {
      fechaEmision: procedencia?.fechaEmision ?? timestamp,
      emisor: procedencia?.emisor ?? emisor,
      queRespalda: (procedencia?.queRespalda ?? tipo).trim(),
      ...(procedencia?.descripcionEmisor !== undefined ? { descripcionEmisor: procedencia.descripcionEmisor } : {}),
      ...(procedencia?.referencia !== undefined ? { referencia: procedencia.referencia } : {}),
    };

    const cuerpo: EvidentiaFirmada = {
      version: 1,
      tipo,
      contenidoHash,
      emisor,
      timestamp,
      procedencia: proc,
    };

    // Firmar con PQC el cuerpo canónico completo (contenido + procedencia)
    const firmaBytes = await this.identity.firmar(canonicalEvidentiaBytes(cuerpo));
    const firmaPQC = bytesAHex(firmaBytes);

    // Crear hash de la notarización completa
    const notarizacionId = await this.calcularHashNotarizacion(contenidoHash, firmaPQC, emisor);

    const evidentia: Evidentia = {
      hash: notarizacionId,
      tipo,
      contenidoHash,
      emisor,
      firmaPQC,
      red: 'maloca-mesh',
      confirmaciones: 1,
      timestamp,
      procedencia: proc,
    };

    this.evidentias.set(evidentia.hash, evidentia);

    // Difundir en la red mesh
    await this.broadcastToBlockchain(evidentia);

    this.dispatchEvent(new CustomEvent('notarizacionCreada', { detail: evidentia }));

    return evidentia;
  }

  /**
   * Full verification of a locally known evidence.
   *
   * Returns false (and dispatches `evidenciaRechazada`) unless EVERY check
   * passes: id integrity, provenance sanity, a registered issuer key, and a
   * valid ML-DSA-65 signature over the canonical body.
   */
  async verify(hash: string): Promise<boolean> {
    const evidentia = this.evidentias.get(hash);
    if (!evidentia) return false;

    const res = await this.verificarEvidentia(evidentia);
    if (!res.valido) {
      this.dispatchEvent(
        new CustomEvent('evidenciaRechazada', { detail: { hash, motivo: res.motivo, emisor: evidentia.emisor } }),
      );
    }
    return res.valido;
  }

  /**
   * Verify an evidence received from the network (not yet trusted locally).
   * Same checks as `verify()`; used by callers that ingest gossiped proofs and
   * must reject anything they cannot cryptographically attribute.
   */
  async verificarEvidentia(ev: Evidentia): Promise<VerificacionEvidencia> {
    if (!ev || typeof ev !== 'object') return { valido: false, motivo: 'evidencia invalida' };
    if (typeof ev.firmaPQC !== 'string' || ev.firmaPQC.length === 0) {
      return { valido: false, motivo: 'firma ausente' };
    }
    if (!ev.procedencia) return { valido: false, motivo: 'procedencia ausente' };

    // 1. Identity of the record itself: hash must match its own components,
    //    otherwise a peer could mutate tipo/contenidoHash/emisor in flight.
    const esperado = await this.calcularHashNotarizacion(ev.contenidoHash, ev.firmaPQC, ev.emisor);
    if (esperado !== ev.hash) return { valido: false, motivo: 'hash inconsistente' };

    // 2. Provenance sanity: who, when, what.
    const proc = ev.procedencia;
    if (proc.emisor !== ev.emisor) return { valido: false, motivo: 'procedencia con emisor distinto' };
    if (typeof proc.queRespalda !== 'string' || proc.queRespalda.trim().length === 0) {
      return { valido: false, motivo: 'procedencia sin queRespalda' };
    }
    if (!Number.isFinite(proc.fechaEmision) || proc.fechaEmision <= 0) {
      return { valido: false, motivo: 'procedencia con fecha invalida' };
    }
    const ahora = Date.now();
    if (proc.fechaEmision - ahora > TOLERANCIA_RELOJ_MS || ahora - proc.fechaEmision > TOLERANCIA_RELOJ_MS) {
      return { valido: false, motivo: 'procedencia fuera de la ventana temporal' };
    }
    if (!Number.isFinite(ev.timestamp) || ev.timestamp <= 0) {
      return { valido: false, motivo: 'timestamp invalido' };
    }

    // 3. Issuer key must be REGISTERED. A pubkey shipped inside the evidence
    //    itself would make the signature self-certifying: worthless.
    const parPublico = this.clavesPublicas.get(String(ev.emisor));
    if (!parPublico) return { valido: false, motivo: 'pubkey del emisor no registrada' };

    // 4. ML-DSA-65 signature over the canonical body (content + provenance).
    let firmaBytes: Uint8Array;
    try {
      firmaBytes = hexABytes(ev.firmaPQC);
    } catch {
      return { valido: false, motivo: 'firma malformada' };
    }
    if (firmaBytes.length === 0) return { valido: false, motivo: 'firma malformada' };

    const ok = await this.identity.verificar(canonicalEvidentiaBytes(cuerpoFirmado(ev)), firmaBytes, parPublico);
    if (!ok) return { valido: false, motivo: 'firma PQC invalida' };

    return { valido: true, motivo: 'ok' };
  }

  getProof(hash: string): Evidentia | null {
    return this.evidentias.get(hash) ?? null;
  }

  async broadcastToBlockchain(evidentia: Evidentia): Promise<void> {
    // Difundir vía gossip en el mesh como "blockchain adapter"
    await this.mesh.transmitirConGossip(this.NAMESPACE, {
      tipo: 'DOC_NOTARIZED',
      evidentia,
    });
  }

  private async calcularHashNotarizacion(contenidoHash: string, firmaPQC: string, emisor: string): Promise<string> {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${contenidoHash}${firmaPQC}${emisor}`));
    return bytesAHex(new Uint8Array(digest));
  }
}

// ─── SHA-256 UNIVERSAL (Web Crypto API) ────────────────────────────────────
// Reemplaza `node:crypto.createHash` para que edge-mesh sea universal
// (browser + node). Determinista: mismo SHA-256 sobre los mismos bytes.

const sha256Encoder = new TextEncoder();

async function sha256Hex(data: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const bytes = typeof data === 'string' ? sha256Encoder.encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesAHex(new Uint8Array(digest));
}

// ─── MERKLE TREE & SPLIT-BRAIN MERGE ───────────────────────────────────────

export interface Leaf {
  readonly id: string;
  readonly hash: string;
  readonly timestamp: number;
  readonly data?: unknown;
}

export class MerkleTree {
  private leaves: Leaf[];
  private root: string;
  private buildPromise: Promise<void>;
  private buildGeneration: number = 0;
  public signature?: string;

  constructor(leaves: Leaf[] = []) {
    this.leaves = [...leaves];
    this.root = '';
    // rebuild() es async (Web Crypto); se dispara y se espera vía buildPromise.
    this.buildPromise = this.rebuild();
  }

  getLeaves(): Leaf[] {
    return [...this.leaves];
  }

  async add(leaf: Leaf): Promise<void> {
    this.leaves.push(leaf);
    this.buildPromise = this.rebuild();
    await this.buildPromise;
  }

  async getRoot(): Promise<string> {
    await this.buildPromise;
    return this.root;
  }

  private async rebuild(): Promise<void> {
    // Generación anti-race: si un rebuild previo termina después que uno nuevo,
    // su resultado se descarta (snapshot + guard de generación).
    const generation = ++this.buildGeneration;
    const snapshot = [...this.leaves];

    if (snapshot.length === 0) {
      this.root = '';
      return;
    }

    let level: string[] = [];
    for (const leaf of snapshot) {
      level.push(await hashLeaf(leaf));
    }

    while (level.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        if (i + 1 < level.length) {
          const left = level[i];
          const right = level[i + 1];
          const combined = left < right ? left + right : right + left;
          nextLevel.push(await sha256Hex(combined));
        } else {
          const left = level[i];
          const combined = left + left;
          nextLevel.push(await sha256Hex(combined));
        }
      }
      level = nextLevel;
    }

    if (generation === this.buildGeneration) {
      this.root = level[0] || '';
    }
  }

  async verify(leaf: Leaf, proof: string[]): Promise<boolean> {
    let currentHash = await hashLeaf(leaf);
    for (const sibling of proof) {
      const combined = currentHash < sibling ? currentHash + sibling : sibling + currentHash;
      currentHash = await sha256Hex(combined);
    }
    return currentHash === (await this.getRoot());
  }

  async getProof(leaf: Leaf): Promise<string[]> {
    let index = this.leaves.findIndex((l) => l.id === leaf.id);
    if (index === -1) return [];

    const proof: string[] = [];
    let level: string[] = [];
    for (const l of this.leaves) {
      level.push(await hashLeaf(l));
    }

    while (level.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        if (i + 1 < level.length) {
          const left = level[i];
          const right = level[i + 1];
          const combined = left < right ? left + right : right + left;
          nextLevel.push(await sha256Hex(combined));

          if (i === index) {
            proof.push(right);
          } else if (i + 1 === index) {
            proof.push(left);
          }
        } else {
          const left = level[i];
          const combined = left + left;
          nextLevel.push(await sha256Hex(combined));

          if (i === index) {
            proof.push(left);
          }
        }
      }
      index = Math.floor(index / 2);
      level = nextLevel;
    }
    return proof;
  }
}

export async function hashLeaf(leaf: Leaf): Promise<string> {
  const dataToHash = `${leaf.id}:${leaf.hash}:${leaf.timestamp}`;
  return sha256Hex(dataToHash);
}

export interface MerkleMergeResult {
  mergedTree: MerkleTree;
  conflictCount: number;
  resolvedLeaves: Leaf[];
  pendingLeaves: Leaf[]; // leaves que requieren governance vote
}

export async function mergeMerkleTrees(
  treeA: MerkleTree,
  treeB: MerkleTree,
  identity?: PostQuantumIdentity,
): Promise<MerkleMergeResult> {
  // Atomic rollback check: take snapshots of leaves to prevent mutating treeA or treeB
  const originalLeavesA = treeA.getLeaves();
  const originalLeavesB = treeB.getLeaves();

  // Atomicidad: se trabaja sobre snapshots de leaves (originalLeavesA/B),
  // nunca se mutan treeA ni treeB. Cualquier error aborta sin efectos.
  const leavesMap = new Map<string, { a?: Leaf; b?: Leaf }>();

  for (const leaf of originalLeavesA) {
    leavesMap.set(leaf.id, { a: leaf });
  }

  for (const leaf of originalLeavesB) {
    const entry = leavesMap.get(leaf.id) || {};
    entry.b = leaf;
    leavesMap.set(leaf.id, entry);
  }

  const mergedLeaves: Leaf[] = [];
  const resolvedLeaves: Leaf[] = [];
  const pendingLeaves: Leaf[] = [];
  let conflictCount = 0;

  for (const [_, entry] of leavesMap.entries()) {
    if (entry.a && !entry.b) {
      mergedLeaves.push(entry.a);
    } else if (!entry.a && entry.b) {
      mergedLeaves.push(entry.b);
    } else if (entry.a && entry.b) {
      const leafA = entry.a;
      const leafB = entry.b;

      if (leafA.hash === leafB.hash) {
        // No conflict, they are identical
        mergedLeaves.push(leafA);
      } else {
        // Conflict!
        conflictCount++;
        const diff = Math.abs(leafA.timestamp - leafB.timestamp);
        const fiveMinutesMs = 5 * 60 * 1000;

        if (diff > fiveMinutesMs) {
          // Resolve by LWW (Last-Writer-Wins)
          const winner = leafA.timestamp > leafB.timestamp ? leafA : leafB;
          resolvedLeaves.push(winner);
          mergedLeaves.push(winner);
        } else {
          // Irresoluble conflict, requires governance vote
          pendingLeaves.push(leafA);
          pendingLeaves.push(leafB);
        }
      }
    }
  }

  // Create merged tree
  const mergedTree = new MerkleTree(mergedLeaves);

  // El nuevo root se firma con ML-DSA-65
  if (identity) {
    const root = await mergedTree.getRoot();
    if (root) {
      const encoder = new TextEncoder();
      const rootBytes = encoder.encode(root);
      const digest = await crypto.subtle.digest('SHA-256', rootBytes);
      const signatureBytes = await identity.firmar(new Uint8Array(digest));
      mergedTree.signature = bytesAHex(signatureBytes);
    }
  }

  return {
    mergedTree,
    conflictCount,
    resolvedLeaves,
    pendingLeaves,
  };
}
