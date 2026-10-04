// ─── MESH MANAGER ESCALABLE ─────────────────────────────────────────────
// Mesh manager optimizado para escalar a 50+ peers simultáneos.
// No flood broadcast: usa gossip protocol + fan-out limitado.
// Namespace-aware routing: solo envía updates a peers en el mismo salón.
//
// Estrategia: cada peer mantiene un subconjunto aleatorio de conexiones
// y propaga mensajes via gossip con fan-out controlado (default 3).
// Los heartbeats mantienen el mesh vivo. La detección de peers nuevos
// se hace via el broker PeerJS.

import type { EdgeMesh } from '../edge-mesh.js';
// Type-only import: MeshManager must not pull karma.ts into its runtime graph.
// The wire format is structurally checked below; every security rule (signature,
// self-endorsement, delta ceiling, idempotency) belongs to KarmaManager and is
// enforced by calling its public API, never by re-implementing it here.
import type { MotivoRechazo } from '../maloca/karma.js';
import type { TransaccionKarma } from '../maloca/types.js';
import { createEnvelope } from '../protocol/index.js';
import { generarNonce } from '../protocol/utils.js';
import { TokenBucketRateLimiter } from '../security/rate-limiter.js';
import type { NodoId, ParPublico } from '../types/index.js';
import { TIPO_MENSAJE } from '../types/index.js';

// ─── CONST OBJECT PATTERNS ────────────────────────────────────────────────

export const ESTRATEGIA_FAN_OUT = {
  ALEATORIA: 'aleatoria',
  POR_SALUD: 'por_salud',
  POR_LATENCIA: 'por_latencia',
} as const;

export type EstrategiaFanOut = (typeof ESTRATEGIA_FAN_OUT)[keyof typeof ESTRATEGIA_FAN_OUT];

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

const FAN_OUT_POR_DEFECTO = 3 as const;
const MAX_PEERS_POR_NODO = 12 as const;
const HEARTBEAT_MESH_MS = 3_000 as const;
const TIMEOUT_PEER_MS = 12_000 as const;
const GOSSIP_TTL_POR_DEFECTO = 5 as const;
const MAX_RECONEXIONES = 3 as const;
const INTERVALO_LIMPIEZA_MS = 30_000 as const;

// ─── TYPES ────────────────────────────────────────────────────────────────

export interface MeshConfig {
  readonly nodoId: NodoId;
  readonly fanOut: number;
  readonly maxPeers: number;
  readonly heartbeatIntervalMs: number;
  readonly peerTimeoutMs: number;
  readonly gossipTTL: number;
  readonly estrategia: EstrategiaFanOut;
  readonly namespacePorDefecto: string;
}

export interface PeerInfo {
  readonly nodoId: NodoId;
  readonly timestamp: number;
  readonly ultimoHeartbeat: number;
  readonly latenciaMs: number;
  readonly fanOutIndex: number;
  readonly estado: 'activo' | 'lento' | 'caido';
  readonly intentosReconexion: number;
  readonly namespace?: string;
}

export interface GossipMessage {
  readonly id: string;
  readonly namespace: string;
  readonly ttl: number;
  readonly payload: unknown;
  readonly origen: NodoId;
  readonly timestamp: number;
  readonly ruta: readonly NodoId[];
}

export interface MeshEventMap {
  peerConectado: CustomEvent<{
    readonly peerId: NodoId;
    readonly namespace?: string;
  }>;
  peerDesconectado: CustomEvent<{ readonly peerId: NodoId }>;
  peerDescubierto: CustomEvent<{
    readonly peerId: NodoId;
    readonly via: NodoId;
  }>;
  gossipRecibido: CustomEvent<{ readonly mensaje: GossipMessage }>;
  /** A remote endorsement survived signature verification and moved a score. */
  karmaRecibido: CustomEvent<{ readonly tx: TransaccionKarma; readonly desde: NodoId }>;
  /** A remote endorsement was refused. `motivo` is KarmaManager's own verdict. */
  karmaRechazado: CustomEvent<{
    readonly txId: string | null;
    readonly motivo: MotivoRechazo | 'payload_malformado';
    readonly desde: NodoId;
  }>;
  meshSaludActualizada: CustomEvent<{
    readonly peersActivos: number;
    readonly peersTotales: number;
  }>;
  namespaceSincronizado: CustomEvent<{
    readonly namespace: string;
    readonly peers: readonly NodoId[];
  }>;
  error: CustomEvent<{ readonly mensaje: string; readonly error?: Error }>;
  rate_limited: CustomEvent<{
    readonly peerId: string;
    readonly resource: string;
  }>;
}

