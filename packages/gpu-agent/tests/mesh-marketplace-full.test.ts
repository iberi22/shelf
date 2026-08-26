import type { NodoId } from 'edge-mesh';
import { EdgeMesh, MemoryTransport } from 'edge-mesh';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskResult } from '../src/gpu-agent';
import { GpuAgent } from '../src/gpu-agent';
import { GpuMeshMarketplace } from '../src/mesh-marketplace';
import {
  DEFAULT_PEER_TIMEOUT_MS,
  GpuMeshMarketplaceFull,
  type MeshPeerInfo,
  PeerDiscovery,
  ResultAggregator,
  TaskProgress,
  type TaskProgressEvent,
  TaskRouter,
  type TaskState,
  TaskTimeoutError,
} from '../src/mesh-marketplace-full';

const CAPS = ['vector-sum', 'dot-product', 'matrix-scale', 'echo'];

function getPeer(discovery: PeerDiscovery, id: string): MeshPeerInfo {
  const peer = discovery.getPeer(id as NodoId);
  if (!peer) throw new Error(`peer ${id} not discovered`);
  return peer;
}

async function makeNode(id: string, roomId: string) {
  const mesh = new EdgeMesh({
    nodoId: id as NodoId,
    storageBackend: 'mem',
    requireAuthz: false,
    heartbeatIntervalMs: 60_000,
    heartbeatTimeoutMs: 120_000,
  });
  mesh.usarTransport(new MemoryTransport(id as NodoId, { roomId }));
  await mesh.iniciar();
  return mesh;
}

async function makeWorker(id: string, roomId: string, capabilities: string[], maxConcurrentTasks = 4) {
  const mesh = await makeNode(id, roomId);
  const agent = new GpuAgent({ mesh, preferWebGpu: false, verifyTask: () => true, maxConcurrentTasks });
  const marketplace = new GpuMeshMarketplace(agent, mesh);
  await marketplace.anunciarCapacidad({ maxConcurrentTasks, capabilities });
  return { mesh, agent, marketplace };
}

/** A node that advertises capacity but never processes tasks (unresponsive peer). */
async function makeDeadNode(id: string, roomId: string, capabilities: string[]) {
  const mesh = await makeNode(id, roomId);
  const agent = new GpuAgent({ mesh, preferWebGpu: false });
  await agent.announceCapacity({ maxConcurrentTasks: 1, capabilities });
  return { mesh, agent };
}

// ─── PEER DISCOVERY ────────────────────────────────────────────────────────

