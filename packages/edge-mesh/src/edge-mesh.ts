import * as Y from 'yjs';
import { CAPACIDAD_ESTANDAR, createNamespaceAuthorizer, type NamespaceAuthorizer } from './authz/index.js';
import { PersistentOfflineQueue } from './chat/offline-queue.js';
import { createEdgeMeshNode, type EdgeMeshNode } from './core/node.js';
import { createGovernanceManager, type GovernanceManager } from './governance/index.js';
import {
  createPostQuantumIdentity,
  generateKeypair,
  identityFromSecret,
  type PostQuantumIdentity,
} from './identity/index.js';
import { NamespaceManager } from './namespaces/index.js';
import { OpLog } from './op-log/index.js';
import { PresenceManager } from './presence/index.js';
import {
  createEnvelope,
  MessageDeduplicator,
  signEnvelope,
  validateEnvelope,
  verifyEnvelopeSignature,
} from './protocol/index.js';
import { createSnapshotManager, type SnapshotManager } from './snapshot/index.js';
import { InMemoryStorage, StorageManager } from './storage/index.js';
import { SyncEngine } from './sync/engine.js';
import { MemoryTransport } from './transport/memory.js';
import { PeerJSTransport, type PeerJSTransportOptions } from './transport/peerjs.js';
import type { ITransport } from './transport/types.js';
import type {
  EdgeMeshConfig,
  EdgeMeshEventMap,
  Envolvente,
  NodoId,
  ParPublico,
  PayloadSnapshot,
  TipoMensaje,
} from './types/index.js';
import { TIPO_MENSAJE } from './types/index.js';

// ─── YJS ADAPTER ───────────────────────────────────────────────────────────

export class YjsAdapter {
  readonly doc: Y.Doc;
  /** When false, destroy() only detaches listeners (shared host doc). */
  readonly ownsDoc: boolean;
  private readonly listeners: Map<string, Set<(update: Uint8Array, origin: unknown) => void>>;

  constructor(existingDoc?: Y.Doc, ownsDoc = !existingDoc) {
    this.doc = existingDoc ?? new Y.Doc();
    this.ownsDoc = ownsDoc;
    this.listeners = new Map();
  }

  onUpdate(handler: (update: Uint8Array, origin: unknown) => void): () => void {
    const id = 'global';
    const handlers = this.listeners.get(id) ?? new Set();
    handlers.add(handler);
    this.listeners.set(id, handlers);

    this.doc.on('update', handler as never);

    return () => {
      this.doc.off('update', handler as never);
      handlers.delete(handler);
    };
  }

  applyUpdate(update: Uint8Array, origin: unknown = null): void {
    Y.applyUpdate(this.doc, update, origin);
  }

  getState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  getStateVector(): Uint8Array {
    return Y.encodeStateVector(this.doc);
  }

  merge(remoteState: Uint8Array): void {
    Y.applyUpdate(this.doc, remoteState);
  }

  getMap(name: string): Y.Map<unknown> {
    return this.doc.getMap(name);
  }

  getArray(name: string): Y.Array<unknown> {
    return this.doc.getArray(name);
  }

  getText(name: string): Y.Text {
    return this.doc.getText(name);
  }

  destroy(): void {
    // Detach update handlers first
    for (const handlers of this.listeners.values()) {
      for (const handler of handlers) {
        this.doc.off('update', handler as never);
      }
    }
    this.listeners.clear();
    if (this.ownsDoc) {
      this.doc.destroy();
    }
  }
}

// ─── EDGE MESH ─────────────────────────────────────────────────────────────

/**
 * Envelope types that mutate local state and therefore MUST carry a valid
 * ML-DSA-65 signature from a peer whose public key is already registered.
 *
 * The gate is allow-list on purpose: a type that is not listed here is either
 * identity-bound inside its own handler (HEARTBEAT, GOVERNANCE) or carries no
 * state at all. SNAPSHOT used to be missing from this list, which let any
 * unsigned peer overwrite a snapshot and bump its version.
 */
const TIPOS_CON_FIRMA_OBLIGATORIA: ReadonlySet<string> = new Set<string>([
  TIPO_MENSAJE.SYNC,
  TIPO_MENSAJE.AUTHZ,
  TIPO_MENSAJE.SNAPSHOT,
  TIPO_MENSAJE.NAMESPACE,
]);