// ─── KARMA OVER GOSSIP ─────────────────────────────────────────────────────

/**
 * The karma engine a MeshManager replicates into, expressed as the narrow slice of
 * KarmaManager this layer is allowed to use.
 *
 * Structural on purpose: `mesh/index.ts` must not depend on the karma runtime
 * graph, and a hand-written stand-in must not be able to satisfy it and silently
 * skip validation. `aplicarTransaccion` is the ONLY method that may move a score,
 * which is what makes "gossip is a carrier, not an authority" enforceable.
 */
export interface ConsumidorKarma {
  /**
   * The one entry point that may move a score. Returns null when applied (and when
   * the transaction is a duplicate `tx.id`, by design), or the refusal reason.
   */
  readonly aplicarTransaccion: (tx: TransaccionKarma) => Promise<MotivoRechazo | null>;
  /**
   * Registers a key the node already trusts (e.g. from the EdgeMesh peer
   * registry). Optional: a consumer that resolves keys itself needs not expose it.
   */
  readonly registrarClavePublica?: (nodoId: NodoId, parPublico: ParPublico) => void;
}

/** Named options for the MeshManager constructor. */
export interface MeshManagerOpciones {
  /**
   * Karma engine to replicate remote endorsements into. Omit for a mesh that only
   * carries gossip for other purposes.
   */
  readonly consumidorKarma?: ConsumidorKarma;
}

/**
 * Accepts either the karma consumer itself or a named-options bag, so the common
 * pairing stays a two-argument call while adding a second option later is not a
 * breaking change.
 */
function resolverConsumidorKarma(arg: ConsumidorKarma | MeshManagerOpciones | undefined): ConsumidorKarma | undefined {
  if (arg === undefined) return undefined;
  if ('aplicarTransaccion' in arg) return arg;
  return arg.consumidorKarma;
}

/**
 * Payload MeshManager gossips to carry an endorsement. Wire-versioned so a
 * future change to the transaction format is distinguishable on the wire.
 */
export const PAYLOAD_KARMA_TIPO = 'karma:tx' as const;

/**
 * Rehydrates and structurally validates an endorsement that arrived over the wire.
 *
 * It deliberately checks ONLY the shape needed to survive transport
 * (Uint8Array signatures come back as ArrayBuffer or plain number arrays in the
 * wild) and to hand something well-typed to KarmaManager.
 *
 * It is NOT a security check. Nothing here is trusted: it does not inspect the
 * signature, `emisor`, `sujeto` or `delta` semantics. Those verdicts belong to
 * KarmaManager.aplicarTransaccion, which is the only path a remote transaction
 * may take.
 */
function normalizarTransaccionKarma(valor: unknown): TransaccionKarma | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const p = valor as Partial<TransaccionKarma>;

  if (typeof p.id !== 'string' || p.id.length === 0) return null;
  if (typeof p.emisor !== 'string' || p.emisor.length === 0) return null;
  if (typeof p.sujeto !== 'string' || p.sujeto.length === 0) return null;
  // Only "is it a number at all". Range and sign are KarmaManager's rules.
  if (typeof p.delta !== 'number' || !Number.isFinite(p.delta)) return null;

  const firma = normalizarFirma(p.firma);
  if (firma === null) return null;

  return {
    id: p.id,
    tipo: typeof p.tipo === 'string' ? p.tipo : '',
    proyecto: typeof p.proyecto === 'string' ? p.proyecto : '',
    sujeto: p.sujeto,
    delta: p.delta,
    razon: typeof p.razon === 'string' ? p.razon : '',
    emisor: p.emisor,
    timestamp: typeof p.timestamp === 'number' && Number.isFinite(p.timestamp) ? p.timestamp : 0,
    firma,
  };
}

/**
 * Rehydrates a signature that arrived as an ArrayBuffer or as a plain number
 * array (JSON round-trip) back into the Uint8Array KarmaManager.verify expects.
 * A transport that mangled it beyond recognition yields null and is refused.
 */
function normalizarFirma(firma: unknown): Uint8Array | null {
  if (firma instanceof Uint8Array) return firma.length > 0 ? firma : null;
  if (firma instanceof ArrayBuffer) return firma.byteLength > 0 ? new Uint8Array(firma) : null;
  if (Array.isArray(firma)) {
    if (firma.length === 0) return null;
    if (!firma.every((b) => typeof b === 'number' && Number.isInteger(b) && b >= 0 && b <= 255)) return null;
    return new Uint8Array(firma as number[]);
  }
  return null;
}

