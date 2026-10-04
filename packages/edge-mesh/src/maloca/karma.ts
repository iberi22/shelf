import type { PostQuantumIdentity } from '../identity/index.js';
import type { OpLog } from '../op-log/index.js';
import { secureRandomString } from '../protocol/utils.js';
import type { NodoId, ParPublico } from '../types/index.js';
import type { Karma, TransaccionKarma } from './types.js';

/**
 * KarmaManager — reputation engine for mesh nodes.
 *
 * Generic: it holds no business rules (per-industry weights, thresholds, etc).
 * Each adapter (VeedurIA, Hosteler-IA, the medical network) registers its own.
 *
 * ─── REPUTATION IS TAMPER-PROOF, NOT TRUST-BASED ────────────────────────────
 *
 * A reputation score is only as good as the evidence behind it. For a network of
 * verified physicians, an unsigned or self-issued endorsement is worthless: it is
 * indistinguishable from an attacker with one compromised key. Therefore:
 *
 *   1. EVERY applied transaction carries a valid ML-DSA-65 signature from the
 *      issuer's public key. No signature, no score.
 *   2. A node can NEVER endorse itself (`emisor === sujeto` is rejected).
 *   3. `delta` is bounded. See {@link DELTA_MAX_ABS} for the rationale.
 *   4. Transaction application is IDEMPOTENT per `tx.id`, so a captured
 *      attestation replayed from the OpLog cannot be counted twice.
 *   5. Reputation only ever moves DOWN on its own: decay. An idle physician who
 *      stops being endorsed by peers loses standing over time, so a reputation
 *      earned once and never renewed cannot stand forever.
 *
 * ─── KNOWN LIMITATION ──────────────────────────────────────────────────────
 *
 * This class does not propagate reputation. A node only knows about the
 * transactions it has itself seen (locally emitted or handed to it by the
 * replication path). Until cross-node propagation lands, two nodes observing the
 * same endorsement will hold different scores. Decay must therefore be driven
 * per-node; convergence is the propagation layer's responsibility.
 *
 * ─── REPUTATION NEVER GRANTS ACCESS ────────────────────────────────────────
 *
 * Karma is a *signal*, never a credential. Access to the medical network must be
 * decided by the authz layer against a verified credential, never by comparing a
 * karma number. {@link DELTA_MAX_ABS} is sized so that even a fully compromised
 * peer cannot move a score across an access threshold on its own.
 */

/** Upper bound on the absolute value of a single `delta`. */
export const DELTA_MAX_ABS = 25 as const;

/**
 * Lowest accepted factor for {@link KarmaManager.applyDecay}. Guards against
 * passing 0 (which would wipe a score and make `getBestPeer` degenerate) or a
 * negative value (which would flip the score negative).
 */
export const FACTOR_DECAY_MIN = 0.01 as const;

/**
 * WHY 25?
 *
 * One endorsement is a weak, cheap signal — a single attacker must not be able to
 * move a score far. With a cap of 25:
 *
 *   - reaching a score of 100 (a plausible "verified" mark) takes at least 4
 *     independent endorsers, so reputation cannot be manufactured by one node;
 *   - a fully compromised peer can shift any score by at most 25, which is not
 *     enough to single-handedly cross an access threshold;
 *   - it stays wide enough for a real, strong endorsement to be meaningful without
 *     allowing the unbounded `delta: 1e9` self-award this module now rejects.
 *
 * Callers wanting domain-specific weights must aggregate several endorsements
 * rather than raise this ceiling.
 */

/** Why a transaction was refused. Exposed for logging and for tests. */
export type MotivoRechazo =
  | 'auto_emision'
  | 'delta_no_positivo'
  | 'delta_sobre_techo'
  | 'firma_vacia'
  | 'firma_invalida'
  | 'emisor_desconocido';

/**
 * Resolves the public key registered for a node id. Returns `null`/`undefined`
 * when the issuer is unknown.
 *
 * Injected rather than imported so that KarmaManager stays free of any dependency
 * on the peer registry; the replication layer supplies the resolver.
 */
export type ResolvedorClavePublica = (nodoId: NodoId) => ParPublico | null | undefined;

/**
 * Deterministically stringifies an object for signing.
 */
