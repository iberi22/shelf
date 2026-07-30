import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GpuAgent } from '../src/gpu-agent';

// Mock WebGPU structures
class MockGPUBuffer {
  size: number;
  usage: number;
  data: Uint8Array;
  mapped = false;

  constructor(size: number, usage: number) {
    this.size = size;
    this.usage = usage;
    this.data = new Uint8Array(size);
  }

  destroy() {
    this.mapped = false;
  }

  async mapAsync(_mode: number) {
    this.mapped = true;
  }

  unmap() {
    this.mapped = false;
  }

  getMappedRange() {
    return this.data.buffer.slice(this.data.byteOffset, this.data.byteOffset + this.data.byteLength);
  }
}

class MockGPUComputePipeline {
  shaderCode: string;
  constructor(shaderCode: string) {
    this.shaderCode = shaderCode;
  }
  getBindGroupLayout(index: number) {
    return { index };
  }
}

class MockGPUBindGroup {
  entries: any[];
  constructor(entries: any[]) {
    this.entries = entries;
  }
}

class MockGPUCommandEncoder {
  copies: Array<{ src: MockGPUBuffer; dst: MockGPUBuffer; size: number }> = [];
  pass: any = null;

  beginComputePass() {
    this.pass = {
      pipeline: null,
      bindGroup: null,
      setPipeline(pipeline: any) {
        this.pipeline = pipeline;
      },
      setBindGroup(_index: number, bindGroup: any) {
        this.bindGroup = bindGroup;
      },
      dispatchWorkgroups(_x: number) {},
      end() {},
    };
    return this.pass;
  }

  copyBufferToBuffer(src: MockGPUBuffer, _srcOffset: number, dst: MockGPUBuffer, _dstOffset: number, size: number) {
    this.copies.push({ src, dst, size });
  }

  finish() {
    return {
      pass: this.pass,
      copies: this.copies,
    };
  }
}

class MockGPUDevice {
  queue = {
    writeBuffer(buffer: MockGPUBuffer, offset: number, data: any, srcOffset?: number, byteLength?: number) {
      let arrayBuffer: ArrayBuffer;
      let byteOffset = 0;
      let length = 0;

      if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
        byteOffset = srcOffset ?? 0;
        length = byteLength ?? data.byteLength;
      } else {
        arrayBuffer = data.buffer;
        byteOffset = (data.byteOffset ?? 0) + (srcOffset ?? 0);
        length = byteLength ?? data.byteLength;
      }

      const srcBytes = new Uint8Array(arrayBuffer, byteOffset, length);
      buffer.data.set(srcBytes, offset);
    },
    submit: (commandBuffers: any[]) => {
      for (const cmd of commandBuffers) {
        const pass = cmd.pass;
        if (!pass) continue;
        const pipeline: MockGPUComputePipeline = pass.pipeline;
        const bindGroup: MockGPUBindGroup = pass.bindGroup;
        if (!pipeline || !bindGroup) continue;

        // Perform simulation based on the shader code
        if (pipeline.shaderCode.includes('shared_data') && pipeline.shaderCode.includes('input')) {
          // vector-sum
          const inputBuf = bindGroup.entries.find((e) => e.binding === 0).resource.buffer as MockGPUBuffer;
          const outputBuf = bindGroup.entries.find((e) => e.binding === 1).resource.buffer as MockGPUBuffer;
          const sizeBuf = bindGroup.entries.find((e) => e.binding === 2).resource.buffer as MockGPUBuffer;

          const size = new Uint32Array(sizeBuf.data.buffer, sizeBuf.data.byteOffset, 1)[0];
          const inputData = new Float32Array(inputBuf.data.buffer, inputBuf.data.byteOffset, size);

          const workgroupSize = 128;
          const numWorkgroups = Math.ceil(size / workgroupSize) || 1;
          const outputData = new Float32Array(outputBuf.data.buffer, outputBuf.data.byteOffset, numWorkgroups);

          for (let wg = 0; wg < numWorkgroups; wg++) {
            let sum = 0;
            for (let i = 0; i < workgroupSize; i++) {
              const idx = wg * workgroupSize + i;
              if (idx < size) {
                sum += inputData[idx];
              }
            }
            outputData[wg] = sum;
          }
        } else if (pipeline.shaderCode.includes('shared_data') && pipeline.shaderCode.includes('a[g_id]')) {
          // dot-product
          const aBuf = bindGroup.entries.find((e) => e.binding === 0).resource.buffer as MockGPUBuffer;
          const bBuf = bindGroup.entries.find((e) => e.binding === 1).resource.buffer as MockGPUBuffer;
          const outputBuf = bindGroup.entries.find((e) => e.binding === 2).resource.buffer as MockGPUBuffer;
          const sizeBuf = bindGroup.entries.find((e) => e.binding === 3).resource.buffer as MockGPUBuffer;

          const size = new Uint32Array(sizeBuf.data.buffer, sizeBuf.data.byteOffset, 1)[0];
          const aData = new Float32Array(aBuf.data.buffer, aBuf.data.byteOffset, size);
          const bData = new Float32Array(bBuf.data.buffer, bBuf.data.byteOffset, size);

          const workgroupSize = 128;
          const numWorkgroups = Math.ceil(size / workgroupSize) || 1;
          const outputData = new Float32Array(outputBuf.data.buffer, outputBuf.data.byteOffset, numWorkgroups);

          for (let wg = 0; wg < numWorkgroups; wg++) {
            let sum = 0;
            for (let i = 0; i < workgroupSize; i++) {
              const idx = wg * workgroupSize + i;
              if (idx < size) {
                sum += aData[idx] * bData[idx];
              }
            }
            outputData[wg] = sum;
          }
        } else if (pipeline.shaderCode.includes('values[i] = values[i] * params.x')) {
          // matrix-scale
          const valueBuf = bindGroup.entries.find((e) => e.binding === 0).resource.buffer as MockGPUBuffer;
          const paramsBuf = bindGroup.entries.find((e) => e.binding === 1).resource.buffer as MockGPUBuffer;

          const params = new Float32Array(paramsBuf.data.buffer, paramsBuf.data.byteOffset, 2);
          const scale = params[0];
          const length = params[1];

          const valueData = new Float32Array(valueBuf.data.buffer, valueBuf.data.byteOffset, length);
          for (let i = 0; i < length; i++) {
            valueData[i] = valueData[i] * scale;
          }
        }

        // Apply copying of results from GPU buffer simulations
        for (const copy of cmd.copies) {
          copy.dst.data.set(copy.src.data.subarray(0, copy.size));
        }
      }
    },
  };

  createBuffer(desc: { size: number; usage: number }) {
    return new MockGPUBuffer(desc.size, desc.usage);
  }

  createShaderModule(desc: { code: string }) {
    return { code: desc.code };
  }

  createComputePipeline(desc: any) {
    return new MockGPUComputePipeline(desc.compute.module.code);
  }

  createBindGroup(desc: any) {
    return new MockGPUBindGroup(desc.entries);
  }

  createCommandEncoder() {
    return new MockGPUCommandEncoder();
  }
}