// ─── MESH MANAGER ─────────────────────────────────────────────────────────

export class MeshManager extends EventTarget {
  readonly config: MeshConfig;
  private readonly edgeMesh: EdgeMesh;
  private readonly peers: Map<NodoId, PeerInfo>;
  private readonly gossipsVistos: Set<string>;
  private readonly gossipRateLimiter = new TokenBucketRateLimiter({
    tokensPerInterval: 100,
    intervalMs: 1000,
    maxTokens: 200,
  });
  private readonly namespacePeers: Map<string, Set<NodoId>>;
  /**
   * Karma engine to replicate into. Absent means this MeshManager is a pure
   * carrier (chat/sync only) and remote endorsements are ignored rather than
   * validated with a stand-in.
   */
  private consumidorKarma?: ConsumidorKarma;
  /** In-flight karma applications, so callers can await propagation instead of sleeping. */
  private readonly karmaEnCurso: Set<Promise<unknown>> = new Set();
  private activo: boolean = false;
  private intervalos: {
    heartbeat?: ReturnType<typeof setInterval>;
    limpieza?: ReturnType<typeof setInterval>;
  } = {};

  constructor(config: Partial<MeshConfig> & { nodoId: NodoId }, edgeMesh: EdgeMesh, consumidorKarma?: ConsumidorKarma);
  constructor(config: Partial<MeshConfig> & { nodoId: NodoId }, edgeMesh: EdgeMesh, opciones?: MeshManagerOpciones);
  constructor(
    config: Partial<MeshConfig> & { nodoId: NodoId },
    edgeMesh: EdgeMesh,
    consumidorOrOpciones?: ConsumidorKarma | MeshManagerOpciones,
  ) {
    super();
    this.edgeMesh = edgeMesh;
    this.peers = new Map();
    this.gossipsVistos = new Set();
    this.namespacePeers = new Map();

    this.consumidorKarma = resolverConsumidorKarma(consumidorOrOpciones);

    this.config = {
      nodoId: config.nodoId,
      fanOut: config.fanOut ?? FAN_OUT_POR_DEFECTO,
      maxPeers: config.maxPeers ?? MAX_PEERS_POR_NODO,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? HEARTBEAT_MESH_MS,
      peerTimeoutMs: config.peerTimeoutMs ?? TIMEOUT_PEER_MS,
      gossipTTL: config.gossipTTL ?? GOSSIP_TTL_POR_DEFECTO,
      estrategia: config.estrategia ?? ESTRATEGIA_FAN_OUT.ALEATORIA,
      namespacePorDefecto: config.namespacePorDefecto ?? 'global',
    };
  }

  // ─── CICLO DE VIDA ───────────────────────────────────────────────────

  async iniciar(): Promise<void> {
    if (this.activo) return;
    this.activo = true;

    // Heartbeat periódico
    this.intervalos.heartbeat = setInterval(() => {
      void this.transmitirHeartbeat();
    }, this.config.heartbeatIntervalMs);

    // Limpieza periódica de peers caídos y gossip cache
    this.intervalos.limpieza = setInterval(() => {
      this.limpiarPeersCaidos();
      this.limpiarGossipCache();
    }, INTERVALO_LIMPIEZA_MS);

    // Escuchar eventos del edge mesh para actualizar peers
    this.edgeMesh.on('nodoConectado', (ev) => {
      void this.conectarPeer(ev.detail.nodoId);
    });

    this.edgeMesh.on('nodoDesconectado', (ev) => {
      void this.desconectarPeer(ev.detail.nodoId);
    });
  }

  async detener(): Promise<void> {
    this.activo = false;

    if (this.intervalos.heartbeat !== undefined) {
      clearInterval(this.intervalos.heartbeat);
    }
    if (this.intervalos.limpieza !== undefined) {
      clearInterval(this.intervalos.limpieza);
    }

    this.peers.clear();
    this.gossipsVistos.clear();
    this.namespacePeers.clear();
  }

  // ─── GESTION DE PEERS ────────────────────────────────────────────────

