import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GpuAgent } from '../src/gpu-agent';

function installWebGpuMock() {
  type BufRec = {
    usage: number;
    size: number;
    data: Float32Array;
    mapped?: ArrayBuffer;
  };

  const buffers = new WeakMap<object, BufRec>();

  const device = {
    createShaderModule: () => ({}),
    createComputePipeline: () => ({
      getBindGroupLayout: () => ({}),
    }),
    createBuffer: ({ size, usage }: { size: number; usage: number }) => {
      const buf = {
        destroy() {
          buffers.delete(buf);
        },
        async mapAsync(_mode: number) {
          const rec = buffers.get(buf);
          if (!rec) throw new Error('unknown buffer');
          rec.mapped = rec.data.buffer.slice(
            rec.data.byteOffset,
            rec.data.byteOffset + Math.max(4, rec.data.byteLength),
          );
        },
        getMappedRange() {
          const rec = buffers.get(buf);
          if (!rec?.mapped) throw new Error('not mapped');
          return rec.mapped;
        },
        unmap() {
          const rec = buffers.get(buf);
          if (rec) rec.mapped = undefined;
        },
      };
      buffers.set(buf, {
        usage,
        size,
        data: new Float32Array(Math.max(1, Math.ceil(size / 4))),
      });
      return buf;
    },
    createBindGroup: ({ entries }: { entries: Array<{ binding: number; resource: { buffer: object } }> }) => ({
      entries,
    }),
    createCommandEncoder: () => {
      let pendingCopy: { src: object; dst: object; size: number } | null = null;
      let pendingScale: { values: object; params: object } | null = null;
      let pendingMul: { a: object; b: object; out: object; params: object } | null = null;

      return {
        beginComputePass: () => ({
          setPipeline() {},
          setBindGroup(_i: number, group: { entries: Array<{ binding: number; resource: { buffer: object } }> }) {
            const byBinding = new Map(group.entries.map((e) => [e.binding, e.resource.buffer]));
            if (byBinding.size === 2) {
              const values = byBinding.get(0);
              const params = byBinding.get(1);
              if (values && params) pendingScale = { values, params };
            } else if (byBinding.size === 4) {
              const a = byBinding.get(0);
              const b = byBinding.get(1);
              const out = byBinding.get(2);
              const params = byBinding.get(3);
              if (a && b && out && params) pendingMul = { a, b, out, params };
            }
          },
          dispatchWorkgroups() {},
          end() {
            if (pendingScale) {
              const valuesRec = buffers.get(pendingScale.values);
              const paramsRec = buffers.get(pendingScale.params);
              if (valuesRec && paramsRec) {
                const scale = paramsRec.data[0] ?? 1;
                const len = Math.min(valuesRec.data.length, Math.floor(paramsRec.data[1] || valuesRec.data.length));
                for (let i = 0; i < len; i++) valuesRec.data[i] = valuesRec.data[i] * scale;
              }
              pendingScale = null;
            }
            if (pendingMul) {
              const aRec = buffers.get(pendingMul.a);
              const bRec = buffers.get(pendingMul.b);
              const outRec = buffers.get(pendingMul.out);
              const paramsRec = buffers.get(pendingMul.params);
              if (aRec && bRec && outRec && paramsRec) {
                const len = Math.min(aRec.data.length, bRec.data.length, Math.floor(paramsRec.data[0] || aRec.data.length));
                for (let i = 0; i < len; i++) outRec.data[i] = aRec.data[i] * bRec.data[i];
              }
              pendingMul = null;
            }
          },
        }),
        copyBufferToBuffer(src: object, _so: number, dst: object, _do: number, size: number) {
          pendingCopy = { src, dst, size };
        },
        finish() {
          if (pendingCopy) {
            const srcRec = buffers.get(pendingCopy.src);
            const dstRec = buffers.get(pendingCopy.dst);
            if (srcRec && dstRec) {
              const floats = Math.max(1, Math.floor(pendingCopy.size / 4));
              dstRec.data.set(srcRec.data.subarray(0, floats));
            }
            pendingCopy = null;
          }
          return {};
        },
      };
    },
    queue: {
      writeBuffer(buf: object, _offset: number, data: ArrayBuffer, byteOffset: number, byteLength: number) {
        const rec = buffers.get(buf);
        if (!rec) return;
        const src = new Float32Array(data, byteOffset, Math.floor(byteLength / 4));
        rec.data = new Float32Array(src);
      },
      submit() {},
    },
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        requestAdapter: async () => ({
          requestDevice: async () => device,
        }),
      },
    },
    configurable: true,
    writable: true,
  });

  return device;
}

