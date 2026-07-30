/**
 * GpuAgent — edge compute helper (WebGPU when available, CPU fallback).
 * Not a full mesh LLM: WebLLM stays in the app. This package runs typed numeric tasks
 * and optional mesh capacity announcements via EdgeMesh.
 */

import type { EdgeMesh } from 'edge-mesh';

export type TaskType = 'vector-sum' | 'dot-product' | 'matrix-scale' | 'echo' | string;

export interface Task {
  id: string;
  type: TaskType;
  input: unknown;
  peerId: string;
  /** Optional opaque signature / proof (verified via config.verifyTask if set). */
  signature?: string;
}

export interface TaskResult {
  taskId: string;
  type: TaskType;
  backend: 'webgpu' | 'cpu';
  output: unknown;
  error?: string;
  durationMs: number;
}

export type TaskVerifier = (task: Task) => boolean | Promise<boolean>;

export interface GpuAgentConfig {
  /** Optional mesh for capacity / future remote dispatch. */
  mesh?: EdgeMesh | null;
  capabilities?: string[];
  maxConcurrentTasks?: number;
  /** When true (default), prefer WebGPU for numeric kernels when supported. */
  preferWebGpu?: boolean;
  /** Optional verifier for remote tasks (signature / mesh authz). */
  verifyTask?: TaskVerifier;
}

export interface VectorSumInput {
  values: number[];
}

export interface DotProductInput {
  a: number[];
  b: number[];
}

export interface MatrixScaleInput {
  values: number[];
  scale: number;
}

export interface EchoInput {
  message?: string;
  [key: string]: unknown;
}

export class GpuAgent {
  private mesh: EdgeMesh | null;
  private capabilities: Set<string>;
  private maxConcurrentTasks: number;
  private preferWebGpu: boolean;
  private verifyTaskFn: TaskVerifier | null;
  private runningTasks = 0;
  private taskQueue: Array<{
    task: Task;
    resolve: (r: TaskResult) => void;
    reject: (e: unknown) => void;
  }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private device: any = null;
  private deviceInit: Promise<any | null> | null = null;

  constructor(config: GpuAgentConfig = {}) {
    this.mesh = config.mesh ?? null;
    this.capabilities = new Set(config.capabilities ?? ['vector-sum', 'dot-product', 'matrix-scale', 'echo']);
    this.maxConcurrentTasks = config.maxConcurrentTasks ?? 1;
    this.preferWebGpu = config.preferWebGpu !== false;
    this.verifyTaskFn = config.verifyTask ?? null;
  }

  public static async isWebGpuSupported(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      return false;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  }

  public getCapabilities(): string[] {
    return Array.from(this.capabilities);
  }

  public async runLocalTask(task: Omit<Task, 'peerId' | 'id'> & { id?: string }): Promise<TaskResult> {
    const fullTask: Task = {
      ...task,
      id: task.id ?? `task_${Math.random().toString(36).slice(2, 11)}`,
      peerId: 'local',
    };
    return this.enqueueTask(fullTask);
  }

  /**
   * Queue or run a task (local or remote). Remote tasks require verifyTask to pass.
   */
  public async submitTask(task: Task): Promise<TaskResult> {
    if (task.peerId !== 'local') {
      const ok = await this.verifyTask(task);
      if (!ok) {
        return {
          taskId: task.id,
          type: task.type,
          backend: 'cpu',
          output: null,
          error: 'Task verification failed',
          durationMs: 0,
        };
      }
    }
    return this.enqueueTask(task);
  }

  /**
   * Announce worker capacity on the mesh (best-effort transmit).
   */
  public async offerWorkerCapacity(capacity: { maxConcurrentTasks: number; capabilities?: string[] }): Promise<void> {
    this.maxConcurrentTasks = capacity.maxConcurrentTasks;
    if (capacity.capabilities) {
      this.capabilities = new Set(capacity.capabilities);
    }
    if (!this.mesh) return;
    try {
      await this.mesh.transmitir(
        {
          type: 'gpu-agent.capacity',
          maxConcurrentTasks: this.maxConcurrentTasks,
          capabilities: this.getCapabilities(),
          timestamp: Date.now(),
        },
        // HEARTBEAT-like free-form payload; mesh accepts unknown as payload
        'HEARTBEAT' as never,
      );
    } catch {
      // Mesh optional — ignore transmit failures
    }
  }