describe('PeerDiscovery', () => {
  const roomId = 'full-discovery-room';

  beforeEach(() => MemoryTransport.resetAll());
  afterEach(() => {
    MemoryTransport.resetAll();
    vi.restoreAllMocks();
  });

  it('registers peers from GPU capacity announcements and tracks joins', async () => {
    const host = await makeNode('full-disc-host', roomId);
    const discovery = new PeerDiscovery(host);
    const changes: string[] = [];
    const unsub = discovery.onPeerChange((ev) => changes.push(`${ev.nodoId}:${ev.joined}:${ev.status}`));

    const worker = await makeWorker('full-disc-worker', roomId, ['vector-sum'], 3);

    await vi.waitFor(() => expect(discovery.getPeer('full-disc-worker' as NodoId)).toBeDefined());
    const peer = getPeer(discovery, 'full-disc-worker');
    expect(peer.status).toBe('online');
    expect(peer.capacity?.maxConcurrentTasks).toBe(3);
    expect(peer.capacity?.capabilities).toContain('vector-sum');
    expect(discovery.getPeersWithCapability('vector-sum').map((p) => p.nodoId)).toEqual(['full-disc-worker']);
    expect(discovery.getPeersWithCapability('dot-product')).toHaveLength(0);
    expect(changes).toContain('full-disc-worker:true:online');

    unsub();
    await host.detener();
    await worker.mesh.detener();
  });

  it('marks a peer offline when it leaves the mesh', async () => {
    const host = await makeNode('full-disc-host2', roomId);
    const discovery = new PeerDiscovery(host);
    const worker = await makeWorker('full-disc-leaver', roomId, ['echo']);
    await vi.waitFor(() => expect(discovery.getPeer('full-disc-leaver' as NodoId)?.status).toBe('online'));

    const changes: string[] = [];
    discovery.onPeerChange((ev) => changes.push(`${ev.nodoId}:${ev.status}`));

    await worker.mesh.detener();
    await vi.waitFor(() => expect(discovery.getPeer('full-disc-leaver' as NodoId)?.status).toBe('offline'));
    expect(changes).toContain('full-disc-leaver:offline');

    await host.detener();
  });

  it('sweeps stale peers with barrido()', async () => {
    const host = await makeNode('full-disc-host3', roomId);
    const discovery = new PeerDiscovery(host, { staleAfterMs: 500 });
    discovery.upsertCapacity('full-disc-stale' as NodoId, {
      maxConcurrentTasks: 1,
      capabilities: ['echo'],
      timestamp: Date.now(),
    });

    const peer = getPeer(discovery, 'full-disc-stale');
    peer.lastSeenMs = Date.now() - 10_000;
    expect(discovery.barrido()).toBe(1);
    expect(discovery.getPeer('full-disc-stale' as NodoId)?.status).toBe('offline');

    await host.detener();
  });

  it('smooths latency samples with an EMA', async () => {
    const host = await makeNode('full-disc-host4', roomId);
    const discovery = new PeerDiscovery(host);
    discovery.upsertCapacity('full-disc-lat' as NodoId, {
      maxConcurrentTasks: 1,
      capabilities: ['echo'],
      timestamp: Date.now(),
    });

    discovery.recordLatency('full-disc-lat' as NodoId, 10);
    expect(discovery.getPeer('full-disc-lat' as NodoId)?.latencyMs).toBe(10);
    discovery.recordLatency('full-disc-lat' as NodoId, 20);
    expect(discovery.getPeer('full-disc-lat' as NodoId)?.latencyMs).toBeCloseTo(13, 5); // 0.3*20 + 0.7*10

    await host.detener();
  });
});

// ─── TASK ROUTER ───────────────────────────────────────────────────────────

describe('TaskRouter', () => {
  const roomId = 'full-router-room';

  beforeEach(() => MemoryTransport.resetAll());
  afterEach(() => {
    MemoryTransport.resetAll();
    vi.restoreAllMocks();
  });

  async function makeRouter() {
    const host = await makeNode('full-router-host', roomId);
    const discovery = new PeerDiscovery(host);
    const router = new TaskRouter(discovery);
    return { host, discovery, router };
  }

  it('selects the peer with the required capability and lowest latency', async () => {
    const { host, discovery, router } = await makeRouter();
    discovery.upsertCapacity('full-router-a' as NodoId, {
      maxConcurrentTasks: 2,
      capabilities: ['vector-sum'],
      timestamp: Date.now(),
    });
    discovery.upsertCapacity('full-router-b' as NodoId, {
      maxConcurrentTasks: 2,
      capabilities: ['vector-sum'],
      timestamp: Date.now(),
    });
    discovery.upsertCapacity('full-router-c' as NodoId, {
      maxConcurrentTasks: 2,
      capabilities: ['dot-product'],
      timestamp: Date.now(),
    });
    discovery.recordLatency('full-router-a' as NodoId, 5);
    discovery.recordLatency('full-router-b' as NodoId, 120);

    expect(router.selectBest('vector-sum')?.nodoId).toBe('full-router-a');
    expect(router.selectBest('dot-product')?.nodoId).toBe('full-router-c');
    expect(router.selectBest('matrix-scale')).toBeNull();

    await host.detener();
  });

  it('skips peers without free capacity slots', async () => {
    const { host, discovery, router } = await makeRouter();
    discovery.upsertCapacity('full-router-busy' as NodoId, {
      maxConcurrentTasks: 2,
      capabilities: ['vector-sum'],
      timestamp: Date.now(),
    });
    discovery.upsertCapacity('full-router-free' as NodoId, {
      maxConcurrentTasks: 2,
      capabilities: ['vector-sum'],
      timestamp: Date.now(),
    });
    discovery.recordLatency('full-router-busy' as NodoId, 1);
    discovery.recordLatency('full-router-free' as NodoId, 100);

    discovery.recordActiveTask('full-router-busy' as NodoId, 2); // 2/2 slots used
    expect(router.selectBest('vector-sum')?.nodoId).toBe('full-router-free');

    await host.detener();
  });

  it('ranks top-N peers for fan-out, best first', async () => {
    const { host, discovery, router } = await makeRouter();
    for (const [id, lat] of [
      ['full-router-top-a', 5],
      ['full-router-top-b', 200],
      ['full-router-top-c', 10],
    ] as const) {
      discovery.upsertCapacity(id as NodoId, {
        maxConcurrentTasks: 1,
        capabilities: ['echo'],
        timestamp: Date.now(),
      });
      discovery.recordLatency(id as NodoId, lat);
    }
    const top = router.selectTop('echo', 2).map((r) => r.nodoId);
    expect(top).toEqual(['full-router-top-a', 'full-router-top-c']);
    expect(router.selectTop('echo', 2)[0]?.score).toBeGreaterThan(router.selectTop('echo', 2)[1]?.score ?? -Infinity);

    await host.detener();
  });
});

