import type { OpLog } from '../op-log/index.js';
import type { NodoId } from '../types/index.js';

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

const MAX_BATCH_SIZE = 500 as const;
const TIEMPO_ESPERA_SYNC_MS = 2_000 as const;
/** SHELF-111: grace period for nodes that still emit unsigned CRDT envelopes. */
const GRACIA_FIRMA_DEFAULT_MS = 7 * 24 * 60 * 60 * 1_000;
/** SHELF-111: enforcement clock starts at rollout (2026-08-26T00:00:00Z). */
const INICIO_ENFORCEMENT_FIRMA_DEFAULT_MS = Date.UTC(2026, 7, 26);

// ─── SYNC ENGINE ───────────────────────────────────────────────────────────

export type SyncDirection = 'bidireccional' | 'entrante' | 'saliente';

export interface SyncEngineConfig {
  readonly docId: string;
  readonly opLog: OpLog;
  readonly batchSize?: number;
  readonly timeoutMs?: number;
  readonly direction?: SyncDirection;
  /**
   * SHELF-111: when true (default), received CRDT operations must carry a
   * signature (`firma`). Unsigned operations are logged during the grace period
   * (`signedEnvelopeGracePeriodMs` starting at `signedEnvelopeEnforcementStartMs`)
   * and hard-rejected afterwards with a clear error.
   */
  readonly requireSignedEnvelopes?: boolean;
  /** Grace window for unsigned envelopes (default: 7 days). */
  readonly signedEnvelopeGracePeriodMs?: number;
  /** Envelope-enforcement start timestamp (default: SHELF-111 rollout 2026-08-26). */
  readonly signedEnvelopeEnforcementStartMs?: number;
  /** Optional signature verifier for operations that carry a `firma`. */
  readonly verificarFirma?: (op: unknown) => boolean | Promise<boolean>;
}

export interface SyncResult {
  readonly docId: string;
  readonly operacionesEnviadas: number;
  readonly operacionesRecibidas: number;
  readonly conflictos: number;
  /** SHELF-111: operations rejected for missing/invalid envelope signature. */
  readonly operacionesRechazadas: number;
  readonly duracionMs: number;
  readonly exito: boolean;
}

export interface SyncEngineEventMap {
  syncIniciado: CustomEvent<{
    readonly docId: string;
    readonly peerId: NodoId;
    readonly direction: SyncDirection;
  }>;
  syncCompletado: CustomEvent<{
    readonly resultado: SyncResult;
    readonly peerId: NodoId;
  }>;
  syncError: CustomEvent<{
    readonly docId: string;
    readonly peerId: NodoId;
    readonly error: string;
  }>;
  conflictoDetectado: CustomEvent<{
    readonly docId: string;
    readonly operacionLocal: unknown;
    readonly operacionRemota: unknown;
  }>;
  /** SHELF-111: unsigned envelope accepted during grace period (logged, allowed). */
  envelopeSinFirma: CustomEvent<{
    readonly docId: string;
    readonly peerId: NodoId;
    readonly secuencia: number;
    readonly autor: string;
  }>;
  /** SHELF-111: unsigned/invalid envelope hard-rejected after grace period. */
  envelopeRechazado: CustomEvent<{
    readonly docId: string;
    readonly peerId: NodoId;
    readonly secuencia: number;
    readonly autor: string;
    readonly motivo: 'firma-ausente' | 'firma-invalida';
  }>;
}

export class SyncEngine {
  readonly eventTarget: EventTarget;
  readonly docId: string;
  private readonly opLog: OpLog;
  private readonly batchSize: number;
  private readonly timeoutMs: number;
  private readonly _direction: SyncDirection;
  private readonly requireSignedEnvelopes: boolean;
  private readonly signedEnvelopeGracePeriodMs: number;
  private readonly signedEnvelopeEnforcementStartMs: number;
  private readonly verificarFirmaFn: ((op: unknown) => boolean | Promise<boolean>) | null;
  private sincronizando: boolean = false;
  private clockLocal: number = 0;
  private readonly clocksRemotos: Map<NodoId, number>;