  async conectarPeer(peerId: NodoId, namespace?: string): Promise<void> {
    if (peerId === this.config.nodoId) return;
    if (!this.activo) return;

    const existente = this.peers.get(peerId);
    if (existente !== undefined) {
      // Actualizar estado
      this.peers.set(peerId, {
        ...existente,
        estado: 'activo',
        ultimoHeartbeat: Date.now(),
        namespace: namespace ?? existente.namespace,
      });
      return;
    }

    // Verificar límite de peers
    if (this.peers.size >= this.config.maxPeers) {
      // Reemplazar el peer más inactivo
      const peorPeer = this.encontrarPeorPeer();
      if (peorPeer !== null) {
        this.peers.delete(peorPeer);
      } else {
        return; // No se puede conectar más peers
      }
    }

    const peerInfo: PeerInfo = {
      nodoId: peerId,
      timestamp: Date.now(),
      ultimoHeartbeat: Date.now(),
      latenciaMs: 0,
      fanOutIndex: Math.floor(Math.random() * this.config.fanOut),
      estado: 'activo',
      intentosReconexion: 0,
      namespace,
    };

    this.peers.set(peerId, peerInfo);

    // Registrar en el namespace correspondiente
    const ns = namespace ?? this.config.namespacePorDefecto;
    this.agregarPeerANamespace(peerId, ns);

    this.dispatchEvent(
      new CustomEvent('peerConectado', {
        detail: { peerId, namespace: ns },
      }),
    );

    this.emitMeshSalud();
  }

  async desconectarPeer(peerId: NodoId): Promise<void> {
    this.peers.delete(peerId);

    // Remover de todos los namespaces
    for (const [, peers] of this.namespacePeers) {
      peers.delete(peerId);
    }

    this.dispatchEvent(new CustomEvent('peerDesconectado', { detail: { peerId } }));

    this.emitMeshSalud();
  }

  private encontrarPeorPeer(): NodoId | null {
    let peorId: NodoId | null = null;
    let peorLatencia = -1;

    for (const [id, info] of this.peers) {
      if (info.estado === 'caido' || info.latenciaMs > peorLatencia) {
        peorId = id;
        peorLatencia = info.latenciaMs;
      }
    }

    return peorId;
  }

  // ─── NAMESPACE-AWARE ROUTING ─────────────────────────────────────────

  private agregarPeerANamespace(peerId: NodoId, namespace: string): void {
    let peers = this.namespacePeers.get(namespace);
    if (peers === undefined) {
      peers = new Set();
      this.namespacePeers.set(namespace, peers);
    }
    peers.add(peerId);
  }

  async unirANamespace(namespace: string, peerId?: NodoId): Promise<void> {
    const targetPeer = peerId ?? this.config.nodoId;
    this.agregarPeerANamespace(targetPeer, namespace);

    // Notificar al mesh completo del namespace change via broadcast
    // que será limitado por fan-out
  }

  async abandonarNamespace(namespace: string, peerId?: NodoId): Promise<void> {
    const targetPeer = peerId ?? this.config.nodoId;
    const peers = this.namespacePeers.get(namespace);
    if (peers !== undefined) {
      peers.delete(targetPeer);
    }
  }

  obtenerPeersEnNamespace(namespace: string): readonly NodoId[] {
    const peers = this.namespacePeers.get(namespace);
    if (peers === undefined) return [];
    return Array.from(peers).filter((p) => this.peers.has(p));
  }

  // ─── GOSSIP PROTOCOL ─────────────────────────────────────────────────

  async transmitirConGossip(namespace: string, payload: unknown, fanOut?: number): Promise<void> {
    if (!this.activo) return;

    const mensaje: GossipMessage = {
      id: generarNonce(),
      namespace,
      ttl: this.config.gossipTTL,
      payload,
      origen: this.config.nodoId,
      timestamp: Date.now(),
      ruta: [this.config.nodoId],
    };

    // Marcar como visto para no re-procesar
    this.gossipsVistos.add(mensaje.id);

    // Seleccionar peers según estrategia
    const peersEnNamespace = this.obtenerPeersEnNamespace(namespace);
    const peersObjetivo = this.seleccionarPeersParaFanOut(peersEnNamespace, fanOut ?? this.config.fanOut, []);

    // Propagar a peers seleccionados
    const promesas = peersObjetivo.map(async (peerId) => {
      try {
        const env = createEnvelope(TIPO_MENSAJE.GOVERNANCE as never, this.config.nodoId, peerId, {
          tipo: 'gossip',
          mensaje,
        });
        await this.edgeMesh.enviar(peerId, env);
        this.actualizarLatencia(peerId);
      } catch {
        // Peer puede estar caído, marcar
        this.marcarPeerCaido(peerId);
      }
    });

    await Promise.allSettled(promesas);
  }