// ─── RESULT AGGREGATOR ─────────────────────────────────────────────────────

describe('ResultAggregator', () => {
  function partial(taskId: string, output: unknown, error?: string): TaskResult {
    return { taskId, type: 'vector-sum', backend: 'cpu', output, error, durationMs: 1 };
  }

  it('collects partial outputs by default', () => {
    const agg = new ResultAggregator();
    const result = agg.aggregate([partial('a', { sum: 4 }), partial('b', { sum: 6 })], 'vector-sum');
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual([{ sum: 4 }, { sum: 6 }]);
  });

  it('sums numeric partials', () => {
    const agg = new ResultAggregator();
    const result = agg.aggregate([partial('a', { sum: 4 }), partial('b', { sum: 6 })], 'vector-sum', {
      strategy: 'sum',
    });
    expect(result.output).toBe(10);
  });

  it('concatenates array partials', () => {
    const agg = new ResultAggregator();
    const result = agg.aggregate([partial('a', { values: [1, 2] }), partial('b', { values: [3] })], 'matrix-scale', {
      strategy: 'concat',
    });
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual([1, 2, 3]);
  });

  it('returns the first successful partial and tolerates failures', () => {
    const agg = new ResultAggregator();
    const result = agg.aggregate([partial('a', null, 'boom'), partial('b', { sum: 2 })], 'vector-sum', {
      strategy: 'first',
    });
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ sum: 2 });
  });

  it('reports an error when every partial failed', () => {
    const agg = new ResultAggregator();
    const result = agg.aggregate([partial('a', null, 'boom'), partial('b', null, 'kaput')], 'vector-sum', {
      strategy: 'sum',
    });
    expect(result.error).toBeDefined();
  });

  it('supports custom reducers', () => {
    const agg = new ResultAggregator();
    const result = agg.aggregate([partial('a', { sum: 1 }), partial('b', { sum: 2 })], 'vector-sum', {
      reducer: (partials) => partials.length * 10,
    });
    expect(result.output).toBe(20);
  });
});

// ─── TASK PROGRESS ─────────────────────────────────────────────────────────

describe('TaskProgress', () => {
  it('dispatches to task-scoped and global listeners', () => {
    const progress = new TaskProgress();
    const seen: string[] = [];
    const unsubTask = progress.on('t1', (ev) => seen.push(`t:${ev.state}`));
    const unsubAny = progress.onAny((ev) => seen.push(`any:${ev.state}:${ev.taskId}`));

    progress.emit({ taskId: 't1', state: 'queued', receivedCount: 0, totalCount: 1, results: [] });
    expect(seen).toEqual(['t:queued', 'any:queued:t1']);

    unsubTask();
    progress.emit({ taskId: 't1', state: 'completed', receivedCount: 1, totalCount: 1, results: [] });
    expect(seen).toEqual(['t:queued', 'any:queued:t1', 'any:completed:t1']);

    unsubAny();
    progress.emit({ taskId: 't1', state: 'partial', receivedCount: 1, totalCount: 1, results: [] });
    expect(seen).toHaveLength(3);
  });
});