  constructor(config: SyncEngineConfig) {
    this.eventTarget = new EventTarget();
    this.docId = config.docId;
    this.opLog = config.opLog;
    this.batchSize = config.batchSize ?? MAX_BATCH_SIZE;
    this.timeoutMs = config.timeoutMs ?? TIEMPO_ESPERA_SYNC_MS;
    this._direction = config.direction ?? 'bidireccional';
    this.requireSignedEnvelopes = config.requireSignedEnvelopes !== false;
    this.signedEnvelopeGracePeriodMs = config.signedEnvelopeGracePeriodMs ?? GRACIA_FIRMA_DEFAULT_MS;
    this.signedEnvelopeEnforcementStartMs =
      config.signedEnvelopeEnforcementStartMs ?? INICIO_ENFORCEMENT_FIRMA_DEFAULT_MS;
    this.verificarFirmaFn = config.verificarFirma ?? null;
    this.clocksRemotos = new Map();
  }

  // ─── SYNC ────────────────────────────────────────────────────────────

  async sincronizar(
    peerId: NodoId,
    enviar: (ops: readonly unknown[]) => Promise<void>,
    recibir: () => Promise<readonly unknown[]>,
  ): Promise<SyncResult> {
    if (this.sincronizando) {
      throw new Error('Sync en progreso para este documento');
    }

    this.sincronizando = true;
    const inicio = Date.now();

    this.emit('syncIniciado', {
      docId: this.docId,
      peerId,
      direction: this._direction,
    });

    try {
      let operacionesEnviadas = 0;
      let operacionesRecibidas = 0;
      let conflictos = 0;
      let operacionesRechazadas = 0;

      // Fase 1: Enviar nuestras operaciones
      if (this._direction === 'bidireccional' || this._direction === 'saliente') {
        const clockRemoto = this.clocksRemotos.get(peerId) ?? 0;
        const pendientes = await this.opLog.obtenerDesde(clockRemoto);

        const batches: (readonly unknown[])[] = [];
        for (let i = 0; i < pendientes.length; i += this.batchSize) {
          batches.push(pendientes.slice(i, i + this.batchSize));
        }

        for (const batch of batches) {
          await enviar(batch);
          operacionesEnviadas += batch.length;
        }
      }

      // Fase 2: Recibir operaciones remotas
      if (this._direction === 'bidireccional' || this._direction === 'entrante') {
        const operacionesRemotas = await recibir();
        const validadas = operacionesRemotas.filter(esOperacionValida);

        // SHELF-111: signed-envelope gate. Unsigned ops are allowed (with warning)
        // during the grace period and hard-rejected once it expires.
        const { admitidas, rechazadas } = await this.admitirEnvolventesFirmadas(peerId, validadas);
        operacionesRechazadas += rechazadas;

        for (const opRaw of admitidas) {
          const op = opRaw as { secuencia: number; id: string };
          const clockLocal = this.opLog.obtenerUltimaSecuencia();

          if (op.secuencia <= clockLocal) {
            conflictos++;
            this.emit('conflictoDetectado', {
              docId: this.docId,
              operacionLocal: op,
              operacionRemota: op,
            });
          }
        }

        const aplicadas = await this.opLog.aplicarOperaciones(admitidas as never);
        operacionesRecibidas += aplicadas;

        // Actualizar clock del peer
        if (admitidas.length > 0) {
          const ultimaOp = admitidas[admitidas.length - 1] as {
            secuencia: number;
          };
          this.clocksRemotos.set(peerId, ultimaOp.secuencia);
        }
      }

      const duracionMs = Date.now() - inicio;
      this.sincronizando = false;

      const resultado: SyncResult = {
        docId: this.docId,
        operacionesEnviadas,
        operacionesRecibidas,
        conflictos,
        operacionesRechazadas,
        duracionMs,
        exito: true,
      };

      this.emit('syncCompletado', { resultado, peerId });
      return resultado;
    } catch (error) {
      this.sincronizando = false;
      const mensaje = error instanceof Error ? error.message : 'Error de sincronizacion';

      this.emit('syncError', {
        docId: this.docId,
        peerId,
        error: mensaje,
      });

      return {
        docId: this.docId,
        operacionesEnviadas: 0,
        operacionesRecibidas: 0,
        conflictos: 0,
        operacionesRechazadas: 0,
        duracionMs: Date.now() - inicio,
        exito: false,
      };
    }
  }

  // ─── CLOCK ───────────────────────────────────────────────────────────