/** True when the envelope claims a node identity that must equal its origin. */
function reclamaSuPropiaIdentidad(payload: unknown, env: Envolvente): boolean {
  if (!esObjeto(payload)) return true;
  for (const claim of [payload.nodoId, payload.peerId, payload.nodoOrigen]) {
    if (typeof claim === 'string' && claim !== env.origen) return false;
  }
  return true;
}

/** Every remote payload must clear this: `typeof null === 'object'`. */
function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/** A non-empty string, i.e. something safe to use as an id or storage key. */
function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0;
}

export class EdgeMesh {
  readonly config: EdgeMeshConfig;
  readonly nodo: EdgeMeshNode;
  readonly eventTarget: EventTarget;
  readonly deduplicator: MessageDeduplicator;
  readonly storage: StorageManager | InMemoryStorage;
  readonly governance: GovernanceManager;
  readonly identity: PostQuantumIdentity;
  readonly presence: PresenceManager;
  readonly authorizer: NamespaceAuthorizer;
  readonly namespaces: NamespaceManager;
  readonly yjsAdapter: YjsAdapter;
  readonly offlineQueue: PersistentOfflineQueue;

  private transport: ITransport | null = null;
  private readonly logsDoc: Map<string, OpLog>;
  private readonly syncs: Map<string, SyncEngine>;
  private readonly snapshots: Map<string, SnapshotManager>;
  /** Registered peer public keys for envelope verification. */
  private readonly peerPublicKeys: Map<NodoId, ParPublico>;
  private readonly requireAuthz: boolean;
  private readonly requireSignedEnvelopes: boolean;
  private readonly defaultSyncNamespace: string;
  private unsubYjs: (() => void) | null = null;
  private transportMessageHandler: ((ev: CustomEvent<{ envolvente: Envolvente }>) => void) | null = null;
  private iniciado = false;
  /** True when this mesh created the Y.Doc (false when host injects yDoc). */
  readonly sharesExternalDoc: boolean;
  private readonly relayLocalYjs: boolean;

  constructor(config: EdgeMeshConfig) {
    this.config = config;
    this.logsDoc = new Map();
    this.syncs = new Map();
    this.snapshots = new Map();
    this.peerPublicKeys = new Map();
    this.requireAuthz = config.requireAuthz !== false;
    // SHELF-111: signed envelope enforcement is no longer optional (default true).
    this.requireSignedEnvelopes = config.requireSignedEnvelopes !== false;
    this.defaultSyncNamespace = config.defaultSyncNamespace ?? 'global';
    this.sharesExternalDoc = config.yDoc !== undefined;
    // Host-owned doc (dbSync) already broadcasts via p2pManager YJS_UPDATE — avoid double relay.
    this.relayLocalYjs = config.relayLocalYjs ?? config.yDoc === undefined;

    // Core — mesh uses its own EventTarget so emit("error") does not re-enter nodo handlers
    this.nodo = createEdgeMeshNode(config.nodoId);
    this.eventTarget = new EventTarget();
    this.deduplicator = new MessageDeduplicator();

    // Storage
    this.storage =
      config.storageBackend === 'mem'
        ? new InMemoryStorage()
        : new StorageManager({
            dbName: `edge-mesh-${config.nodoId}`,
          });

    // Identity — never pair a custom private key with an empty public key
    if (config.identitySecret && config.identitySecret.length > 0) {
      this.identity = identityFromSecret(config.nodoId, config.identitySecret, 'maestra');
    } else {
      this.identity = createPostQuantumIdentity(config.nodoId, generateKeypair('maestra'));
    }
    this.registrarClavePublica(config.nodoId, this.identity.exportarPublico());

    // Yjs — Phase B: optional shared host document (e.g. dbSync.doc)
    const externalDoc = config.yDoc as Y.Doc | undefined;
    this.yjsAdapter = new YjsAdapter(externalDoc, !externalDoc);

    // Governance
    this.governance = createGovernanceManager(config.governancePolicy);

    // Presence
    this.presence = new PresenceManager({
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 5_000,
      timeoutMs: config.heartbeatTimeoutMs ?? 15_000,
    });
    this.presence.registrarClavePublica(config.nodoId, this.identity.exportarPublico());

    // Authz
    this.authorizer = createNamespaceAuthorizer();

    // Namespaces
    this.namespaces = new NamespaceManager();

    // Offline Queue
    this.offlineQueue = new PersistentOfflineQueue(this.storage);
    this.presence.addOnlineListener((peerId) => {
      void this.offlineQueue.handlePeerReconnect(peerId);
    });

    // Re-encolar eventos del nodo (forward to mesh EventTarget without looping)
    this.nodo.on('nodoConectado', (ev) => {
      this.onNodoConectado(ev.detail.nodoId);
      this.emit('nodoConectado', ev.detail);
    });
    this.nodo.on('nodoDesconectado', (ev) => {
      this.onNodoDesconectado(ev.detail.nodoId);
      this.emit('nodoDesconectado', ev.detail);
    });
    this.nodo.on('estadoCambiado', (ev) => {
      this.emit('estadoCambiado', ev.detail);
    });
    // Note: do NOT re-emit nodo "error" onto the same shared target pattern —
    // mesh-level errors use this.emit("error") on a dedicated EventTarget.
  }