// ─── FULL MARKETPLACE (END-TO-END) ─────────────────────────────────────────

describe('GpuMeshMarketplaceFull (end-to-end)', () => {
  const roomId = 'full-e2e-room';

  beforeEach(() => MemoryTransport.resetAll());
  afterEach(() => {
    MemoryTransport.resetAll();
    vi.restoreAllMocks();
  });

  async function makeRequester() {
    const mesh = await makeNode('full-requester', roomId);
    const agent = new GpuAgent({ mesh, preferWebGpu: false });
    const facade = new GpuMeshMarketplaceFull(agent, mesh);
    return { mesh, agent, facade };
  }

  it('defaults to a 30s peer timeout', () => {
    expect(DEFAULT_PEER_TIMEOUT_MS).toBe(30_000);
  });

  it('routes a task to a capable peer and returns the computed result', async () => {
    const requester = await makeRequester();
    const worker = await makeWorker('full-worker-ok', roomId, CAPS);
    await vi.waitFor(() => expect(requester.facade.getPeers()).toHaveLength(1));

    const states: TaskState[] = [];
    requester.facade.onAnyProgress((ev) => states.push(ev.state));

    const result = await requester.facade.ejecutarTarea(
      { id: 'full-task-ok', type: 'vector-sum', input: { values: [1, 2, 3, 4] } },
      { timeoutMs: 2_000 },
    );

    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ sum: 10 });
    expect(result.backend).toBe('cpu');
    expect(states).toEqual(['queued', 'dispatched', 'completed']);
    // round trip measured a latency sample
    expect(requester.facade.discovery.getPeer('full-worker-ok' as NodoId)?.latencyMs).toBeGreaterThanOrEqual(0);

    await requester.mesh.detener();
    await worker.mesh.detener();
  });

  it('fails over to the next best peer when the first peer times out', async () => {
    const requester = await makeRequester();
    const dead = await makeDeadNode('full-worker-dead', roomId, ['vector-sum']);
    const worker = await makeWorker('full-worker-good', roomId, ['vector-sum']);
    await vi.waitFor(() => expect(requester.facade.getPeers()).toHaveLength(2));

    // make the unresponsive node look like the fastest peer
    requester.facade.discovery.recordLatency('full-worker-dead' as NodoId, 1);
    requester.facade.discovery.recordLatency('full-worker-good' as NodoId, 500);
    expect(requester.facade.router.selectBest('vector-sum')?.nodoId).toBe('full-worker-dead');

    const states: TaskState[] = [];
    requester.facade.onAnyProgress((ev) => states.push(ev.state));

    const result = await requester.facade.ejecutarTarea(
      { id: 'full-task-failover', type: 'vector-sum', input: { values: [2, 3, 5] } },
      { timeoutMs: 60 },
    );

    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ sum: 10 });
    expect(states).toContain('rebalanced');
    expect(states).toContain('completed');
    expect(states).not.toContain('timed-out');

    // the dead peer is now marked unresponsive and skipped by the router
    const deadPeer = getPeer(requester.facade.discovery, 'full-worker-dead');
    expect(deadPeer.status).toBe('unresponsive');
    expect(deadPeer.consecutiveTimeouts).toBe(1);
    expect(requester.facade.router.selectBest('vector-sum')?.nodoId).toBe('full-worker-good');

    await requester.mesh.detener();
    await dead.mesh.detener();
    await worker.mesh.detener();
  });

  it('rejects with TaskTimeoutError when the only peer never answers', async () => {
    const requester = await makeRequester();
    const dead = await makeDeadNode('full-worker-silent', roomId, ['vector-sum']);
    await vi.waitFor(() => expect(requester.facade.getPeers()).toHaveLength(1));

    const states: TaskState[] = [];
    requester.facade.onAnyProgress((ev) => states.push(ev.state));

    await expect(
      requester.facade.ejecutarTarea(
        { id: 'full-task-timeout', type: 'vector-sum', input: { values: [1] } },
        { timeoutMs: 50, maxAttempts: 1 },
      ),
    ).rejects.toBeInstanceOf(TaskTimeoutError);
    expect(states).toContain('timed-out');

    await requester.mesh.detener();
    await dead.mesh.detener();
  });

  it('re-routes in-flight tasks when the assigned peer leaves the mesh', async () => {
    const requester = await makeRequester();
    const leaver = await makeDeadNode('full-worker-leaver', roomId, ['vector-sum']);
    const steady = await makeWorker('full-worker-steady', roomId, ['vector-sum']);
    await vi.waitFor(() => expect(requester.facade.getPeers()).toHaveLength(2));

    requester.facade.discovery.recordLatency('full-worker-leaver' as NodoId, 1);
    requester.facade.discovery.recordLatency('full-worker-steady' as NodoId, 400);
    expect(requester.facade.router.selectBest('vector-sum')?.nodoId).toBe('full-worker-leaver');

    const states: TaskState[] = [];
    requester.facade.onAnyProgress((ev) => states.push(ev.state));

    const pending = requester.facade.ejecutarTarea(
      { id: 'full-task-leave', type: 'vector-sum', input: { values: [4, 6] } },
      { timeoutMs: 5_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 20)); // dispatch settles on the dead peer

    await leaver.mesh.detener(); // peer leaves → capacity rebalancing kicks in
    const result = await pending;

    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ sum: 10 });
    expect(states).toContain('rebalanced');
    expect(states).toContain('completed');
    expect(requester.facade.discovery.getPeer('full-worker-leaver' as NodoId)?.status).toBe('offline');

    await requester.mesh.detener();
    await steady.mesh.detener();
  });

  it('fans out to multiple peers and aggregates partial results', async () => {
    const requester = await makeRequester();
    await makeWorker('full-fan-a', roomId, ['vector-sum']);
    await makeWorker('full-fan-b', roomId, ['vector-sum']);
    await vi.waitFor(() => expect(requester.facade.getPeers()).toHaveLength(2));

    const events: TaskProgressEvent[] = [];
    requester.facade.onAnyProgress((ev) => events.push(ev));

    const sumResult = await requester.facade.ejecutarTarea(
      { id: 'full-task-fan-sum', type: 'vector-sum', input: { values: [1, 2, 3, 4] } },
      { fanOut: true, fanOutCount: 2, strategy: 'sum', timeoutMs: 2_000 },
    );
    expect(sumResult.error).toBeUndefined();
    expect(sumResult.output).toBe(20); // both workers computed 10

    const states = events.map((ev) => ev.state);
    for (const state of ['queued', 'dispatched', 'partial', 'completed'] as const) {
      expect(states).toContain(state);
    }
    expect(states.filter((s) => s === 'dispatched')).toHaveLength(2);
    expect(states.filter((s) => s === 'partial')).toHaveLength(2);
    expect(events.at(-1)?.receivedCount).toBe(2);
    expect(events.at(-1)?.totalCount).toBe(2);

    // default 'collect' strategy returns every partial output
    const collectResult = await requester.facade.ejecutarTarea(
      { id: 'full-task-fan-collect', type: 'vector-sum', input: { values: [1] } },
      { fanOut: true, timeoutMs: 2_000 },
    );
    expect(Array.isArray(collectResult.output)).toBe(true);
    expect(collectResult.output as unknown[]).toHaveLength(2);

    await requester.mesh.detener();
  });

  it('queues tasks until a capable peer joins the mesh', async () => {
    const requester = await makeRequester();

    const states: TaskState[] = [];
    requester.facade.onAnyProgress((ev) => states.push(ev.state));

    const pending = requester.facade.ejecutarTarea(
      { id: 'full-task-queued', type: 'vector-sum', input: { values: [3, 4] } },
      { timeoutMs: 3_000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(states).toEqual(['queued']); // still waiting for a peer

    await makeWorker('full-late-worker', roomId, ['vector-sum']);
    const result = await pending; // dispatched once the peer joins + announces

    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ sum: 7 });
    expect(states).toEqual(['queued', 'dispatched', 'completed']);

    await requester.mesh.detener();
  });
});
