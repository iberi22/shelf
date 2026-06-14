import { EdgeMesh } from 'edge-mesh';

export interface Task {
  id: string;
  type: string;
  input: any;
  peerId: string;
  signature?: string;
}

export interface TaskResult {
  taskId: string;
  output: any;
  error?: string;
}

export interface GpuAgentConfig {
  mesh: EdgeMesh;
  capabilities: string[];
  maxConcurrentTasks?: number;
}

export class GpuAgent {
  private mesh: EdgeMesh;
  private capabilities: Set<string>;
  private maxConcurrentTasks: number;
  private runningTasks = 0;
  private taskQueue: Task[] = [];

  constructor(config: GpuAgentConfig) {
    this.mesh = config.mesh;
    this.capabilities = new Set(config.capabilities);
    this.maxConcurrentTasks = config.maxConcurrentTasks || 1;
  }

  public static async isWebGpuSupported(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      return false;
    }
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      return !!adapter;
    } catch (e) {
      return false;
    }
  }

  public async runLocalTask(task: Omit<Task, 'peerId' | 'id'>): Promise<any> {
    const fullTask: Task = {
      ...task,
      id: Math.random().toString(36).substr(2, 9),
      peerId: 'local',
    };

    return this.executeTask(fullTask);
  }

  public async offerWorkerCapacity(capacity: { maxConcurrentTasks: number }) {
    this.maxConcurrentTasks = capacity.maxConcurrentTasks;
    // In a real implementation, this would broadcast capacity to the mesh
  }

  private async executeTask(task: Task): Promise<any> {
    if (this.runningTasks >= this.maxConcurrentTasks) {
      return new Promise((resolve, reject) => {
        this.taskQueue.push(task);
        // Simplified queueing logic
      });
    }

    this.runningTasks++;
    try {
      // Mock execution - in reality, this would use WebLLM or WebGPU
      console.log(`Executing task ${task.id} of type ${task.type}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { status: 'success', result: `Mock output for ${task.type}` };
    } finally {
      this.runningTasks--;
      this.processQueue();
    }
  }

  private processQueue() {
    if (this.taskQueue.length > 0 && this.runningTasks < this.maxConcurrentTasks) {
      const nextTask = this.taskQueue.shift()!;
      this.executeTask(nextTask);
    }
  }

  // Security: check if remote peer is authorized to run this task
  private async verifyTask(task: Task): Promise<boolean> {
    if (!task.signature) return false;
    // Placeholder for signature verification (ML-DSA-65)
    return true;
  }
}
