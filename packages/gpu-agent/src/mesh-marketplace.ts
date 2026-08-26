/**
 * GpuMeshMarketplace — SHELF-112 extension.
 *
 * Wire a GpuAgent into an EdgeMesh node as a compute marketplace participant:
 *  - announceCapacity()  → broadcasts available compute (GPU_CAPACITY)
 *  - requestTask()       → broadcasts a compute request and awaits a peer result
 *  - acceptTask()        → processes a received compute request locally
 *
 * Peers' capacity announcements are tracked per node so requesters can pick a
 * worker that advertised the needed capability.
 */

import type { EdgeMesh, Envolvente } from 'edge-mesh';
import { TIPO_MENSAJE } from 'edge-mesh';
import type {
  CapacityAnnouncement,
  GpuAgent,
  Task,
  TaskRequestEnvelope,
  TaskResult,
  TaskResultEnvelope,
} from './gpu-agent.js';

/** SHELF-112: registry of peer capacity announcements. */
export interface PeerCapacity {
  readonly nodoId: string;
  readonly capacidad: CapacityAnnouncement;
}

export class GpuMeshMarketplace {
  private readonly capacidadesPorNodo = new Map<string, CapacityAnnouncement>();
  private readonly desuscripcion: () => void;

  constructor(
    private readonly agente: GpuAgent,
    private readonly mesh: EdgeMesh,
  ) {
    const handler = (ev: CustomEvent<{ envolvente: Envolvente }>) => {
      void this.procesarEnvolvente(ev.detail.envolvente);
    };
    this.mesh.on('mensajeRecibido', handler);
    this.desuscripcion = () => this.mesh.off('mensajeRecibido', handler);
  }

  /** SHELF-112: broadcast local compute capacity to the mesh. */
  async anunciarCapacidad(capacity?: { maxConcurrentTasks?: number; capabilities?: string[] }): Promise<void> {
    await this.agente.announceCapacity(capacity);
  }

  /** SHELF-112: request remote compute and await a peer result. */
  solicitarTarea(task: Omit<Task, 'peerId'>, timeoutMs?: number): Promise<TaskResult> {
    return this.agente.requestTask(task, timeoutMs);
  }

  /** SHELF-112: process a compute request received from a peer. */
  aceptarTarea(task: Task): Promise<TaskResult> {
    return this.agente.acceptTask(task);
  }

  /** SHELF-112: peers that announced capacity (worker registry). */
  obtenerPeersConCapacidad(): readonly PeerCapacity[] {
    return Array.from(this.capacidadesPorNodo.entries()).map(([nodoId, capacidad]) => ({
      nodoId,
      capacidad,
    }));
  }

  /** Find peers advertising a given task type. */
  obtenerPeersParaTipo(tipo: string): readonly PeerCapacity[] {
    return this.obtenerPeersConCapacidad().filter((peer) => peer.capacidad.capabilities.includes(tipo));
  }

  /** Remove the mesh listener (call on teardown). */
  detener(): void {
    this.desuscripcion();
  }

  private async procesarEnvolvente(env: Envolvente): Promise<void> {
    if (env.destino !== '*' && env.destino !== this.mesh.config.nodoId) return;

    switch (env.tipo) {
      case TIPO_MENSAJE.GPU_CAPACITY:
        this.capacidadesPorNodo.set(env.origen, env.payload as CapacityAnnouncement);
        break;
      case TIPO_MENSAJE.GPU_TASK_REQUEST: {
        const payload = env.payload as TaskRequestEnvelope;
        const tarea: Task = { ...payload.task, peerId: env.origen };
        await this.agente.acceptTask(tarea);
        break;
      }
      case TIPO_MENSAJE.GPU_TASK_RESULT:
        await this.agente.resolverResultado(env.payload as TaskResultEnvelope);
        break;
      default:
        break;
    }
  }
}