  actualizarClockLocal(clock: number): void {
    this.clockLocal = Math.max(this.clockLocal, clock);
  }

  actualizarClockRemoto(peerId: NodoId, clock: number): void {
    this.clocksRemotos.set(peerId, clock);
  }

  obtenerClockLocal(): number {
    return this.clockLocal;
  }

  obtenerClockRemoto(peerId: NodoId): number {
    return this.clocksRemotos.get(peerId) ?? 0;
  }

  // ─── FIRMA DE ENVOLVENTES (SHELF-111) ───────────────────────────────

  /**
   * SHELF-111: admite solo operaciones firmadas cuando `requireSignedEnvelopes`
   * está activo. Durante el período de gracia las operaciones sin firma se
   * registran (evento `envelopeSinFirma`) pero se permiten; una vez vencido el
   * período se rechazan con un evento `envelopeRechazado`.
   */
  private async admitirEnvolventesFirmadas(
    peerId: NodoId,
    operaciones: readonly unknown[],
  ): Promise<{ admitidas: readonly unknown[]; rechazadas: number }> {
    if (!this.requireSignedEnvelopes) {
      return { admitidas: operaciones, rechazadas: 0 };
    }

    const admitidas: unknown[] = [];
    let rechazadas = 0;
    const finGracia = this.signedEnvelopeEnforcementStartMs + this.signedEnvelopeGracePeriodMs;

    for (const opRaw of operaciones) {
      const op = opRaw as Record<string, unknown>;
      const firma = op.firma;

      if (typeof firma === 'string' && firma.length > 0) {
        // Firma presente: verificar si hay callback de verificación configurado.
        if (this.verificarFirmaFn !== null) {
          const valida = await this.verificarFirmaFn(opRaw);
          if (!valida) {
            rechazadas++;
            this.emit('envelopeRechazado', {
              docId: this.docId,
              peerId,
              secuencia: typeof op.secuencia === 'number' ? op.secuencia : 0,
              autor: typeof op.autor === 'string' ? op.autor : '',
              motivo: 'firma-invalida',
            });
            continue;
          }
        }
        admitidas.push(opRaw);
        continue;
      }

      // Firma ausente: durante la gracia se registra el warning pero se permite.
      if (Date.now() < finGracia) {
        this.emit('envelopeSinFirma', {
          docId: this.docId,
          peerId,
          secuencia: typeof op.secuencia === 'number' ? op.secuencia : 0,
          autor: typeof op.autor === 'string' ? op.autor : '',
        });
        admitidas.push(opRaw);
        continue;
      }

      // Gracia vencida: rechazo duro con mensaje claro.
      rechazadas++;
      this.emit('envelopeRechazado', {
        docId: this.docId,
        peerId,
        secuencia: typeof op.secuencia === 'number' ? op.secuencia : 0,
        autor: typeof op.autor === 'string' ? op.autor : '',
        motivo: 'firma-ausente',
      });
    }

    return { admitidas, rechazadas };
  }

  // ─── ESTADO ──────────────────────────────────────────────────────────

  estaSincronizando(): boolean {
    return this.sincronizando;
  }

  // ─── EVENTOS ─────────────────────────────────────────────────────────

  on<K extends keyof SyncEngineEventMap>(tipo: K, handler: (ev: SyncEngineEventMap[K]) => void): void {
    this.eventTarget.addEventListener(tipo as string, handler as EventListener);
  }

  off<K extends keyof SyncEngineEventMap>(tipo: K, handler: (ev: SyncEngineEventMap[K]) => void): void {
    this.eventTarget.removeEventListener(tipo as string, handler as EventListener);
  }

  private emit<K extends keyof SyncEngineEventMap>(tipo: K, detalle: SyncEngineEventMap[K]['detail']): void {
    const evento = new CustomEvent(tipo as string, { detail: detalle });
    this.eventTarget.dispatchEvent(evento);
  }
}

// ─── TYPE GUARD ────────────────────────────────────────────────────────────

function esOperacionValida(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false;
  const op = valor as Record<string, unknown>;
  return (
    typeof op.id === 'string' &&
    typeof op.tipo === 'string' &&
    typeof op.secuencia === 'number' &&
    typeof op.timestamp === 'number' &&
    typeof op.autor === 'string'
  );
}