describe('GpuAgent', () => {
  let originalNavigator: any;

  beforeEach(() => {
    originalNavigator = globalThis.navigator;
  });

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    } else {
      // @ts-expect-error
      delete globalThis.navigator;
    }
  });

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

  describe('WebGPU real execution path', () => {
    beforeEach(() => {
      const mockGpu = {
        requestAdapter: async () => {
          return {
            requestDevice: async () => new MockGPUDevice(),
          };
        },
      };
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          ...originalNavigator,
          gpu: mockGpu,
        },
        configurable: true,
        writable: true,
      });
    });

    it('executes vector-sum with WebGPU when navigator.gpu is available', async () => {
      const agent = new GpuAgent({ preferWebGpu: true });
      const result = await agent.runLocalTask({
        type: 'vector-sum',
        input: { values: [1.5, 2.5, 3.5, 4.5] },
      });
      expect(result.error).toBeUndefined();
      expect(result.backend).toBe('webgpu');
      expect((result.output as { sum: number }).sum).toBeCloseTo(12.0);
    });

    it('executes dot-product with WebGPU when navigator.gpu is available', async () => {
      const agent = new GpuAgent({ preferWebGpu: true });
      const result = await agent.runLocalTask({
        type: 'dot-product',
        input: { a: [1.0, 2.0, 3.0], b: [4.0, 5.0, 6.0] },
      });
      expect(result.error).toBeUndefined();
      expect(result.backend).toBe('webgpu');
      expect((result.output as { dot: number }).dot).toBeCloseTo(32.0);
    });

    it('executes matrix-scale with WebGPU when navigator.gpu is available', async () => {
      const agent = new GpuAgent({ preferWebGpu: true });
      const result = await agent.runLocalTask({
        type: 'matrix-scale',
        input: { values: [1.0, 2.0, 3.0], scale: 2.5 },
      });
      expect(result.error).toBeUndefined();
      expect(result.backend).toBe('webgpu');
      expect((result.output as { values: number[] }).values).toEqual([2.5, 5.0, 7.5]);
    });

    it('falls back to CPU when adapter request fails', async () => {
      const mockGpu = {
        requestAdapter: async () => null,
      };
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          ...originalNavigator,
          gpu: mockGpu,
        },
        configurable: true,
        writable: true,
      });

      const agent = new GpuAgent({ preferWebGpu: true });
      const result = await agent.runLocalTask({
        type: 'vector-sum',
        input: { values: [1, 2, 3] },
      });
      expect(result.error).toBeUndefined();
      expect(result.backend).toBe('cpu');
      expect((result.output as { sum: number }).sum).toBe(6);
    });
  });
});