  // ─── PUBLIC KEY REGISTRY ─────────────────────────────────────────────

  registrarClavePublica(nodoId: NodoId, parPublico: ParPublico): void {
    this.peerPublicKeys.set(nodoId, new Uint8Array(parPublico));
    if (this.presence) {
      this.presence.registrarClavePublica(nodoId, new Uint8Array(parPublico));
    }
  }

  obtenerClavePublica(nodoId: NodoId): ParPublico | undefined {
    return this.peerPublicKeys.get(nodoId);
  }

  // ─── INICIALIZACION ──────────────────────────────────────────────────

  /**
   * Attach an external transport (MemoryTransport, adapter over host PeerJS, etc.).
   * Prefer this over `peerId` when the host app already owns a Peer connection.
   * Safe to call after `iniciar()` (Phase C late-bind).
   */
  usarTransport(transport: ITransport): void {
    if (this.transport && this.transportMessageHandler) {
      this.transport.off('mensaje', this.transportMessageHandler as never);
    }

    this.transport = transport;
    this.transportMessageHandler = (ev) => {
      void this.procesarMensaje(ev.detail.envolvente);
    };
    this.transport.on('mensaje', this.transportMessageHandler as never);

    // Late-bind Yjs relay if mesh already started
    if (this.iniciado) {
      this.ensureYjsRelay();
    }
  }

  /** Detach transport without destroying host PeerJS (adapter.cerrar only unsubscribes). */
  detachTransport(): void {
    if (this.transport && this.transportMessageHandler) {
      this.transport.off('mensaje', this.transportMessageHandler as never);
    }
    this.transportMessageHandler = null;
    this.transport = null;
    if (this.unsubYjs) {
      this.unsubYjs();
      this.unsubYjs = null;
    }
  }

  private ensureYjsRelay(): void {
    if (this.unsubYjs || this.transport === null || !this.relayLocalYjs) return;

    this.unsubYjs = this.yjsAdapter.onUpdate((update, origin) => {
      if (origin === 'remote' || origin === this.config.nodoId) return;
      // Local writes: string "local" or object { origin: "local", branchId }
      const isLocalObject =
        typeof origin === 'object' && origin !== null && (origin as { origin?: string }).origin === 'local';
      if (origin !== 'local' && !isLocalObject && origin !== null) return;
      void this.broadcastYjsUpdate(update);
    });
  }

  async iniciar(): Promise<void> {
    // Optional built-in PeerJS — skip when host provides transport or omits peerId
    if (this.transport === null && this.config.peerId !== undefined) {
      const opts: PeerJSTransportOptions = {
        peerId: this.config.peerId,
        ...(this.config.transportConfig as Partial<PeerJSTransportOptions>),
      };

      const peerTransport = new PeerJSTransport(this.config.nodoId, opts);
      this.usarTransport(peerTransport);
    }

    // Connect memory transport if already attached
    if (this.transport instanceof MemoryTransport) {
      await this.transport.conectar();
    }

    this.ensureYjsRelay();

    // Iniciar presencia
    await this.presence.iniciar(
      this.config.nodoId,
      async (payload) => {
        await this.transmitir(payload, TIPO_MENSAJE.HEARTBEAT);
      },
      this.identity,
    );

    // Conectar nodo
    await this.nodo.conectar();
    this.iniciado = true;
  }