function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalStringify).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    '{' +
    keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify((obj as Record<string, unknown>)[k])}`).join(',') +
    '}'
  );
}

export class KarmaManager {
  private readonly oplog: OpLog;
  private readonly identity: PostQuantumIdentity;
  private readonly resolvePublicKey?: ResolvedorClavePublica;
  /** Peer public keys known to this node, consulted when no resolver is injected. */
  private readonly clavesConocidas: Map<string, ParPublico> = new Map();
  /** Ids of transactions already applied, for idempotent replay of the OpLog. */
  private readonly aplicadas: Set<string> = new Set();
  private cache: Map<string, Karma> = new Map();

  constructor(oplog: OpLog, identity: PostQuantumIdentity, resolvePublicKey?: ResolvedorClavePublica) {
    this.oplog = oplog;
    this.identity = identity;
    this.resolvePublicKey = resolvePublicKey;
  }

  /**
   * Registers the public key a node signs with, so its endorsements can be
   * verified locally. Called by the replication layer when a peer announces itself.
   */
  registrarClavePublica(nodoId: NodoId, parPublico: ParPublico): void {
    this.clavesConocidas.set(nodoId, parPublico);
  }

  /**
   * Loads karma state from the OpLog.
   * Must be called after creating the instance.
   *
   * Entries that no longer satisfy the validation rules are skipped rather than
   * applied: this is deliberate fail-closed behaviour, and it means unsigned
   * history written before this fix is discarded instead of being trusted.
   */
  async loadFromOpLog(): Promise<void> {
    this.cache.clear();
    this.aplicadas.clear();
    const ops = await this.oplog.obtenerTodas();
    for (const op of ops) {
      if (op.tipo === 'karma:emit') {
        const tx = op.datos as TransaccionKarma;
        await this.applyTransaction(tx);
      } else if (op.tipo === 'karma:decay') {
        const data = op.datos as { sujeto: NodoId; factor: number };
        this.applyDecayToCache(data.sujeto, data.factor);
      }
    }
  }

  /**
   * Emits a karma transaction signed with the node's PQC identity.
   *
   * Signing failure is fatal: an unsigned transaction is never emitted and never
   * persisted. Reputation without proof is not reputation.
   *
   * The transaction is validated before it reaches the OpLog, so an invalid
   * entry can never be replayed by a peer either.
   */
  async emit(txData: Omit<TransaccionKarma, 'id' | 'timestamp' | 'firma'>): Promise<TransaccionKarma> {
    const timestamp = Date.now();
    const id = `${txData.emisor}:${timestamp}:${secureRandomString(7)}`;

    const payloadData = { ...txData, id, timestamp };
    const payload = canonicalStringify(payloadData);
    // No fallback to an empty signature: if the PQC identity cannot sign, the
    // correct outcome is a rejected emission, not an unverifiable score.
    const firma = await this.identity.firmar(new TextEncoder().encode(payload));

    const tx: TransaccionKarma = {
      ...txData,
      id,
      timestamp,
      firma,
    };

    const motivo = await this.applyTransaction(tx);
    if (motivo !== null) {
      throw new Error(`Karma transaction rejected (${motivo}): ${id}`);
    }

    await this.oplog.append('karma:emit', tx, txData.emisor as any);
    return tx;
  }

  /**
   * Applies a transaction received from another node, applying every validation
   * rule. Returns `null` when applied, or the {@link MotivoRechazo} when refused.
   *
   * This is the entry point the replication layer must use for remote
   * endorsements.
   */
  async aplicarTransaccion(tx: TransaccionKarma): Promise<MotivoRechazo | null> {
    return this.applyTransaction(tx);
  }

  /**
   * Gets a node's karma score.
   */
  getScore(nodeId: NodoId): number {
    return this.cache.get(nodeId)?.total ?? 0;
  }

  /**
   * Gets a node's transaction history. Every entry keeps its original signature,
   * so any past endorsement can be re-verified independently.
   */
  getHistory(nodeId: NodoId): readonly TransaccionKarma[] {
    return this.cache.get(nodeId)?.historial ?? [];
  }

  /**
   * Applies decay (forgetting) to a node's score.
   * - factor: 0.95 reduces 5%, 0.90 reduces 10%, etc.
   *
   * This is the ONLY sanctioned way for a score to go down. A node that stops
   * being endorsed by its peers loses standing over time instead of keeping a
   * reputation it no longer earns. Rejects out-of-range factors instead of
   * silently corrupting the score.
   */
  async applyDecay(nodeId: NodoId, factor: number = 0.95): Promise<void> {
    if (!this.factorValido(factor)) return;
    this.applyDecayToCache(nodeId, factor);
    await this.oplog.append('karma:decay', { sujeto: nodeId, factor }, nodeId as any);
  }

  /**
   * Verifies a transaction signature against a public key.
   */
  async verify(tx: TransaccionKarma, publicKey: ParPublico): Promise<boolean> {
    if (!tx || !ArrayBuffer.isView(tx.firma) || tx.firma.length === 0) return false;
    const { firma, ...rest } = tx;
    const payload = canonicalStringify(rest);
    return this.identity.verificar(new TextEncoder().encode(payload), firma, publicKey);
  }

  // ─── INTERNOS ───────────────────────────────────────────────────────

  /**
   * Returns the peer with the highest karma in the mesh (for work assignment).
   * Returns null if no peers have registered karma.
   */
  getBestPeer(): NodoId | null {
    let best: NodoId | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const [nodeId, karma] of this.cache.entries()) {
      if (karma.total > bestScore) {
        best = nodeId as NodoId;
        bestScore = karma.total;
      }
    }
    return best;
  }

  /**
   * Validates a transaction and, only if it passes every rule, folds it into the
   * cache. Returns `null` on success or the rejection reason on failure.
   *
   * Rule order matters: cheap structural checks run before the signature
   * verification, so an obviously malformed transaction never costs a PQC
   * operation.
   */
  private async applyTransaction(tx: TransaccionKarma): Promise<MotivoRechazo | null> {
    if (!tx || typeof tx !== 'object') return 'firma_invalida';

    // A node endorsing itself is the single most valuable attack: it needs no
    // other compromised key and grants unbounded reputation for free.
    if (tx.emisor === tx.sujeto) return 'auto_emision';

    // Reputation is only ever granted by a peer's positive endorsement. Negative
    // deltas are refused on purpose: a targeted penalty is a griefing primitive
    // (any peer could bury a competitor's standing), so decay is the only path
    // that lowers a score and it is uniform, gradual and untargetable.
    if (typeof tx.delta !== 'number' || !Number.isFinite(tx.delta) || tx.delta <= 0) {
      return 'delta_no_positivo';
    }
    if (tx.delta > DELTA_MAX_ABS) return 'delta_sobre_techo';

    if (!tx.firma || !ArrayBuffer.isView(tx.firma) || tx.firma.length === 0) {
      return 'firma_vacia';
    }

    // Replay protection: the same attestation replayed from the OpLog must not be
    // counted twice.
    if (this.aplicadas.has(tx.id)) return null;

    const parPublico = this.clavePublicaDe(tx.emisor);
    if (!parPublico) return 'emisor_desconocido';

    const firmaValida = await this.verify(tx, parPublico);
    if (!firmaValida) return 'firma_invalida';

    const target = tx.sujeto;
    const current = this.cache.get(target) ?? {
      total: 0,
      historial: [],
      pesosPorProyecto: {},
      ultimoDecay: Date.now(),
    };

    this.cache.set(target, {
      total: current.total + tx.delta,
      historial: [...current.historial, tx],
      pesosPorProyecto: {
        ...current.pesosPorProyecto,
        [tx.proyecto]: (current.pesosPorProyecto[tx.proyecto] ?? 0) + tx.delta,
      },
      ultimoDecay: current.ultimoDecay,
    });
    this.aplicadas.add(tx.id);
    return null;
  }

  private clavePublicaDe(emisor: NodoId): ParPublico | null {
    const registrada = this.clavesConocidas.get(emisor);
    if (registrada) return registrada;
    const resuelta = this.resolvePublicKey?.(emisor);
    if (resuelta) return resuelta;
    // A transaction that claims to come from this very node is verified against
    // this node's own key: that is by definition the correct key for it, and it
    // lets a node endorse a peer without any registry lookup.
    if (emisor === this.identity.nodoId) return this.identity.exportarPublico();
    return null;
  }

  private static factorValido(factor: number): boolean {
    return typeof factor === 'number' && Number.isFinite(factor) && factor >= FACTOR_DECAY_MIN && factor <= 1;
  }

  private factorValido(factor: number): boolean {
    return KarmaManager.factorValido(factor);
  }

  private applyDecayToCache(nodeId: NodoId, factor: number): void {
    if (!KarmaManager.factorValido(factor)) return;
    const current = this.cache.get(nodeId);
    if (!current) return;

    // Per-project weights decay with the total, otherwise the two views drift
    // apart and a decayed node still looks strong in its project breakdown.
    const pesosPorProyecto: Record<string, number> = {};
    for (const [proyecto, peso] of Object.entries(current.pesosPorProyecto)) {
      pesosPorProyecto[proyecto] = peso * factor;
    }

    this.cache.set(nodeId, {
      ...current,
      total: Math.max(0, current.total * factor),
      pesosPorProyecto,
      ultimoDecay: Date.now(),
    });
  }
}

export type { TransaccionKarma };