  private seleccionarPeersParaFanOut(
    candidatos: readonly NodoId[],
    fanOut: number,
    excluir: readonly NodoId[],
  ): NodoId[] {
    const disponibles = candidatos.filter(
      (p) => p !== this.config.nodoId && !excluir.includes(p) && this.peers.get(p)?.estado === 'activo',
    );

    if (disponibles.length <= fanOut) return disponibles;

    switch (this.config.estrategia) {
      case ESTRATEGIA_FAN_OUT.ALEATORIA: {
        return this.seleccionAleatoria(disponibles, fanOut);
      }
      case ESTRATEGIA_FAN_OUT.POR_SALUD: {
        return this.seleccionPorSalud(disponibles, fanOut);
      }
      case ESTRATEGIA_FAN_OUT.POR_LATENCIA: {
        return this.seleccionPorLatencia(disponibles, fanOut);
      }
      default: {
        return this.seleccionAleatoria(disponibles, fanOut);
      }
    }
  }

  private seleccionAleatoria(peers: readonly NodoId[], count: number): NodoId[] {
    const shuffled = [...peers].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private seleccionPorSalud(peers: readonly NodoId[], count: number): NodoId[] {
    const ordenados = [...peers].sort((a, b) => {
      const pa = this.peers.get(a);
      const pb = this.peers.get(b);
      if (pa === undefined && pb === undefined) return 0;
      if (pa === undefined) return -1;
      if (pb === undefined) return 1;
      return (pa.latenciaMs ?? Infinity) - (pb.latenciaMs ?? Infinity);
    });
    return ordenados.slice(0, count);
  }

  private seleccionPorLatencia(peers: readonly NodoId[], count: number): NodoId[] {
    return this.seleccionPorSalud(peers, count);
  }

  // ─── PROCESAR GOSSIP ─────────────────────────────────────────────────

  /**
   * THE REPUTATION REPLICATION PATH.
   *
   * ─── WHY THIS HOOK EXISTS ────────────────────────────────────────────────
   *
   * Until now `KarmaManager` wrote endorsements to `karma:emit` in the LOCAL
   * OpLog and stopped there, while `procesarGossip` — the only thing in the repo
   * that could have carried them to a peer — was never invoked by anyone. Two
   * honest observers of the same endorsement therefore held different scores.
   *
   * ─── TRUST MODEL: GOSSIP IS A CARRIER, NOT AN AUTHORITY ─────────────────
   *
   * A gossip payload is attacker-controlled data. It can be replayed, forged,
   * re-signed by a colluding peer, or sent by a node that has never been
   * endorsed by anyone. So this method NEVER writes to an OpLog and NEVER
   * touches a score itself. It does exactly one thing with the payload: hand it
   * to `ConsumidorKarma.aplicarTransaccion`, which is KarmaManager's own public
   * entry point. That method is the single place where the ML-DSA-65 signature
   * is verified against the ISSUER's registered key, self-endorsement is
   * refused, the delta ceiling is enforced and replay of the same `tx.id` is
   * idempotent. Re-implementing any of that here would create a second,
   * weaker validator — which is exactly the bug this path is meant to close.
   *
   * Consequently a peer can NEVER inject karma into a node that has not signed
   * an endorsement: without a valid signature from a key the node trusts, the
   * transaction is refused and no score moves.
   *
   * Public key trust is deliberately NOT sourced from the gossip payload (that
   * would let any peer vouch for any other). The only keys ever registered from
   * here are the ones the EdgeMesh already authenticated at peer handshake,
   * read via `obtenerClavePublica`.
   *
   * ─── KNOWN LIMITATION — BEST EFFORT, NOT CONSENSUS (UNRESOLVED) ─────────
   *
   * Gossip is best-effort. TTL, the token-bucket rate limiter, offline peers and
   * fan-out selection all mean an endorsement CAN BE LOST: a physician who is
   * offline when the endorsement is gossipped never learns it was endorsed. This
   * layer therefore makes reputation a SIGNAL that propagates opportunistically,
   * NOT an authoritative ledger. Two nodes can legitimately hold different
   * scores for the same subject, and no amount of retrying inside this layer
   * fixes that — it is a convergence problem, not a transport problem.
   *
   * The fix is a real reconciliation protocol and is DELIBERATELY NOT
   * IMPLEMENTED HERE. Candidate directions, none of them chosen yet:
   *   (a) OpLog anti-entropy: periodic exchange of `karma:emit` entries keyed by
   *       `tx.id`, applied through `aplicarTransaccion` (idempotency makes
   *       replays free), so a returning node catches up.
   *   (b) Quorum/Byzantine agreement on deltas, so a score is only credited once
   *       a supermajority of peers has independently seen the endorsement.
   *   (c) Explicit conflict surfacing: expose divergence (set of `tx.id`s) so an
   *       operator can see two honest nodes disagree rather than silently trusting
   *       whichever gossip arrived first.
   * Whichever is chosen, the invariants must stay: karma never grants access, and
   * only a signed endorsement can move a score. Until then, consumers must treat
   * a karma number as an unverified hint — never as a credential.
   *
   * @returns the rejection reason, or null when the transaction was applied (or
   *          was an already-applied duplicate, which KarmaManager folds into
   *          `null` by design).
   */
  async aplicarKarmaRemoto(tx: TransaccionKarma, desde: NodoId): Promise<MotivoRechazo | 'payload_malformado' | null> {
    const consumidor = this.consumidorKarma;
    if (consumidor === undefined) {
      // No consumer wired: the mesh stays a dumb carrier. Nothing is applied, so
      // a MeshManager used for chat/sync cannot accidentally grow a karma engine.
      return null;
    }

    // Bridge peer keys the mesh already authenticated at handshake into the karma
    // engine. Never a key taken from the payload.
    if (consumidor.registrarClavePublica !== undefined) {
      const clave = this.obtenerClavePublicaDePeer(tx.emisor);
      if (clave !== undefined) {
        // Called as a method, never detached: KarmaManager's registry lives on its
        // own instance and a bare reference would lose `this` and throw.
        consumidor.registrarClavePublica(tx.emisor, clave);
      }
    }

    const motivo = await consumidor.aplicarTransaccion(tx);
    if (motivo !== null) {
      this.dispatchEvent(new CustomEvent('karmaRechazado', { detail: { txId: tx.id, motivo, desde } }));
      return motivo;
    }

    this.dispatchEvent(new CustomEvent('karmaRecibido', { detail: { tx, desde } }));
    return null;
  }

  /** Reads a peer's public key from the EdgeMesh registry (handshake-verified). */
  private obtenerClavePublicaDePeer(nodoId: NodoId): ParPublico | undefined {
    const registros = this.edgeMesh as unknown as { obtenerClavePublica?: (id: NodoId) => ParPublico | undefined };
    if (typeof registros.obtenerClavePublica !== 'function') return undefined;
    try {
      return registros.obtenerClavePublica(nodoId);
    } catch {
      return undefined;
    }
  }

  /**
   * Gossips an endorsement to the mesh. Callers hand this the transaction object
   * returned by `KarmaManager.emit`, signature included — a transaction without a
   * signature is useless to every peer, and KarmaManager already guarantees it
   * cannot be produced.
   */
  async transmitirKarma(tx: TransaccionKarma, namespace?: string): Promise<void> {
    await this.transmitirConGossip(namespace ?? this.config.namespacePorDefecto, {
      tipo: PAYLOAD_KARMA_TIPO,
      tx,
    });
  }

  /**
   * Resolves once every karma transaction currently being applied has settled.
   * Tests and gateways use it instead of sleeping; the mesh itself never awaits
   * gossip application on the hot path.
   */
  async esperarPropagacionKarma(): Promise<void> {
    while (this.karmaEnCurso.size > 0) {
      await Promise.allSettled(Array.from(this.karmaEnCurso));
    }
  }

  procesarGossip(mensaje: GossipMessage): void {
    // Verificar TTL
    if (mensaje.ttl <= 0) return;

    // Verificar duplicado
    if (this.gossipsVistos.has(mensaje.id)) return;

    // Rate Limiting
    const peerId = mensaje.ruta.length > 0 ? mensaje.ruta[mensaje.ruta.length - 1] : mensaje.origen;
    if (!this.gossipRateLimiter.consume(peerId)) {
      console.warn(`Rate limit exceeded for peer: ${peerId} in gossip receive`);
      this.dispatchEvent(
        new CustomEvent('rate_limited', {
          detail: { peerId, resource: 'gossip' },
        }),
      );
      return;
    }

    // Marcar como visto
    this.gossipsVistos.add(mensaje.id);

    // Verificar que estamos en el namespace
    const peersEnNs = this.namespacePeers.get(mensaje.namespace);
    if (peersEnNs === undefined || !peersEnNs.has(this.config.nodoId)) {
      // Si no estamos en el namespace, no propagamos
      // Pero procesamos si el payload es relevante
    }

    // Reputation replication: route the endorsement through KarmaManager. Fired
    // without awaiting so gossip forwarding stays fast; errors are contained and
    // surfaced as `karmaRechazado` by aplicarKarmaRemoto.
    this.enrutarKarmaDeGossip(mensaje);

    this.dispatchEvent(new CustomEvent('gossipRecibido', { detail: { mensaje } }));

    // Re-propagar con TTL reducido
    if (mensaje.ttl > 1) {
      const mensajeReenviado: GossipMessage = {
        ...mensaje,
        ttl: mensaje.ttl - 1,
        ruta: [...mensaje.ruta, this.config.nodoId],
      };

      const peersParaReenvio = this.seleccionarPeersParaFanOut(
        this.obtenerPeersEnNamespace(mensaje.namespace),
        this.config.fanOut,
        mensaje.ruta,
      );

      for (const peerId of peersParaReenvio) {
        if (peerId === this.config.nodoId) continue;
        void this.reenviarGossip(peerId, mensajeReenviado);
      }
    }
  }

  /**
   * Extracts an endorsement from a gossip payload and applies it through the
   * karma engine. Anything that is not recognisably an endorsement is ignored:
   * other payload kinds (maloca events, plugin discovery) are none of our
   * business and are left to the `gossipRecibido` listeners.
   */
  private enrutarKarmaDeGossip(mensaje: GossipMessage): void {
    const consumidor = this.consumidorKarma;
    if (consumidor === undefined) return;

    const payload = mensaje.payload as { tipo?: unknown; tx?: unknown } | null;
    if (payload === null || typeof payload !== 'object') return;
    if (payload.tipo !== PAYLOAD_KARMA_TIPO) return;

    const tx = normalizarTransaccionKarma(payload.tx);
    if (tx === null) {
      const tarea = (async () => {
        this.dispatchEvent(
          new CustomEvent('karmaRechazado', {
            detail: { txId: null, motivo: 'payload_malformado', desde: mensaje.origen },
          }),
        );
      })();
      this.karmaEnCurso.add(tarea);
      void tarea.finally(() => this.karmaEnCurso.delete(tarea));
      return;
    }

    const desde = mensaje.ruta.length > 0 ? mensaje.ruta[mensaje.ruta.length - 1] : mensaje.origen;
    const tarea = this.aplicarKarmaRemoto(tx, desde);
    this.karmaEnCurso.add(tarea);
    void tarea.catch(() => null).finally(() => this.karmaEnCurso.delete(tarea));
  }

  private async reenviarGossip(peerId: NodoId, mensaje: GossipMessage): Promise<void> {
    try {
      const env = createEnvelope(TIPO_MENSAJE.GOVERNANCE as never, this.config.nodoId, peerId, {
        tipo: 'gossip',
        mensaje,
      });
      await this.edgeMesh.enviar(peerId, env);
    } catch {
      // Ignorar errores individuales
    }
  }

  // ─── HEARTBEAT ───────────────────────────────────────────────────────

  private async transmitirHeartbeat(): Promise<void> {
    if (!this.activo || this.peers.size === 0) return;

    const peersActivos = this.obtenerPeersActivos();
    const fanOut = Math.min(this.config.fanOut, peersActivos.length);
    const objetivos = this.seleccionAleatoria(peersActivos, fanOut);

    const heartbeatPayload = {
      nodoId: this.config.nodoId,
      timestamp: Date.now(),
      peersConocidos: Array.from(this.peers.keys()),
      namespaces: Array.from(this.namespacePeers.keys()),
    };

    for (const peerId of objetivos) {
      try {
        const env = createEnvelope(TIPO_MENSAJE.HEARTBEAT as never, this.config.nodoId, peerId, heartbeatPayload);
        await this.edgeMesh.enviar(peerId, env);
        this.actualizarLatencia(peerId);
      } catch {
        this.marcarPeerCaido(peerId);
      }
    }
  }

  procesarHeartbeatPeer(peerId: NodoId, peersConocidos: readonly NodoId[], namespaces: readonly string[]): void {
    const existente = this.peers.get(peerId);
    if (existente !== undefined) {
      this.peers.set(peerId, {
        ...existente,
        ultimoHeartbeat: Date.now(),
        estado: 'activo',
        intentosReconexion: 0,
      });
    } else {
      // Auto-descubrimiento: conectar si hay espacio
      if (this.peers.size < this.config.maxPeers) {
        void this.conectarPeer(peerId);
      }
    }

    // Descubrir nuevos peers via heartbeat de otros
    for (const conocido of peersConocidos) {
      if (!this.peers.has(conocido) && conocido !== this.config.nodoId) {
        this.dispatchEvent(
          new CustomEvent('peerDescubierto', {
            detail: { peerId: conocido, via: peerId },
          }),
        );
      }
    }

    // Registrar namespaces
    for (const ns of namespaces) {
      this.agregarPeerANamespace(peerId, ns);
    }

    this.emitMeshSalud();
  }

  // ─── PEER DISCOVERY ──────────────────────────────────────────────────

  async descubrirSalon(salonId: string): Promise<readonly NodoId[]> {
    // Buscar peers que estén en el namespace del salón
    const peersEnSalon = this.namespacePeers.get(`salon:${salonId}`);
    if (peersEnSalon !== undefined) {
      return Array.from(peersEnSalon);
    }

    // Preguntar via gossip a peers conocidos
    const preguntaId = `discover:${salonId}:${Date.now()}`;
    await this.transmitirConGossip(this.config.namespacePorDefecto, { tipo: 'discover', salonId, preguntaId }, 3);

    // Retornar lo que tenemos (puede estar vacío si nadie responde aún)
    return [];
  }

  // ─── CONSULTAS ───────────────────────────────────────────────────────

  obtenerPeersConectados(): readonly NodoId[] {
    return Array.from(this.peers.keys());
  }

  obtenerPeersActivos(): readonly NodoId[] {
    const ahora = Date.now();
    return Array.from(this.peers.entries())
      .filter(([_, info]) => ahora - info.ultimoHeartbeat < this.config.peerTimeoutMs)
      .map(([id, _]) => id);
  }

  obtenerPeersLentos(): readonly string[] {
    return Array.from(this.peers.entries())
      .filter(([_, info]) => info.estado === 'lento')
      .map(([id, _]) => id);
  }

  obtenerPeerInfo(peerId: NodoId): PeerInfo | null {
    return this.peers.get(peerId) ?? null;
  }

  obtenerTotalPeers(): number {
    return this.peers.size;
  }

  obtenerNamespaces(): readonly string[] {
    return Array.from(this.namespacePeers.keys());
  }

  estaActivo(): boolean {
    return this.activo;
  }

  // ─── UTILIDADES INTERNAS ─────────────────────────────────────────────

  private actualizarLatencia(peerId: NodoId): void {
    const peer = this.peers.get(peerId);
    if (peer === undefined) return;

    const latencia = Date.now() - peer.ultimoHeartbeat;
    this.peers.set(peerId, {
      ...peer,
      latenciaMs: latencia,
      ultimoHeartbeat: Date.now(),
      estado: latencia > 500 ? 'lento' : 'activo',
    });
  }

  private marcarPeerCaido(peerId: NodoId): void {
    const peer = this.peers.get(peerId);
    if (peer === undefined) return;

    const nuevosIntentos = peer.intentosReconexion + 1;

    if (nuevosIntentos >= MAX_RECONEXIONES) {
      // Peer definitivamente caído
      void this.desconectarPeer(peerId);
    } else {
      this.peers.set(peerId, {
        ...peer,
        estado: 'caido',
        intentosReconexion: nuevosIntentos,
      });
    }
  }

  private limpiarPeersCaidos(): void {
    const ahora = Date.now();
    const aEliminar: NodoId[] = [];

    for (const [id, info] of this.peers) {
      if (ahora - info.ultimoHeartbeat > this.config.peerTimeoutMs && info.intentosReconexion >= MAX_RECONEXIONES) {
        aEliminar.push(id);
      }
    }

    for (const id of aEliminar) {
      void this.desconectarPeer(id);
    }
  }

  private limpiarGossipCache(): void {
    const maxCache = 10_000;
    if (this.gossipsVistos.size > maxCache) {
      // Limpiar solo un batch para no bloquear
      const entries = Array.from(this.gossipsVistos);
      const aEliminar = entries.slice(0, entries.length - maxCache);
      for (const id of aEliminar) {
        this.gossipsVistos.delete(id);
      }
    }
  }

  private emitMeshSalud(): void {
    const activos = this.obtenerPeersActivos();
    this.dispatchEvent(
      new CustomEvent('meshSaludActualizada', {
        detail: {
          peersActivos: activos.length,
          peersTotales: this.peers.size,
        },
      }),
    );
  }
}