  async detener(): Promise<void> {
    this.iniciado = false;
    this.presence.detener();
    if (this.unsubYjs) {
      this.unsubYjs();
      this.unsubYjs = null;
    }

    if (this.transport !== null) {
      if (this.transportMessageHandler) {
        this.transport.off('mensaje', this.transportMessageHandler as never);
        this.transportMessageHandler = null;
      }
      await this.transport.cerrar();
      this.transport = null;
    }

    await this.nodo.desconectar();
    // Shared host docs are only detached (listeners cleared), never destroyed.
    this.yjsAdapter.destroy();
    this.governance.destruir();
  }

  /** Current attached transport (if any). */
  obtenerTransport(): ITransport | null {
    return this.transport;
  }

  /** Whether yjsAdapter.doc is an externally owned document. */
  isSharedYDoc(): boolean {
    return this.sharesExternalDoc;
  }

  // ─── TRANSPORTE ──────────────────────────────────────────────────────

  async enviar(destino: NodoId, payload: unknown, tipoMensaje: TipoMensaje = TIPO_MENSAJE.SYNC): Promise<void> {
    if (this.transport !== null) {
      await this.transport.enviar(destino, payload, tipoMensaje);
    }
    await this.nodo.enviar(destino, payload);
  }

  async transmitir(payload: unknown, tipoMensaje: TipoMensaje = TIPO_MENSAJE.SYNC): Promise<void> {
    if (this.transport !== null) {
      await this.transport.transmitir(payload, tipoMensaje);
    }
    await this.nodo.transmitir(payload);
  }

  /**
   * Publish a CRDT update to peers (optionally signed).
   */
  async broadcastYjsUpdate(update: Uint8Array, docId = 'default'): Promise<void> {
    const payload = {
      docId,
      // JSON-safe encoding for transports that serialize to JSON
      datos: Array.from(update),
      clock: Date.now(),
    };

    let env = createEnvelope(TIPO_MENSAJE.SYNC, this.config.nodoId, '*', payload);

    if (this.requireSignedEnvelopes) {
      env = await signEnvelope(env, this.identity);
    }

    if (this.transport !== null) {
      await this.transport.transmitir(env, TIPO_MENSAJE.SYNC);
    }
  }

  // ─── PROCESAMIENTO DE MENSAJES ───────────────────────────────────────

  /** Exposed for tests / external transports feeding envelopes. */
  async recibirEnvelope(env: unknown): Promise<void> {
    await this.procesarMensaje(env);
  }

  private async procesarMensaje(env: unknown): Promise<void> {
    // validateEnvelope dereferences fields without a null/undefined guard, so the
    // transport (which types its payload as `unknown`) can crash the receive path
    // with a bare `undefined`. Guard here rather than in protocol/index.ts.
    if (typeof env !== 'object' || env === null) return;
    if (!validateEnvelope(env as never)) return;
    const envolvente = env as Envolvente;

    // An envelope that claims to be FROM us is a self-replay, never a peer message.
    if (envolvente.origen === this.config.nodoId) return;

    if (this.deduplicator.esDuplicado(envolvente)) return;

    // Signature gate: every state-mutating type needs a valid signature from a
    // peer whose public key is registered here. An unregistered origin has no
    // key to verify against, so it is rejected as an unknown peer.
    if (this.requireSignedEnvelopes) {
      if (TIPOS_CON_FIRMA_OBLIGATORIA.has(envolvente.tipo)) {
        const ok = await this.verificarFirmaEnvelope(envolvente);
        if (!ok) {
          this.emit('error', {
            mensaje: `Firma invalida o ausente de ${envolvente.origen} (${envolvente.tipo})`,
          });
          return;
        }
      }

      // Identity binding: a peer may not speak on behalf of a third node.
      // HEARTBEAT/GOVERNANCE are not in the signed list, so this is the only
      // thing stopping an attacker from forging presence or votes as another node.
      if (!reclamaSuPropiaIdentidad(envolvente.payload, envolvente)) {
        this.emit('error', {
          mensaje: `Identidad ajena en envelope de ${envolvente.origen} (${envolvente.tipo})`,
        });
        return;
      }
    }

    this.emit('mensajeRecibido', { envolvente });

    switch (envolvente.tipo) {
      case TIPO_MENSAJE.HEARTBEAT:
        await this.presence.procesarHeartbeat(envolvente.payload);
        break;

      case TIPO_MENSAJE.SYNC:
        await this.procesarSync(envolvente);
        break;

      case TIPO_MENSAJE.SNAPSHOT:
        await this.procesarSnapshot(envolvente);
        break;

      case TIPO_MENSAJE.GOVERNANCE:
        await this.procesarGovernance(envolvente);
        break;

      case TIPO_MENSAJE.AUTHZ:
        await this.procesarAuthz(envolvente);
        break;

      case TIPO_MENSAJE.NAMESPACE:
        await this.procesarNamespace(envolvente);
        break;

      default:
        break;
    }
  }

