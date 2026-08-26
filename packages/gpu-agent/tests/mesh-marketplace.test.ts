import type { NodoId } from 'edge-mesh';
import { EdgeMesh, MemoryTransport } from 'edge-mesh';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../src/gpu-agent';
import { GpuAgent } from '../src/gpu-agent';
import { GpuMeshMarketplace } from '../src/mesh-marketplace';

describe('GpuMeshMarketplace (SHELF-112)', () => {
  const roomId = 'mesh-marketplace-room';

  beforeEach(() => {
    MemoryTransport.resetAll();
  });

  afterEach(() => {
    MemoryTransport.resetAll();
    vi.restoreAllMocks();
  });

  async function makeNode(id: string) {
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

  it('announceCapacity broadcasts the worker capacity to the mesh', async () => {
    const workerMesh = await makeNode('gpu-worker');
    const workerAgent = new GpuAgent({ mesh: workerMesh, preferWebGpu: false });
    const workerMarketplace = new GpuMeshMarketplace(workerAgent, workerMesh);

    const listenerMesh = await makeNode('gpu-listener');
    const listenerMarketplace = new GpuMeshMarketplace(
      new GpuAgent({ mesh: listenerMesh, preferWebGpu: false }),
      listenerMesh,
    );

    await workerMarketplace.anunciarCapacidad({
      maxConcurrentTasks: 2,
      capabilities: ['vector-sum', 'dot-product'],
    });

    await vi.waitFor(() => {
      const peers = listenerMarketplace.obtenerPeersConCapacidad();
      expect(peers).toHaveLength(1);
      expect(peers[0].nodoId).toBe('gpu-worker');
      expect(peers[0].capacidad.maxConcurrentTasks).toBe(2);
      expect(peers[0].capacidad.capabilities).toContain('vector-sum');
    });

    expect(listenerMarketplace.obtenerPeersParaTipo('vector-sum').map((p) => p.nodoId)).toEqual(['gpu-worker']);

    await workerMesh.detener();
    await listenerMesh.detener();
  });

  it('requestTask finds a peer with capacity and returns its computed result', async () => {
    const workerMesh = await makeNode('gpu-worker-2');
    const workerAgent = new GpuAgent({ mesh: workerMesh, preferWebGpu: false, verifyTask: () => true });
    const workerMarketplace = new GpuMeshMarketplace(workerAgent, workerMesh);

    const requesterMesh = await makeNode('gpu-requester');
    const requesterMarketplace = new GpuMeshMarketplace(
      new GpuAgent({ mesh: requesterMesh, preferWebGpu: false }),
      requesterMesh,
    );

    await workerMarketplace.anunciarCapacidad({
      maxConcurrentTasks: 1,
      capabilities: ['vector-sum', 'dot-product', 'matrix-scale'],
    });

    await vi.waitFor(() => expect(requesterMarketplace.obtenerPeersConCapacidad()).toHaveLength(1));

    const resultado = await requesterMarketplace.solicitarTarea(
      { id: 'tarea-1', type: 'vector-sum', input: { values: [1, 2, 3, 4] } },
      5_000,
    );

    expect(resultado.error).toBeUndefined();
    expect(resultado.output).toEqual({ sum: 10 });
    expect(resultado.backend).toBe('cpu');

    await workerMesh.detener();
    await requesterMesh.detener();
  });

  it('acceptTask processes a received remote task and returns the result', async () => {
    const mesh = await makeNode('gpu-single');
    const agent = new GpuAgent({ mesh, preferWebGpu: false, verifyTask: () => true });

    const resultado = await agent.acceptTask({
      id: 't-remote',
      type: 'dot-product',
      input: { a: [1, 2, 3], b: [4, 5, 6] },
      peerId: 'requester-anon',
      signature: 'sig-16-characters',
    });

    expect(resultado.error).toBeUndefined();
    expect(resultado.output).toEqual({ dot: 32 });
    expect(resultado.backend).toBe('cpu');

    await mesh.detener();
  });

  it('acceptTask rejects unverifiable remote tasks', async () => {
    const agent = new GpuAgent({ preferWebGpu: false }); // sin mesh / verifyTask por defecto
    const resultado = await agent.acceptTask({
      id: 't-no-sig',
      type: 'echo',
      input: { message: 'x' },
      peerId: 'requester-anon',
    });
    expect(resultado.error).toMatch(/verification/i);
  });

  it('prioritizes local tasks over remote tasks in the queue', async () => {
    const agent = new GpuAgent({ preferWebGpu: false, maxConcurrentTasks: 1, verifyTask: () => true });

    type ExecuteTaskFn = (task: Task) => Promise<{ output: unknown; backend: 'webgpu' | 'cpu' }>;
    // @ts-expect-error acceso a internals del agente para el test
    const proto = GpuAgent.prototype as { executeTask: ExecuteTaskFn };
    const originalExecute = proto.executeTask;
    let resolverOcupante!: (r: unknown) => void;
    const bloqueoOcupante = new Promise((resolve) => {
      resolverOcupante = resolve;
    });
    const idsEjecutados: string[] = [];

    const spy = vi.spyOn(proto, 'executeTask').mockImplementation(function (this: GpuAgent, task: Task) {
      idsEjecutados.push(task.id);
      if (task.id === 'ocupante') {
        return bloqueoOcupante as Promise<{ output: unknown; backend: 'webgpu' | 'cpu' }>;
      }
      return originalExecute.call(this, task);
    });

    const pOcupante = agent.runLocalTask({ type: 'echo', input: { message: 'ocupante' }, id: 'ocupante' });
    const pLocal = agent.runLocalTask({ type: 'echo', input: { message: 'local' }, id: 'local' });
    const pRemota = agent.submitTask({ id: 'remota', type: 'echo', input: { message: 'remota' }, peerId: 'peer-9' });

    // Dejar que submitTask pase verificación y encole
    await Promise.resolve();
    await Promise.resolve();

    const cola = (agent as unknown as { taskQueue: Array<{ task: Task; prioridad: number }> }).taskQueue;
    expect(cola.map((e) => e.task.peerId)).toEqual(['local', 'peer-9']);
    expect(cola.map((e) => e.prioridad)).toEqual([0, 1]);

    resolverOcupante({ taskId: 'ocupante', type: 'echo', backend: 'cpu', output: {}, durationMs: 0 });

    const resultados = await Promise.all([pOcupante, pLocal, pRemota]);
    expect(resultados.every((r) => r.error === undefined)).toBe(true);
    // local (tarea 2) se ejecutó antes que la remota (tarea 3)
    expect(idsEjecutados).toEqual(['ocupante', 'local', 'remota']);

    spy.mockRestore();
  });
});
