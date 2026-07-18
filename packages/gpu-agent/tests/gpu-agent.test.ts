import { describe, expect, it } from 'vitest';
import { GpuAgent } from '../src/gpu-agent';

describe('GpuAgent', () => {
  it('isWebGpuSupported returns boolean in node (false without navigator.gpu)', async () => {
    const ok = await GpuAgent.isWebGpuSupported();
    expect(typeof ok).toBe('boolean');
  });

  it('runs vector-sum on CPU fallback', async () => {
    const agent = new GpuAgent({ preferWebGpu: false, capabilities: ['vector-sum', 'echo'] });
    const result = await agent.runLocalTask({
      type: 'vector-sum',
      input: { values: [1, 2, 3, 4] },
    });
    expect(result.error).toBeUndefined();
    expect(result.backend).toBe('cpu');
    expect(result.output).toEqual({ sum: 10 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs dot-product on CPU', async () => {
    const agent = new GpuAgent({ preferWebGpu: false });
    const result = await agent.runLocalTask({
      type: 'dot-product',
      input: { a: [1, 2, 3], b: [4, 5, 6] },
    });
    expect(result.output).toEqual({ dot: 32 });
  });

  it('runs matrix-scale on CPU', async () => {
    const agent = new GpuAgent({ preferWebGpu: false });
    const result = await agent.runLocalTask({
      type: 'matrix-scale',
      input: { values: [1, 2, 3], scale: 2 },
    });
    expect(result.output).toEqual({ values: [2, 4, 6] });
  });

  it('echo task returns payload', async () => {
    const agent = new GpuAgent();
    const result = await agent.runLocalTask({
      type: 'echo',
      input: { message: 'hello' },
    });
    expect((result.output as { echo: string }).echo).toBe('hello');
  });

  it('queues concurrent tasks beyond maxConcurrentTasks', async () => {
    const agent = new GpuAgent({ preferWebGpu: false, maxConcurrentTasks: 1 });
    const p1 = agent.runLocalTask({ type: 'vector-sum', input: { values: [1] } });
    const p2 = agent.runLocalTask({ type: 'vector-sum', input: { values: [2, 3] } });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.output).toEqual({ sum: 1 });
    expect(r2.output).toEqual({ sum: 5 });
  });

  it('rejects remote tasks without valid signature by default', async () => {
    const agent = new GpuAgent({ preferWebGpu: false });
    const bad = await agent.submitTask({
      id: 'r1',
      type: 'echo',
      input: { message: 'x' },
      peerId: 'remote-peer',
    });
    expect(bad.error).toMatch(/verification/i);

    const good = await agent.submitTask({
      id: 'r2',
      type: 'echo',
      input: { message: 'ok' },
      peerId: 'remote-peer',
      signature: 'a'.repeat(16),
    });
    expect(good.error).toBeUndefined();
  });

  it('uses custom verifyTask', async () => {
    const agent = new GpuAgent({
      preferWebGpu: false,
      verifyTask: (t) => t.signature === 'secret',
    });
    const denied = await agent.submitTask({
      id: '1',
      type: 'echo',
      input: {},
      peerId: 'p',
      signature: 'nope',
    });
    expect(denied.error).toBeTruthy();
    const allowed = await agent.submitTask({
      id: '2',
      type: 'echo',
      input: { message: 'y' },
      peerId: 'p',
      signature: 'secret',
    });
    expect(allowed.error).toBeUndefined();
  });

  it('offerWorkerCapacity updates max concurrency without throwing', async () => {
    const agent = new GpuAgent({ maxConcurrentTasks: 1 });
    await agent.offerWorkerCapacity({ maxConcurrentTasks: 3, capabilities: ['echo'] });
    expect(agent.getCapabilities()).toContain('echo');
  });
});
