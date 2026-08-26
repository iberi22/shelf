/**
 * GpuMeshMarketplaceFull — complete GPU mesh marketplace (SHELF-112 completion).
 *
 * Builds on the SHELF-112 skeleton (`GpuAgent` + `GpuMeshMarketplace`) and adds
 * the full compute-marketplace lifecycle:
 *
 *  - PeerDiscovery     — live registry of mesh peers with their GPU capacity
 *                        announcements, join/leave tracking, latency samples and
 *                        stale-peer sweeping.
 *  - TaskRouter        — capability + latency + load aware selection of the best
 *                        worker peer (single target or fan-out list).
 *  - ResultAggregator  — merges partial results from fan-out executions
 *                        ('sum' | 'concat' | 'collect' | 'first' | custom reducer).
 *  - TaskProgress      — per-task lifecycle callbacks
 *                        (queued → dispatched → partial → completed/failed/timed-out/rebalanced).
 *  - Timeout handling  — unresponsive peers are marked and skipped; 30s default,
 *                        with fail-over to the next best peer up to maxAttempts.
 *  - Rebalancing       — in-flight tasks are re-routed when the assigned peer
 *                        leaves or times out; queued tasks are dispatched when a
 *                        capable peer joins.
 */

import type { EdgeMesh, Envolvente, NodoId } from 'edge-mesh';
import { TIPO_MENSAJE } from 'edge-mesh';
import type {
  CapacityAnnouncement,
  GpuAgent,
  Task,
  TaskRequestEnvelope,
  TaskResult,
  TaskResultEnvelope,
} from './gpu-agent.js';

/** Default per-peer execution timeout (unresponsive peers). */
export const DEFAULT_PEER_TIMEOUT_MS = 30_000;
/** Default max dispatch attempts (initial + fail-overs) per task. */
export const DEFAULT_MAX_ATTEMPTS = 3;

// ─── PEER DISCOVERY ────────────────────────────────────────────────────────

export type MeshPeerStatus = 'online' | 'unresponsive' | 'offline';

export interface MeshPeerInfo {
  readonly nodoId: NodoId;
  status: MeshPeerStatus;
  capacity: CapacityAnnouncement | null;
  lastSeenMs: number;
  joinedAtMs: number;
  /** Smoothed request→result round-trip time observed for this peer. */
  latencyMs: number;
  /** Consecutive timeouts while this peer was targeted by a task. */
  consecutiveTimeouts: number;
  /** Tasks currently dispatched to this peer. */
  activeTasks: number;
}

export interface PeerChangeEvent {
  readonly nodoId: NodoId;
  readonly status: MeshPeerStatus;
  readonly capacity: CapacityAnnouncement | null;
  /** True when the peer's capacity registry entry was created by this event. */
  readonly joined: boolean;
}

export interface PeerDiscoveryOptions {
  /** Peers silent for longer than this are marked offline by `barrido()`. */
  readonly staleAfterMs?: number;
  /** EMA alpha for latency samples (0..1, default 0.3). */
  readonly latencyAlpha?: number;
}

/**
 * Registry of mesh peers and their GPU capacity announcements.
 * Peers are discovered from `GPU_CAPACITY` broadcasts, transport-level
 * connect/disconnect events and any observed traffic.
 */