describe('GpuAgent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    try {
      // @ts-expect-error cleanup mock navigator
      delete globalThis.navigator;
    } catch {
      /* ignore */
    }
  });

  it('isWebGpuSupported returns boolean in node (false without navigator.gpu)', async () => {
    const ok = await GpuAgent.isWebGpuSupported();
    expect(typeof ok).toBe('boolean');
  });

  it('runs vector-sum on CPU fallback', async () => {
    const agent = new GpuAgent({ preferWebGpu: false, capabilities: ['vector-sum', 'echo'] });
    const result = await agent.runLocalTask({ type: 'vector-sum', input: { values: [1, 2, 3, 4] } });
    expect(result.error).toBeUndefined();
    expect(result.backend).toBe('cpu');
    expect(result.output).toEqual({ sum: 10 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs dot-product on CPU', async () => {
    const agent = new GpuAgent({ preferWebGpu: false });
    const result = await agent.runLocalTask({ type: 'dot-product', input: { a: [1, 2, 3], b: [4, 5, 6] } });
    expect(result.output).toEqual({ dot: 32 });
  });

  it('runs matrix-scale on CPU', async () => {
    const agent = new GpuAgent({ preferWebGpu: false });
    const result = await agent.runLocalTask({ type: 'matrix-scale', input: { values: [1, 2, 3], scale: 2 } });
    expect(result.output).toEqual({ values: [2, 4, 6] });
  });

  it('echo task returns payload', async () => {
    const agent = new GpuAgent();
    const result = await agent.runLocalTask({ type: 'echo', input: { message: 'hello' } });
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
    const bad = await agent.submitTask({ id: 'r1', type: 'echo', input: { message: 'x' }, peerId: 'remote-peer' });
    expect(bad.error).toMatch(/verification/i);
    const good = await agent.submitTask({
      id: 'r2', type: 'echo', input: { message: 'ok' }, peerId: 'remote-peer', signature: 'a'.repeat(16),
    });
    expect(good.error).toBeUndefined();
  });

  it('uses custom verifyTask', async () => {
    const agent = new GpuAgent({ preferWebGpu: false, verifyTask: (t) => t.signature === 'secret' });
    const denied = await agent.submitTask({ id: '1', type: 'echo', input: {}, peerId: 'p', signature: 'nope' });
    expect(denied.error).toBeTruthy();
    const allowed = await agent.submitTask({ id: '2', type: 'echo', input: { message: 'y' }, peerId: 'p', signature: 'secret' });
    expect(allowed.error).toBeUndefined();
  });

  it('offerWorkerCapacity updates max concurrency without throwing', async () => {
    const agent = new GpuAgent({ maxConcurrentTasks: 1 });
    await agent.offerWorkerCapacity({ maxConcurrentTasks: 3, capabilities: ['echo'] });
    expect(agent.getCapabilities()).toContain('echo');
  });

  it('returns error for unsupported task type', async () => {
    const agent = new GpuAgent({ preferWebGpu: false, capabilities: ['echo'] });
    const result = await agent.runLocalTask({ type: 'unknown-kernel', input: {} });
    expect(result.error).toMatch(/unsupported/i);
  });

  it('dot-product rejects unequal vector lengths', async () => {
    const agent = new GpuAgent({ preferWebGpu: false });
    const result = await agent.runLocalTask({ type: 'dot-product', input: { a: [1, 2], b: [1] } });
    expect(result.error).toMatch(/equal-length/i);
  });

  it('coerces non-array vector-sum input to empty sum on CPU', async () => {
    const agent = new GpuAgent({ preferWebGpu: false });
    const result = await agent.runLocalTask({ type: 'vector-sum', input: { values: 'not-an-array' as unknown as number[] } });
    expect(result.backend).toBe('cpu');
    expect(result.output).toEqual({ sum: 0 });
  });
});

describe('GpuAgent WebGPU kernels (mocked navigator.gpu)', () => {
  beforeEach(() => {
    installWebGpuMock();
  });

  afterEach(() => {
    try {
      // @ts-expect-error cleanup
      delete globalThis.navigator;
    } catch {
      /* ignore */
    }
  });

  it('isWebGpuSupported is true when navigator.gpu is mocked', async () => {
    expect(await GpuAgent.isWebGpuSupported()).toBe(true);
  });

  it('vector-sum uses webgpu backend with WGSL map-scale kernel', async () => {
    const agent = new GpuAgent({ preferWebGpu: true });
    const result = await agent.runLocalTask({ type: 'vector-sum', input: { values: [1, 2, 3, 4] } });
    expect(result.error).toBeUndefined();
    expect(result.backend).toBe('webgpu');
    expect(result.output).toEqual({ sum: 10 });
  });

  it('matrix-scale uses webgpu backend', async () => {
    const agent = new GpuAgent({ preferWebGpu: true });
    const result = await agent.runLocalTask({ type: 'matrix-scale', input: { values: [1.5, 2, -1], scale: 2 } });
    expect(result.error).toBeUndefined();
    expect(result.backend).toBe('webgpu');
    expect(result.output).toEqual({ values: [3, 4, -2] });
  });

  it('dot-product uses webgpu element-mul kernel', async () => {
    const agent = new GpuAgent({ preferWebGpu: true });
    const result = await agent.runLocalTask({ type: 'dot-product', input: { a: [1, 2, 3], b: [4, 5, 6] } });
    expect(result.error).toBeUndefined();
    expect(result.backend).toBe('webgpu');
    expect(result.output).toEqual({ dot: 32 });
  });

  it('falls back to CPU when WebGPU adapter request fails', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: { requestAdapter: async () => { throw new Error('adapter unavailable'); } } },
      configurable: true,
      writable: true,
    });
    const agent = new GpuAgent({ preferWebGpu: true });
    const result = await agent.runLocalTask({ type: 'vector-sum', input: { values: [10, 20] } });
    expect(result.backend).toBe('cpu');
    expect(result.output).toEqual({ sum: 30 });
  });

  it('empty vector-sum skips WebGPU and returns CPU zero', async () => {
    const agent = new GpuAgent({ preferWebGpu: true });
    const result = await agent.runLocalTask({ type: 'vector-sum', input: { values: [] } });
    expect(result.backend).toBe('cpu');
    expect(result.output).toEqual({ sum: 0 });
  });
});