  private enqueueTask(task: Task): Promise<TaskResult> {
    if (this.runningTasks >= this.maxConcurrentTasks) {
      return new Promise((resolve, reject) => {
        this.taskQueue.push({ task, resolve, reject });
      });
    }
    return this.runTaskNow(task);
  }

  private async runTaskNow(task: Task): Promise<TaskResult> {
    this.runningTasks++;
    const started = Date.now();
    try {
      if (!this.capabilities.has(task.type) && task.type !== 'echo') {
        // Allow echo always; other unknown types fail closed
        if (!this.capabilities.has('*')) {
          return {
            taskId: task.id,
            type: task.type,
            backend: 'cpu',
            output: null,
            error: `Unsupported task type: ${task.type}`,
            durationMs: Date.now() - started,
          };
        }
      }
      const { output, backend } = await this.executeTask(task);
      return {
        taskId: task.id,
        type: task.type,
        backend,
        output,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      return {
        taskId: task.id,
        type: task.type,
        backend: 'cpu',
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      };
    } finally {
      this.runningTasks--;
      this.processQueue();
    }
  }

  private processQueue() {
    while (this.taskQueue.length > 0 && this.runningTasks < this.maxConcurrentTasks) {
      const next = this.taskQueue.shift();
      if (!next) break;
      void this.runTaskNow(next.task).then(next.resolve, next.reject);
    }
  }

  private async executeTask(task: Task): Promise<{ output: unknown; backend: 'webgpu' | 'cpu' }> {
    switch (task.type) {
      case 'vector-sum': {
        const input = task.input as VectorSumInput;
        const values = coerceNumberArray(input?.values);
        if (this.preferWebGpu) {
          const gpu = await this.tryWebGpuVectorSum(values);
          if (gpu !== null) return { output: { sum: gpu }, backend: 'webgpu' };
        }
        return { output: { sum: cpuSum(values) }, backend: 'cpu' };
      }
      case 'dot-product': {
        const input = task.input as DotProductInput;
        const a = coerceNumberArray(input?.a);
        const b = coerceNumberArray(input?.b);
        if (a.length !== b.length) {
          throw new Error('dot-product requires equal-length vectors');
        }
        if (this.preferWebGpu) {
          const gpu = await this.tryWebGpuDotProduct(a, b);
          if (gpu !== null) return { output: { dot: gpu }, backend: 'webgpu' };
        }
        return { output: { dot: cpuDot(a, b) }, backend: 'cpu' };
      }
      case 'matrix-scale': {
        const input = task.input as MatrixScaleInput;
        const values = coerceNumberArray(input?.values);
        const scale = Number(input?.scale ?? 1);
        if (this.preferWebGpu) {
          const gpu = await this.tryWebGpuScale(values, scale);
          if (gpu !== null) return { output: { values: gpu }, backend: 'webgpu' };
        }
        return {
          output: { values: values.map((v) => v * scale) },
          backend: 'cpu',
        };
      }
      case 'echo': {
        const input = (task.input ?? {}) as EchoInput;
        return {
          output: {
            echo: input.message ?? input,
            peerId: task.peerId,
            at: new Date().toISOString(),
          },
          backend: 'cpu',
        };
      }
      default:
        throw new Error(`No kernel registered for task type: ${task.type}`);
    }
  }

  private async verifyTask(task: Task): Promise<boolean> {
    if (this.verifyTaskFn) {
      return this.verifyTaskFn(task);
    }
    // Default: require a non-empty signature for remote tasks (app can tighten)
    return typeof task.signature === 'string' && task.signature.length >= 16;
  }

  private async getDevice(): Promise<any | null> {
    if (this.device) return this.device;
    if (this.deviceInit) return this.deviceInit;
    this.deviceInit = (async () => {
      if (!(await GpuAgent.isWebGpuSupported())) return null;
      try {
        const nav = globalThis.navigator as { gpu?: { requestAdapter: () => Promise<any> } };
        const adapter = await nav.gpu?.requestAdapter();
        if (!adapter) return null;
        this.device = await adapter.requestDevice();
        return this.device;
      } catch {
        return null;
      }
    })();
    return this.deviceInit;
  }

  private async tryWebGpuVectorSum(values: number[]): Promise<number | null> {
    const device = await this.getDevice();
    if (!device || values.length === 0) return null;
    try {
      const data = new Float32Array(values);
      const result = await this.webGpuVectorSum(device, data);
      if (!result) return null;
      return cpuSum(Array.from(result));
    } catch {
      return null;
    }
  }

  private async tryWebGpuDotProduct(a: number[], b: number[]): Promise<number | null> {
    const device = await this.getDevice();
    if (!device || a.length === 0) return null;
    try {
      const result = await this.webGpuDotProduct(device, new Float32Array(a), new Float32Array(b));
      if (!result) return null;
      return cpuSum(Array.from(result));
    } catch {
      return null;
    }
  }

  private async tryWebGpuScale(values: number[], scale: number): Promise<number[] | null> {
    const device = await this.getDevice();
    if (!device) return null;
    try {
      const out = await this.webGpuMapScale(device, new Float32Array(values), scale);
      return out ? Array.from(out) : null;
    } catch {
      return null;
    }
  }

  /** WebGPU usage flags as numbers to avoid DOM lib type conflicts. */
  private async webGpuVectorSum(device: any, data: Float32Array): Promise<Float32Array | null> {
    const STORAGE = 0x80;
    const COPY_DST = 0x8;
    const COPY_SRC = 0x4;
    const UNIFORM = 0x40;
    const MAP_READ = 0x1;
    const workgroupSize = 128;

    const shader = `
      @group(0) @binding(0) var<storage, read> input: array<f32>;
      @group(0) @binding(1) var<storage, read_write> output: array<f32>;
      @group(0) @binding(2) var<uniform> size: u32;

      var<workgroup> shared_data: array<f32, ${workgroupSize}>;

      @compute @workgroup_size(${workgroupSize})
      fn main(
        @builtin(global_invocation_id) global_id: vec3<u32>,
        @builtin(local_invocation_id) local_id: vec3<u32>,
        @builtin(workgroup_id) wg_id: vec3<u32>
      ) {
        let g_id = global_id.x;
        let l_id = local_id.x;

        if (g_id < size) {
          shared_data[l_id] = input[g_id];
        } else {
          shared_data[l_id] = 0.0;
        }

        workgroupBarrier();

        for (var s = ${workgroupSize / 2}u; s > 0u; s = s >> 1u) {
          if (l_id < s) {
            shared_data[l_id] = shared_data[l_id] + shared_data[l_id + s];
          }
          workgroupBarrier();
        }

        if (l_id == 0u) {
          output[wg_id.x] = shared_data[0];
        }
      }
    `;

    const module = device.createShaderModule({ code: shader });
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });

    const inputBuffer = device.createBuffer({
      size: Math.max(4, data.byteLength),
      usage: STORAGE | COPY_DST,
    });
    device.queue.writeBuffer(inputBuffer, 0, data.buffer, data.byteOffset, data.byteLength);

    const numWorkgroups = Math.ceil(data.length / workgroupSize) || 1;
    const outputBuffer = device.createBuffer({
      size: numWorkgroups * 4,
      usage: STORAGE | COPY_SRC,
    });

    const sizeData = new Uint32Array([data.length, 0, 0, 0]);
    const sizeBuffer = device.createBuffer({
      size: 16,
      usage: UNIFORM | COPY_DST,
    });
    device.queue.writeBuffer(sizeBuffer, 0, sizeData.buffer, sizeData.byteOffset, sizeData.byteLength);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
        { binding: 2, resource: { buffer: sizeBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(numWorkgroups);
    pass.end();

    const readBuffer = device.createBuffer({
      size: numWorkgroups * 4,
      usage: COPY_DST | MAP_READ,
    });
    encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, numWorkgroups * 4);
    device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(MAP_READ);
    const copy = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    inputBuffer.destroy();
    outputBuffer.destroy();
    sizeBuffer.destroy();
    readBuffer.destroy();
    return copy;
  }