export class PeerDiscovery {
  private readonly peers = new Map<NodoId, MeshPeerInfo>();
  private readonly changeListeners = new Set<(ev: PeerChangeEvent) => void>();
  private readonly unsubscribers: Array<() => void> = [];
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly mesh: EdgeMesh,
    private readonly options: PeerDiscoveryOptions = {},
  ) {
    const onMensaje = (ev: CustomEvent<{ envolvente: Envolvente }>) => this.procesarEnvolvente(ev.detail.envolvente);
    const onConectado = (ev: CustomEvent<{ nodoId: NodoId }>) => this.marcarConectado(ev.detail.nodoId);
    const onDesconectado = (ev: CustomEvent<{ nodoId: NodoId }>) => this.marcarDesconectado(ev.detail.nodoId);

    this.mesh.on('mensajeRecibido', onMensaje);
    this.mesh.on('nodoConectado', onConectado);
    this.mesh.on('nodoDesconectado', onDesconectado);
    this.unsubscribers.push(
      () => this.mesh.off('mensajeRecibido', onMensaje),
      () => this.mesh.off('nodoConectado', onConectado),
      () => this.mesh.off('nodoDesconectado', onDesconectado),
    );

    // EdgeMesh's own nodoConectado event only fires for the local node, so
    // remote join/leave must be observed at the transport level.
    const transport = mesh.obtenerTransport();
    if (transport) {
      transport.on('conectado', onConectado);
      transport.on('desconectado', onDesconectado);
      this.unsubscribers.push(
        () => transport.off('conectado', onConectado),
        () => transport.off('desconectado', onDesconectado),
      );
      for (const id of transport.obtenerConexiones()) {
        this.upsert(id as NodoId);
      }
    }
  }

  /** Register (or refresh) a peer capacity announcement. */
  upsertCapacity(nodoId: NodoId, capacity: CapacityAnnouncement): MeshPeerInfo {
    const peer = this.upsert(nodoId);
    const joined = peer.capacity === null;
    peer.capacity = capacity;
    peer.lastSeenMs = Date.now();
    peer.consecutiveTimeouts = 0;
    if (joined) this.notify(peer, true);
    return peer;
  }

  marcarConectado(nodoId: NodoId): MeshPeerInfo | undefined {
    if (nodoId === this.mesh.config.nodoId) return undefined;
    const peer = this.upsert(nodoId);
    const recovered = peer.status === 'offline';
    peer.status = 'online';
    peer.lastSeenMs = Date.now();
    if (recovered) this.notify(peer, false);
    return peer;
  }

  marcarDesconectado(nodoId: NodoId): MeshPeerInfo | undefined {
    if (nodoId === this.mesh.config.nodoId) return undefined;
    const peer = this.peers.get(nodoId);
    if (!peer) return undefined;
    const wasOnline = peer.status === 'online';
    peer.status = 'offline';
    if (wasOnline) this.notify(peer, false);
    return peer;
  }

  /** Mark a peer as unresponsive after a task timeout. */
  marcarNoResponsivo(nodoId: NodoId): void {
    const peer = this.peers.get(nodoId);
    if (!peer) return;
    peer.status = 'unresponsive';
    peer.consecutiveTimeouts += 1;
    this.notify(peer, false);
  }

  /** Refresh liveness (any observed traffic from the peer). */
  touch(nodoId: NodoId): void {
    const peer = this.peers.get(nodoId);
    if (peer) peer.lastSeenMs = Date.now();
  }

  /** Record a request→result round-trip sample (EMA smoothed). */
  recordLatency(nodoId: NodoId, latencyMs: number): void {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
    const peer = this.upsert(nodoId);
    const alpha = this.options.latencyAlpha ?? 0.3;
    if (peer.latencyMs === Infinity) {
      peer.latencyMs = latencyMs;
    } else {
      peer.latencyMs = alpha * latencyMs + (1 - alpha) * peer.latencyMs;
    }
  }

  recordActiveTask(nodoId: NodoId, delta: number): void {
    const peer = this.peers.get(nodoId);
    if (!peer) return;
    peer.activeTasks = Math.max(0, peer.activeTasks + delta);
  }

  getPeer(nodoId: NodoId): MeshPeerInfo | undefined {
    return this.peers.get(nodoId);
  }

  getPeers(): readonly MeshPeerInfo[] {
    return Array.from(this.peers.values());
  }

  getOnlinePeers(): readonly MeshPeerInfo[] {
    return this.getPeers().filter((peer) => peer.status === 'online');
  }

  getPeersWithCapability(tipo: string): readonly MeshPeerInfo[] {
    return this.getOnlinePeers().filter(
      (peer) =>
        peer.capacity !== null &&
        (peer.capacity.capabilities.includes(tipo) || peer.capacity.capabilities.includes('*')),
    );
  }

  onPeerChange(listener: (ev: PeerChangeEvent) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Mark peers silent for longer than staleAfterMs as offline. Returns changes. */
  barrido(): number {
    const staleAfterMs = this.options.staleAfterMs ?? 90_000;
    const now = Date.now();
    let changed = 0;
    for (const peer of this.peers.values()) {
      if (peer.status === 'online' && now - peer.lastSeenMs > staleAfterMs) {
        peer.status = 'offline';
        changed += 1;
        this.notify(peer, false);
      }
    }
    return changed;
  }

  iniciarBarrido(intervalMs = 30_000): void {
    this.detenerBarrido();
    this.sweepTimer = setInterval(() => this.barrido(), intervalMs);
  }

  detenerBarrido(): void {
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  detener(): void {
    this.detenerBarrido();
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    this.changeListeners.clear();
    this.peers.clear();
  }

  private upsert(nodoId: NodoId): MeshPeerInfo {
    const existing = this.peers.get(nodoId);
    if (existing) {
      existing.status = 'online';
      existing.lastSeenMs = Date.now();
      return existing;
    }
    const info: MeshPeerInfo = {
      nodoId,
      status: 'online',
      capacity: null,
      lastSeenMs: Date.now(),
      joinedAtMs: Date.now(),
      latencyMs: Infinity,
      consecutiveTimeouts: 0,
      activeTasks: 0,
    };
    this.peers.set(nodoId, info);
    return info;
  }

  private procesarEnvolvente(env: Envolvente): void {
    if (env.origen === this.mesh.config.nodoId) return;
    if (env.destino !== '*' && env.destino !== this.mesh.config.nodoId) return;
    switch (env.tipo) {
      case TIPO_MENSAJE.GPU_CAPACITY:
        this.upsertCapacity(env.origen, env.payload as CapacityAnnouncement);
        break;
      case TIPO_MENSAJE.GPU_TASK_RESULT:
        this.touch(env.origen);
        break;
      default:
        break;
    }
  }

  private notify(peer: MeshPeerInfo, joined: boolean): void {
    const ev: PeerChangeEvent = {
      nodoId: peer.nodoId,
      status: peer.status,
      capacity: peer.capacity,
      joined,
    };
    for (const listener of this.changeListeners) listener(ev);
  }
}

// ─── TASK ROUTER ───────────────────────────────────────────────────────────

export interface RouteSelection {
  readonly nodoId: NodoId;
  readonly score: number;
  readonly latencyMs: number;
  readonly capacity: CapacityAnnouncement;
}

export interface TaskRouterOptions {
  /** Weight of the latency component of the score (default 1). */
  readonly latencyWeight?: number;
  /** Weight of the load component of the score (default 1). */
  readonly loadWeight?: number;
}

/**
 * Capability + latency + load aware selection of the best worker peer.
 * A peer is eligible when it is online, advertised the task type and still has
 * free concurrency slots; losers are ranked by latency and load.
 */
export class TaskRouter {
  constructor(
    private readonly discovery: PeerDiscovery,
    private readonly options: TaskRouterOptions = {},
  ) {}

  /** Score a peer for a task type; -Infinity when ineligible. */
  scorePeer(peer: MeshPeerInfo, taskType: string): number {
    const capacity = peer.capacity;
    if (peer.status !== 'online' || capacity === null) return -Infinity;
    if (!capacity.capabilities.includes(taskType) && !capacity.capabilities.includes('*')) return -Infinity;
    const freeSlots = capacity.maxConcurrentTasks - peer.activeTasks;
    if (freeSlots <= 0) return -Infinity;
    const latencyWeight = this.options.latencyWeight ?? 1;
    const loadWeight = this.options.loadWeight ?? 1;
    const latencyScore = peer.latencyMs === Infinity ? 0 : Math.max(0, 100 - peer.latencyMs);
    const loadScore = Math.max(0, 100 - (peer.activeTasks / capacity.maxConcurrentTasks) * 100);
    return latencyScore * latencyWeight + loadScore * loadWeight;
  }

  /** Best peer for a task type, or null when no online peer can serve it. */
  selectBest(taskType: string): RouteSelection | null {
    return this.selectTop(taskType, 1)[0] ?? null;
  }

  /** Top N peers for fan-out, best first. */
  selectTop(taskType: string, count: number): RouteSelection[] {
    const candidates = this.discovery.getPeersWithCapability(taskType);
    const scored = candidates
      .map((peer) => ({ peer, score: this.scorePeer(peer, taskType) }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (a.peer.latencyMs === Infinity ? 1 : 0) - (b.peer.latencyMs === Infinity ? 1 : 0) ||
          a.peer.joinedAtMs - b.peer.joinedAtMs,
      );
    return scored.slice(0, Math.max(0, count)).map(({ peer, score }) => ({
      nodoId: peer.nodoId,
      score,
      latencyMs: peer.latencyMs,
      capacity: peer.capacity as CapacityAnnouncement,
    }));
  }

  reserve(nodoId: NodoId): void {
    this.discovery.recordActiveTask(nodoId, 1);
  }

  release(nodoId: NodoId): void {
    this.discovery.recordActiveTask(nodoId, -1);
  }
}

// ─── RESULT AGGREGATOR ─────────────────────────────────────────────────────

export type AggregationStrategy = 'first' | 'sum' | 'concat' | 'collect';

export type FanOutReducer = (partials: readonly TaskResult[], taskType: string) => unknown;

export interface AggregateOptions {
  /** How partial results are merged (default 'collect'). */
  readonly strategy?: AggregationStrategy;
  /** Custom reducer replaces the built-in strategies. */
  readonly reducer?: FanOutReducer;
}

/**
 * Merges partial results produced by multiple peers into a single TaskResult.
 * Failed partials are skipped; when all partials fail the aggregated result
 * carries an error.
 */
export class ResultAggregator {
  aggregate(partials: readonly TaskResult[], taskType: string, options: AggregateOptions = {}): TaskResult {
    const successful = partials.filter((result) => result.error === undefined);
    const strategy: AggregationStrategy | 'reducer' =
      options.reducer !== undefined ? 'reducer' : (options.strategy ?? 'collect');
    const first = successful[0] ?? partials[0];
    let output: unknown;
    let error: string | undefined;

    if (strategy === 'reducer' && options.reducer !== undefined) {
      output = options.reducer(partials, taskType);
    } else if (successful.length === 0) {
      error = partials.length === 0 ? 'No partial results received' : (first?.error ?? 'All partial results failed');
    } else {
      switch (strategy) {
        case 'first':
          output = successful[0].output;
          break;
        case 'sum': {
          const values = successful.map((result) => numericValue(result.output)).filter((v): v is number => v !== null);
          if (values.length === 0) {
            error = `No numeric partial results for '${taskType}'`;
          } else {
            output = values.reduce((acc, value) => acc + value, 0);
          }
          break;
        }
        case 'concat':
          output = successful.flatMap((result) => arrayValue(result.output));
          break;
        default:
          output = successful.map((result) => result.output);
          break;
      }
    }

    return {
      taskId: first?.taskId ?? '',
      type: taskType,
      backend: first?.backend ?? 'cpu',
      output,
      error,
      durationMs: first?.durationMs ?? 0,
    };
  }
}

function numericValue(output: unknown): number | null {
  if (typeof output === 'number' && Number.isFinite(output)) return output;
  if (output !== null && typeof output === 'object' && !Array.isArray(output)) {
    const numeric = Object.values(output).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (numeric.length === 1) return numeric[0];
  }
  return null;
}

function arrayValue(output: unknown): unknown[] {
  if (Array.isArray(output)) return output;
  if (output !== null && typeof output === 'object') {
    const record = output as { values?: unknown[] };
    if (Array.isArray(record.values)) return record.values;
  }
  return [output];
}

// ─── TASK PROGRESS ─────────────────────────────────────────────────────────

export type TaskState = 'queued' | 'dispatched' | 'partial' | 'completed' | 'failed' | 'timed-out' | 'rebalanced';

export interface TaskProgressEvent {
  readonly taskId: string;
  readonly state: TaskState;
  readonly peerId?: NodoId;
  readonly receivedCount: number;
  readonly totalCount: number;
  readonly results: readonly TaskResult[];
  readonly error?: string;
}

/** Per-task lifecycle event emitter with task-scoped and global listeners. */
export class TaskProgress {
  private readonly listenersByTask = new Map<string, Set<(ev: TaskProgressEvent) => void>>();
  private readonly anyListeners = new Set<(ev: TaskProgressEvent) => void>();

  on(taskId: string, listener: (ev: TaskProgressEvent) => void): () => void {
    const set = this.listenersByTask.get(taskId) ?? new Set<(ev: TaskProgressEvent) => void>();
    set.add(listener);
    this.listenersByTask.set(taskId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listenersByTask.delete(taskId);
    };
  }

  onAny(listener: (ev: TaskProgressEvent) => void): () => void {
    this.anyListeners.add(listener);
    return () => this.anyListeners.delete(listener);
  }

  emit(ev: TaskProgressEvent): void {
    const taskListeners = this.listenersByTask.get(ev.taskId);
    if (taskListeners) {
      for (const listener of taskListeners) listener(ev);
    }
    for (const listener of this.anyListeners) listener(ev);
  }
}

// ─── TIMEOUT ERROR ─────────────────────────────────────────────────────────

export class TaskTimeoutError extends Error {
  constructor(
    readonly taskId: string,
    readonly nodoId: NodoId,
    readonly timeoutMs: number,
  ) {
    super(`Task ${taskId} timed out after ${timeoutMs}ms waiting for peer ${nodoId}`);
    this.name = 'TaskTimeoutError';
  }
}

// ─── FULL MARKETPLACE FACADE ───────────────────────────────────────────────

export interface MarketplaceFullOptions {
  /** Per-peer execution timeout (default DEFAULT_PEER_TIMEOUT_MS = 30s). */
  readonly defaultTimeoutMs?: number;
  /** Max dispatch attempts incl. fail-overs (default 3). */
  readonly maxAttempts?: number;
  /** Dispatch to several peers and aggregate (default false). */
  readonly fanOut?: boolean;
  /** Number of peers targeted when fan-out is enabled (default 2). */
  readonly fanOutCount?: number;
  /** Aggregation strategy for fan-out results (default 'collect'). */
  readonly strategy?: AggregationStrategy;
  /** Custom reducer for fan-out results (replaces strategy). */
  readonly reducer?: FanOutReducer;
  /** Queue tasks when no capable peer is online (default true). */
  readonly queueWhenNoPeer?: boolean;
}

export interface DispatchOptions {
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly fanOut?: boolean;
  readonly fanOutCount?: number;
  readonly strategy?: AggregationStrategy;
  readonly reducer?: FanOutReducer;
  readonly queueWhenNoPeer?: boolean;
}

/** A task submitted to the marketplace; the target peerId is assigned by the router. */
export type DispatchTask = Omit<Task, 'peerId'> & { readonly id: string };

type PendingOutcome = 'result' | 'timeout' | 'abandoned';

interface PendingDispatch {
  readonly taskId: string;
  readonly nodoId: NodoId;
  readonly dispatchedAt: number;
  readonly timeoutMs: number;
  timer: ReturnType<typeof setTimeout> | null;
  readonly settle: (outcome: PendingOutcome, result?: TaskResult, error?: Error) => void;
}

interface InFlightTask {
  readonly task: Task;
  readonly options: {
    readonly timeoutMs: number;
    readonly maxAttempts: number;
  };
  readonly usedPeers: Set<NodoId>;
  readonly resolve: (result: TaskResult) => void;
  readonly reject: (error: Error) => void;
}

interface QueuedTask {
  readonly task: Task;
  readonly options: {
    readonly timeoutMs: number;
    readonly maxAttempts: number;
  };
  readonly resolve: (result: TaskResult) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Full mesh marketplace facade: peer discovery + routing + aggregation +
 * progress + timeouts + capacity rebalancing on top of a GpuAgent.
 *
 * Note: attach the transport and call `mesh.iniciar()` BEFORE constructing
 * this facade so peer join/leave signals can be observed.
 */
export class GpuMeshMarketplaceFull {
  readonly discovery: PeerDiscovery;
  readonly router: TaskRouter;
  readonly aggregator: ResultAggregator;
  readonly progress: TaskProgress;

  private readonly pending = new Map<string, PendingDispatch>();
  private readonly inFlight = new Map<string, InFlightTask>();
  private readonly queued: QueuedTask[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private stopped = false;

  constructor(
    private readonly agent: GpuAgent,
    private readonly mesh: EdgeMesh,
    private readonly options: MarketplaceFullOptions = {},
  ) {
    this.discovery = new PeerDiscovery(mesh);
    this.router = new TaskRouter(this.discovery);
    this.aggregator = new ResultAggregator();
    this.progress = new TaskProgress();

    const onMensaje = (ev: CustomEvent<{ envolvente: Envolvente }>) => this.procesarEnvolvente(ev.detail.envolvente);
    this.mesh.on('mensajeRecibido', onMensaje);
    this.unsubscribers.push(() => this.mesh.off('mensajeRecibido', onMensaje));
    this.unsubscribers.push(this.discovery.onPeerChange(this.onPeerChange));
  }

  onProgress(taskId: string, listener: (ev: TaskProgressEvent) => void): () => void {
    return this.progress.on(taskId, listener);
  }

  onAnyProgress(listener: (ev: TaskProgressEvent) => void): () => void {
    return this.progress.onAny(listener);
  }

  getPeers(): readonly MeshPeerInfo[] {
    return this.discovery.getPeers();
  }

  /** SHELF-112: broadcast local compute capacity to the mesh. */
  async anunciarCapacidad(capacity?: { maxConcurrentTasks?: number; capabilities?: string[] }): Promise<void> {
    await this.agent.announceCapacity(capacity);
  }

  /**
   * Execute a task on the mesh with routing, timeout fail-over (single) or
   * fan-out aggregation, emitting progress events along the way.
   */
  async ejecutarTarea(task: DispatchTask, options: DispatchOptions = {}): Promise<TaskResult> {
    if (this.stopped) throw new Error('GpuMeshMarketplaceFull is stopped');
    if (!task.id) throw new Error('ejecutarTarea requires a task id');

    const fullTask: Task = { ...task, peerId: this.mesh.config.nodoId };
    const fanOut = options.fanOut ?? this.options.fanOut ?? false;
    const timeoutMs = options.timeoutMs ?? this.options.defaultTimeoutMs ?? DEFAULT_PEER_TIMEOUT_MS;
    if (fanOut) {
      return this.executeFanOut(fullTask, {
        timeoutMs,
        fanOutCount: options.fanOutCount ?? this.options.fanOutCount ?? 2,
        strategy: options.strategy ?? this.options.strategy,
        reducer: options.reducer ?? this.options.reducer,
      });
    }
    return this.executeSingle(fullTask, {
      timeoutMs,
      maxAttempts: options.maxAttempts ?? this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      queueWhenNoPeer: options.queueWhenNoPeer ?? this.options.queueWhenNoPeer ?? true,
    });
  }

  /** Stop routing, clear pending dispatches and reject queued work. */
  detener(): void {
    this.stopped = true;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    this.discovery.detener();

    for (const [key, pending] of Array.from(this.pending.entries())) {
      this.pending.delete(key);
      if (pending.timer) clearTimeout(pending.timer);
    }
    for (const inFlight of this.inFlight.values()) {
      inFlight.reject(new Error('Marketplace stopped'));
    }
    this.inFlight.clear();
    for (const entry of this.queued) entry.reject(new Error('Marketplace stopped'));
    this.queued.length = 0;
  }

  // ─── dispatch pipeline ──────────────────────────────────────────────────

  private executeSingle(
    task: Task,
    options: { timeoutMs: number; maxAttempts: number; queueWhenNoPeer: boolean },
  ): Promise<TaskResult> {
    return new Promise<TaskResult>((resolve, reject) => {
      this.emitProgress(task.id, 'queued', 0, 1, []);
      const inFlight: InFlightTask = {
        task,
        options,
        usedPeers: new Set<NodoId>(),
        resolve,
        reject,
      };
      const target = this.router.selectBest(task.type);
      if (!target) {
        if (options.queueWhenNoPeer) {
          this.queued.push({ task, options, resolve, reject });
          return;
        }
        this.failTask(inFlight, new Error(`No online peer supports task type '${task.type}'`));
        return;
      }
      this.inFlight.set(task.id, inFlight);
      this.dispatchAttempt(inFlight, target.nodoId);
    });
  }

  private executeFanOut(
    task: Task,
    options: {
      timeoutMs: number;
      fanOutCount: number;
      strategy?: AggregationStrategy;
      reducer?: FanOutReducer;
    },
  ): Promise<TaskResult> {
    return new Promise<TaskResult>((resolve, reject) => {
      const selections = this.router.selectTop(task.type, options.fanOutCount);
      if (selections.length === 0) {
        reject(new Error(`No online peer supports task type '${task.type}'`));
        return;
      }
      const total = selections.length;
      const received: TaskResult[] = [];
      let outstanding = total;
      this.emitProgress(task.id, 'queued', 0, total, []);

      for (const selection of selections) {
        const nodoId = selection.nodoId;
        const dispatchedAt = Date.now();
        const key = this.taskKey(task.id, nodoId);
        this.router.reserve(nodoId);
        this.emitProgress(task.id, 'dispatched', received.length, total, received.slice(), nodoId);

        const settle = (outcome: PendingOutcome, result?: TaskResult): void => {
          if (outcome === 'result' && result !== undefined) {
            received.push(result);
            this.discovery.recordLatency(nodoId, Date.now() - dispatchedAt);
            this.emitProgress(task.id, 'partial', received.length, total, received.slice(), nodoId);
          }
          this.router.release(nodoId);
          outstanding -= 1;
          if (outstanding !== 0) return;
          const aggregated = this.aggregator.aggregate(received, task.type, {
            strategy: options.strategy,
            reducer: options.reducer,
          });
          if (received.length === 0) {
            this.emitProgress(task.id, 'timed-out', 0, total, [], undefined, aggregated.error);
            const last = selections[selections.length - 1];
            reject(new TaskTimeoutError(task.id, last ? last.nodoId : this.mesh.config.nodoId, options.timeoutMs));
            return;
          }
          if (aggregated.error !== undefined) {
            this.emitProgress(task.id, 'failed', received.length, total, received.slice(), undefined, aggregated.error);
          } else {
            this.emitProgress(task.id, 'completed', received.length, total, received.slice());
          }
          resolve(aggregated);
        };

        this.pending.set(key, {
          taskId: task.id,
          nodoId,
          dispatchedAt,
          timeoutMs: options.timeoutMs,
          timer: setTimeout(() => {
            this.pending.delete(key);
            settle('timeout');
          }, options.timeoutMs),
          settle,
        });
        void this.mesh
          .enviar(nodoId, this.buildRequestEnvelope(task), TIPO_MENSAJE.GPU_TASK_REQUEST)
          .catch((err: unknown) => {
            const pending = this.pending.get(key);
            if (!pending) return;
            this.pending.delete(key);
            if (pending.timer) clearTimeout(pending.timer);
            settle('abandoned');
            void err;
          });
      }
    });
  }

  private dispatchAttempt(inFlight: InFlightTask, nodoId: NodoId): void {
    inFlight.usedPeers.add(nodoId);
    this.router.reserve(nodoId);
    this.emitProgress(inFlight.task.id, 'dispatched', 0, 1, [], nodoId);
    const dispatchedAt = Date.now();
    const key = this.taskKey(inFlight.task.id, nodoId);

    const settle = (outcome: PendingOutcome, _result?: TaskResult, error?: Error): void => {
      if (outcome === 'result' && _result !== undefined) {
        this.onDispatchResult(inFlight, nodoId, _result);
      } else if (outcome === 'timeout') {
        this.onDispatchFailure(
          inFlight,
          nodoId,
          new TaskTimeoutError(inFlight.task.id, nodoId, inFlight.options.timeoutMs),
        );
      } else {
        this.onDispatchFailure(
          inFlight,
          nodoId,
          error ?? new Error(`Peer ${nodoId} abandoned task ${inFlight.task.id}`),
        );
      }
    };

    this.pending.set(key, {
      taskId: inFlight.task.id,
      nodoId,
      dispatchedAt,
      timeoutMs: inFlight.options.timeoutMs,
      timer: setTimeout(() => {
        this.pending.delete(key);
        settle('timeout');
      }, inFlight.options.timeoutMs),
      settle,
    });
    void this.mesh
      .enviar(nodoId, this.buildRequestEnvelope(inFlight.task), TIPO_MENSAJE.GPU_TASK_REQUEST)
      .catch((err: unknown) => {
        const pending = this.pending.get(key);
        if (!pending) return;
        this.pending.delete(key);
        if (pending.timer) clearTimeout(pending.timer);
        settle('abandoned', undefined, err instanceof Error ? err : new Error(String(err)));
      });
  }

  private onDispatchResult(inFlight: InFlightTask, nodoId: NodoId, result: TaskResult): void {
    this.router.release(nodoId);
    this.discovery.touch(nodoId);
    this.completeTask(inFlight, result);
  }

  private onDispatchFailure(inFlight: InFlightTask, nodoId: NodoId, error: Error): void {
    this.router.release(nodoId);
    if (error instanceof TaskTimeoutError) {
      this.discovery.marcarNoResponsivo(nodoId);
    }
    if (inFlight.usedPeers.size >= inFlight.options.maxAttempts) {
      this.failTask(inFlight, error);
      return;
    }
    this.emitProgress(inFlight.task.id, 'rebalanced', 0, 1, [], undefined, error.message);
    const target = this.router.selectBest(inFlight.task.type);
    if (!target || inFlight.usedPeers.has(target.nodoId)) {
      this.failTask(inFlight, new Error(`No remaining peer can serve task type '${inFlight.task.type}'`));
      return;
    }
    this.dispatchAttempt(inFlight, target.nodoId);
  }

  private completeTask(inFlight: InFlightTask, result: TaskResult): void {
    this.inFlight.delete(inFlight.task.id);
    const state: TaskState = result.error === undefined ? 'completed' : 'failed';
    this.emitProgress(inFlight.task.id, state, 1, 1, [result], undefined, result.error);
    inFlight.resolve(result);
  }

  private failTask(inFlight: InFlightTask, error: Error): void {
    this.inFlight.delete(inFlight.task.id);
    const state: TaskState = error instanceof TaskTimeoutError ? 'timed-out' : 'failed';
    this.emitProgress(inFlight.task.id, state, 0, 1, [], undefined, error.message);
    inFlight.reject(error);
  }

  private dispatchQueued(): void {
    if (this.stopped) return;
    let index = 0;
    while (index < this.queued.length) {
      const entry = this.queued[index];
      const target = this.router.selectBest(entry.task.type);
      if (!target) {
        index += 1;
        continue;
      }
      this.queued.splice(index, 1);
      const inFlight: InFlightTask = {
        task: entry.task,
        options: entry.options,
        usedPeers: new Set<NodoId>(),
        resolve: entry.resolve,
        reject: entry.reject,
      };
      this.inFlight.set(entry.task.id, inFlight);
      this.dispatchAttempt(inFlight, target.nodoId);
    }
  }

  private readonly onPeerChange = (ev: PeerChangeEvent): void => {
    if (ev.joined && ev.status === 'online') {
      this.dispatchQueued();
      return;
    }
    if (ev.status === 'offline') {
      this.rebalanceAwayFrom(ev.nodoId);
    }
  };

  /** Re-route in-flight work away from a peer that left or went offline. */
  private rebalanceAwayFrom(nodoId: NodoId): void {
    for (const [key, pending] of Array.from(this.pending.entries())) {
      if (pending.nodoId !== nodoId) continue;
      this.pending.delete(key);
      if (pending.timer) clearTimeout(pending.timer);
      pending.settle('abandoned', undefined, new Error(`Peer ${nodoId} left the mesh`));
    }
  }

  private procesarEnvolvente(env: Envolvente): void {
    if (env.origen === this.mesh.config.nodoId) return;
    if (env.destino !== '*' && env.destino !== this.mesh.config.nodoId) return;

    switch (env.tipo) {
      case TIPO_MENSAJE.GPU_TASK_REQUEST: {
        const payload = env.payload as TaskRequestEnvelope;
        const tarea: Task = { ...payload.task, peerId: env.origen };
        void this.agent.acceptTask(tarea).catch(() => {
          // Best-effort worker: verification/compute failures surface as results
        });
        break;
      }
      case TIPO_MENSAJE.GPU_TASK_RESULT: {
        const payload = env.payload as TaskResultEnvelope;
        const key = this.taskKey(payload.taskId, env.origen);
        const pending = this.pending.get(key);
        if (pending) {
          this.pending.delete(key);
          if (pending.timer) clearTimeout(pending.timer);
          this.discovery.recordLatency(env.origen, Date.now() - pending.dispatchedAt);
          pending.settle('result', payload.result);
        }
        void this.agent.resolverResultado(payload);
        break;
      }
      default:
        break;
    }
  }

  private buildRequestEnvelope(task: Task): TaskRequestEnvelope {
    return {
      kind: 'gpu-agent.task-request',
      task: { ...task, peerId: this.mesh.config.nodoId },
      timestamp: Date.now(),
    };
  }

  private taskKey(taskId: string, nodoId: NodoId): string {
    return `${taskId}::${nodoId}`;
  }

  private emitProgress(
    taskId: string,
    state: TaskState,
    receivedCount: number,
    totalCount: number,
    results: readonly TaskResult[],
    peerId?: NodoId,
    error?: string,
  ): void {
    this.progress.emit({ taskId, state, receivedCount, totalCount, results, peerId, error });
  }
}