  private async verificarFirmaEnvelope(env: Envolvente): Promise<boolean> {
    const pub = this.peerPublicKeys.get(env.origen);
    if (!pub) return false;
    return verifyEnvelopeSignature(env, pub, this.identity);
  }

  private decodeSyncBytes(datos: unknown): Uint8Array | null {
    if (datos instanceof Uint8Array) return datos;
    if (Array.isArray(datos)) return new Uint8Array(datos);
    if (typeof datos === 'object' && datos !== null && 'data' in datos) {
      const arr = (datos as { data: number[] }).data;
      if (Array.isArray(arr)) return new Uint8Array(arr);
    }
    return null;
  }

  private async procesarSync(env: Envolvente): Promise<void> {
    if (!esObjeto(env.payload)) return;
    const payload = env.payload as { datos?: unknown; clock?: number; namespace?: string };

    const docId = env.payload.docId;
    if (!esTexto(docId)) return;

    const namespace = payload.namespace ?? this.defaultSyncNamespace;

    if (this.requireAuthz) {
      const allowed =
        this.authorizer.verificarCapacidad(namespace, env.origen, CAPACIDAD_ESTANDAR.ESCRIBIR) ||
        this.authorizer.verificarCapacidad(namespace, env.origen, CAPACIDAD_ESTANDAR.SINC) ||
        this.authorizer.verificarCapacidad(namespace, env.origen, CAPACIDAD_ESTANDAR.ADMIN);

      if (!allowed) {
        this.emit('error', {
          mensaje: `SYNC denegado: ${env.origen} sin write/sync en ${namespace}`,
        });
        return;
      }
    }

    const bytes = this.decodeSyncBytes(payload.datos);
    if (!bytes || bytes.length === 0) return;

    try {
      this.yjsAdapter.applyUpdate(bytes, env.origen);
    } catch (err) {
      this.emit('error', {
        mensaje: `Error al aplicar SYNC de ${env.origen}: ${err instanceof Error ? err.message : String(err)}`,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return;
    }

    this.emit('syncCompletado', {
      docId,
      clock: payload.clock ?? 0,
    });
  }

  private async procesarSnapshot(env: Envolvente): Promise<void> {
    // A snapshot REPLACES the whole document. A malformed one must not reach
    // SnapshotManager: `datos` is persisted verbatim, and a missing docId would
    // be used as a storage key.
    if (!esObjeto(env.payload)) return;
    const { docId, version, datos, nodosConfirmados } = env.payload as Partial<PayloadSnapshot>;
    if (!esTexto(docId)) return;
    if (typeof version !== 'number' || !Number.isFinite(version)) return;
    if (!Array.isArray(nodosConfirmados)) return;

    const bytes = this.decodeSyncBytes(datos);
    if (!bytes || bytes.length === 0) return;

    const snapManager = this.snapshots.get(docId);
    if (snapManager !== undefined) {
      await snapManager.recibirSnapshot({
        docId,
        version,
        datos: bytes,
        nodosConfirmados: nodosConfirmados.filter(esTexto) as NodoId[],
      });
    }
  }

  private async procesarGovernance(env: Envolvente): Promise<void> {
    if (!esObjeto(env.payload)) return;
    const { accion, propuesta, voto } = env.payload as { accion?: unknown; propuesta?: unknown; voto?: unknown };
    if (accion !== 'votar' || voto === undefined) return;
    if (!esObjeto(voto) || voto.nodoId !== env.origen) {
      this.emit('error', {
        mensaje: `Voto con identidad ajena: envelope de ${env.origen} vota como ${String(
          esObjeto(voto) ? voto.nodoId : voto,
        )}`,
      });
      return;
    }
    if (!esTexto(voto.voto) || typeof voto.peso !== 'number' || !Number.isFinite(voto.peso)) return;

    this.governance.votar(esTexto(propuesta) ? propuesta : '', voto as never);
  }

  private async procesarAuthz(env: Envolvente): Promise<void> {
    if (!esObjeto(env.payload)) return;
    const { accion, espacio, sujeto, capacidad } = env.payload as Partial<Record<string, unknown>>;
    if (!esTexto(espacio) || !esTexto(capacidad) || !esTexto(sujeto)) return;

    // Never accept unauthenticated remote capability grants.
    if (this.requireAuthz) {
      const isAdmin = this.authorizer.verificarCapacidad(espacio, env.origen, CAPACIDAD_ESTANDAR.ADMIN);
      const signedOk = !this.requireSignedEnvelopes || (await this.verificarFirmaEnvelope(env));

      if (!isAdmin || !signedOk) {
        this.emit('error', {
          mensaje: `AUTHZ denegado: ${env.origen} no es admin de ${espacio}`,
        });
        return;
      }
    }

    if (accion === 'conceder') {
      this.authorizer.concederCapacidad(espacio, sujeto as NodoId, capacidad);
    }
  }

  private async procesarNamespace(env: Envolvente): Promise<void> {
    if (!esObjeto(env.payload)) return;
    const {
      accion,
      espacio: nombre,
      nodoId,
    } = env.payload as {
      accion?: unknown;
      espacio?: unknown;
      nodoId?: unknown;
    };
    if (accion !== 'unir' || !esTexto(nombre) || !esTexto(nodoId)) return;

    // Joining on behalf of another node is membership forgery: an attacker
    // would place a victim inside a space it never asked to enter.
    if (nodoId !== env.origen) {
      this.emit('error', {
        mensaje: `NAMESPACE denegado: ${env.origen} intenta unir a ${nodoId}`,
      });
      return;
    }

    const espacio = this.namespaces.obtenerEspacioPorNombre(nombre);
    if (espacio !== null) {
      this.namespaces.unirNodo(espacio.id, nodoId as NodoId);
    }
  }

  // ─── EVENTOS DE NODO ────────────────────────────────────────────────

  private onNodoConectado(nodoId: NodoId): void {
    this.namespaces.unirNodo(this.namespaces.obtenerEspacioPorNombre('global')?.id ?? '', nodoId);
  }

  private onNodoDesconectado(nodoId: NodoId): void {
    const espacios = this.namespaces.obtenerEspaciosDeNodo(nodoId);
    for (const espacio of espacios) {
      this.namespaces.abandonarNodo(espacio.id, nodoId);
    }
  }

  // ─── OP LOG ──────────────────────────────────────────────────────────

  obtenerOLog(docId: string): OpLog {
    const existente = this.logsDoc.get(docId);
    if (existente !== undefined) return existente;

    const opLog = new OpLog({
      docId,
      storage: this.storage,
    });

    this.logsDoc.set(docId, opLog);
    return opLog;
  }

  // ─── SYNC ────────────────────────────────────────────────────────────

  obtenerSyncEngine(docId: string): SyncEngine {
    const existente = this.syncs.get(docId);
    if (existente !== undefined) return existente;

    const opLog = this.obtenerOLog(docId);
    const sync = new SyncEngine({
      docId,
      opLog,
      requireSignedEnvelopes: this.requireSignedEnvelopes,
    });

    this.syncs.set(docId, sync);
    return sync;
  }

  // ─── SNAPSHOT ────────────────────────────────────────────────────────

  obtenerSnapshotManager(docId: string): SnapshotManager {
    const existente = this.snapshots.get(docId);
    if (existente !== undefined) return existente;

    const snap = createSnapshotManager({
      docId,
      storage: this.storage,
      interval: this.config.snapshotInterval,
    });

    this.snapshots.set(docId, snap);
    return snap;
  }

  // ─── EVENTOS ─────────────────────────────────────────────────────────

  on<K extends keyof EdgeMeshEventMap>(tipo: K, handler: (ev: EdgeMeshEventMap[K]) => void): void {
    this.eventTarget.addEventListener(tipo as string, handler as EventListener);
  }

  off<K extends keyof EdgeMeshEventMap>(tipo: K, handler: (ev: EdgeMeshEventMap[K]) => void): void {
    this.eventTarget.removeEventListener(tipo as string, handler as EventListener);
  }

  private emit<K extends keyof EdgeMeshEventMap>(tipo: K, detalle: EdgeMeshEventMap[K]['detail']): void {
    const evento = new CustomEvent(tipo as string, { detail: detalle });
    this.eventTarget.dispatchEvent(evento);
  }
}