  private async webGpuDotProduct(device: any, a: Float32Array, b: Float32Array): Promise<Float32Array | null> {
    const STORAGE = 0x80;
    const COPY_DST = 0x8;
    const COPY_SRC = 0x4;
    const UNIFORM = 0x40;
    const MAP_READ = 0x1;
    const workgroupSize = 128;

    const shader = `
      @group(0) @binding(0) var<storage, read> a: array<f32>;
      @group(0) @binding(1) var<storage, read> b: array<f32>;
      @group(0) @binding(2) var<storage, read_write> output: array<f32>;
      @group(0) @binding(3) var<uniform> size: u32;

      var<workgroup> shared_data: array<f32, ${workgroupSize}>;

      @compute @workgroup_size(${workgroupSize})
      fn main(
        @builtin(global_invocation_id) global_id: vec3<u32>,
        @builtin(local_invocation_id) local_id: vec3<u32>,
        @builtin(workgroup_id) wg_id: vec3<u32>
      ) {
        let g_id = global_id.x;
        let l_id = local_id.x;

        if (g_id < size) {
          shared_data[l_id] = a[g_id] * b[g_id];
        } else {
          shared_data[l_id] = 0.0;
        }

        workgroupBarrier();

        for (var s = ${workgroupSize / 2}u; s > 0u; s = s >> 1u) {
          if (l_id < s) {
            shared_data[l_id] = shared_data[l_id] + shared_data[l_id + s];
          }
          workgroupBarrier();
        }

        if (l_id == 0u) {
          output[wg_id.x] = shared_data[0];
        }
      }
    `;

    const module = device.createShaderModule({ code: shader });
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });

    const aBuffer = device.createBuffer({
      size: Math.max(4, a.byteLength),
      usage: STORAGE | COPY_DST,
    });
    device.queue.writeBuffer(aBuffer, 0, a.buffer, a.byteOffset, a.byteLength);

    const bBuffer = device.createBuffer({
      size: Math.max(4, b.byteLength),
      usage: STORAGE | COPY_DST,
    });
    device.queue.writeBuffer(bBuffer, 0, b.buffer, b.byteOffset, b.byteLength);

    const numWorkgroups = Math.ceil(a.length / workgroupSize) || 1;
    const outputBuffer = device.createBuffer({
      size: numWorkgroups * 4,
      usage: STORAGE | COPY_SRC,
    });

    const sizeData = new Uint32Array([a.length, 0, 0, 0]);
    const sizeBuffer = device.createBuffer({
      size: 16,
      usage: UNIFORM | COPY_DST,
    });
    device.queue.writeBuffer(sizeBuffer, 0, sizeData.buffer, sizeData.byteOffset, sizeData.byteLength);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: aBuffer } },
        { binding: 1, resource: { buffer: bBuffer } },
        { binding: 2, resource: { buffer: outputBuffer } },
        { binding: 3, resource: { buffer: sizeBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(numWorkgroups);
    pass.end();

    const readBuffer = device.createBuffer({
      size: numWorkgroups * 4,
      usage: COPY_DST | MAP_READ,
    });
    encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, numWorkgroups * 4);
    device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(MAP_READ);
    const copy = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    aBuffer.destroy();
    bBuffer.destroy();
    outputBuffer.destroy();
    sizeBuffer.destroy();
    readBuffer.destroy();
    return copy;
  }

  private async webGpuMapScale(device: any, data: Float32Array, scale: number): Promise<Float32Array | null> {
    const STORAGE = 0x80;
    const COPY_DST = 0x8;
    const COPY_SRC = 0x4;
    const UNIFORM = 0x40;
    const MAP_READ = 0x1;
    const workgroupSize = 64;
    const shader = `
      @group(0) @binding(0) var<storage, read_write> values: array<f32>;
      @group(0) @binding(1) var<uniform> params: vec4<f32>;
      @compute @workgroup_size(${workgroupSize})
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        let i = id.x;
        if (i >= u32(params.y)) { return; }
        values[i] = values[i] * params.x;
      }
    `;
    const module = device.createShaderModule({ code: shader });
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });

    const valueBuffer = device.createBuffer({
      size: Math.max(4, data.byteLength),
      usage: STORAGE | COPY_DST | COPY_SRC,
    });
    device.queue.writeBuffer(valueBuffer, 0, data.buffer, data.byteOffset, data.byteLength);

    const paramsData = new Float32Array([scale, data.length, 0, 0]);
    const paramsBuffer = device.createBuffer({
      size: 16,
      usage: UNIFORM | COPY_DST,
    });
    device.queue.writeBuffer(paramsBuffer, 0, paramsData.buffer, paramsData.byteOffset, paramsData.byteLength);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: valueBuffer } },
        { binding: 1, resource: { buffer: paramsBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(data.length / workgroupSize) || 1);
    pass.end();

    const readBuffer = device.createBuffer({
      size: Math.max(4, data.byteLength),
      usage: COPY_DST | MAP_READ,
    });
    encoder.copyBufferToBuffer(valueBuffer, 0, readBuffer, 0, data.byteLength || 4);
    device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(MAP_READ);
    const copy = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    valueBuffer.destroy();
    paramsBuffer.destroy();
    readBuffer.destroy();
    return copy.subarray(0, data.length);
  }
}

function coerceNumberArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
}

function cpuSum(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

function cpuDot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
