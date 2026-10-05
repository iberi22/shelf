import type { OpLog } from '../op-log/index.js';
import type { NodoId } from '../types/index.js';

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

/**
 * Cap on the operations we put on the wire in a single batch. Also used as the
 * default inbound cap (see `maxBatchOperations`).
 *
 * Why 500: a CRDT document that legitimately diverges by more than a few hundred
 * operations is a document that should be re-seeded with a snapshot, not merged
 * op-by-op. 500 operations of a typical clinical note (≈600 bytes of payload
 * plus an ML-DSA-65 signature ≈3.3 KB) stay well inside a single WebRTC
 * datagram budget, so a conforming peer never needs a bigger frame.
 */
export const MAX_BATCH_SIZE = 500 as const;

/**
 * SHELF-113: hard cap on the serialized size of a single received envelope.
 *
 * Why 256 KiB: a single CRDT operation is one edit (one field of one record),
 * not a whole document. Even a pathological one — a full-text insert or a base64
 * attachment reference — lands far below 256 KiB, while anything larger is far
 * more likely to be a memory-exhaustion attempt than real clinical data. It also
 * keeps the transient cost of validating one envelope bounded regardless of what
 * the peer put in `datos`.
 */
export const MAX_ENVELOPE_BYTES = 262_144 as const;

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
  /**
   * SHELF-113: hard cap on the number of operations accepted from a single peer
   * in one sync round (default: {@link MAX_BATCH_SIZE}).
   *
   * See {@link SyncEngineConfig} docs for why an oversized batch is rejected
   * whole rather than applied in chunks.
   */
  readonly maxBatchOperations?: number;
  /**
   * SHELF-113: hard cap on the serialized byte size of a single received
   * envelope (default: {@link MAX_ENVELOPE_BYTES}). Oversized envelopes are
   * rejected, never truncated.
   */
  readonly maxEnvelopeBytes?: number;
}

export interface SyncResult {
  readonly docId: string;
  readonly operacionesEnviadas: number;
  readonly operacionesRecibidas: number;
  readonly conflictos: number;
  /**
   * SHELF-111: operations rejected for missing/invalid envelope signature.
   * SHELF-113: also counts operations dropped by the resource limits (oversized
   * envelope, oversized batch), so an operator sees transport-level garbage in
   * the same counter as trust-level rejections.
   */
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
  /**
   * SHELF-113: an inbound batch exceeded `maxBatchOperations` and was rejected
   * whole. `lotesOperaciones` is how many operations the peer tried to push.
   */
  loteRechazado: CustomEvent<{
    readonly docId: string;
    readonly peerId: NodoId;
    readonly lotesOperaciones: number;
    readonly maximoPermitido: number;
  }>;
  /**
   * SHELF-113: a single envelope exceeded `maxEnvelopeBytes` and was rejected.
   * Envelopes are never truncated: a half-parsed operation would leave the
   * sequence mid-flight and the log inconsistent.
   */
  sobreRechazadoPorTamano: CustomEvent<{
    readonly docId: string;
    readonly peerId: NodoId;
    readonly secuencia: number;
    readonly bytes: number;
    readonly maximoPermitido: number;
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
  private readonly maxBatchOperations: number;
  private readonly maxEnvelopeBytes: number;
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
    this.maxBatchOperations = config.maxBatchOperations ?? MAX_BATCH_SIZE;
    this.maxEnvelopeBytes = config.maxEnvelopeBytes ?? MAX_ENVELOPE_BYTES;
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

        // SHELF-113: resource limits. Run BEFORE the signature gate so the cap
        // bounds the work an unauthenticated peer can force us to do, not just
        // the log. The signature gate is untouched and still runs on whatever
        // survives this pass.
        const { lote, rechazadas: rechazadasPorLimite } = this.aplicarLimitesDeRecurso(peerId, operacionesRemotas);
        operacionesRechazadas += rechazadasPorLimite;

        const validadas = lote.filter(esOperacionValida);

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

  // ─── LÍMITES DE RECURSO (SHELF-113) ─────────────────────────────

  /**
   * SHELF-113: bounds the memory a single peer can make this node allocate by
   * applying two hard caps to an inbound batch.
   *
   * 1. **Batch-count cap.** A batch with more than `maxBatchOperations` entries
   *    is rejected *whole*, not applied in chunks. This check runs first, on the
   *    array length alone, so an oversized batch is rejected in constant time.
   *
   *    Trade-off, stated explicitly because this is the debatable choice:
   *    - *Why reject whole rather than chunk*: the rejection is atomic and
   *      auditable. The peer gets one clear `loteRechazado` event instead of a
   *      silent partial merge, the operator sees a single countable rejection in
   *      `operacionesRechazadas`, and `aplicarOperaciones` is never invoked with
   *      an unbounded array. It also means a hostile peer cannot get a partial
   *      write committed before we discover the rest is junk — chunking a
   *      poisoned batch would apply the first N ops and then stop, leaving the
   *      log holding ops we have already told the peer we cannot verify. Because
   *      the whole batch is discarded, the per-envelope pass is skipped entirely
   *      for it: serializing 500k envelopes only to discard them would be the very
   *      allocation storm this cap exists to prevent.
   *    - *What we give up*: a legitimate peer that is merely behind, with 800
   *      pending operations, gets nothing this round instead of 500 of them.
   *      That is recoverable and correct on the wire — `recibir()` is the
   *      caller's own transport closure, so a conforming caller re-offers the
   *      remainder from the peer's advertised clock, exactly as it already must
   *      for the outbound batches we chunk at `batchSize`. No operation is lost;
   *      the catch-up simply takes another round. The next round is bounded again
   *      by the same cap, which is the point.
   *
   * 2. **Per-envelope byte cap.** An envelope whose serialized form exceeds
   *    `maxEnvelopeBytes` is dropped. It is *never truncated*: a truncated
   *    envelope parses as a partial operation, which would advance the sequence
   *    by a partial delta and leave the CRDT log inconsistent. Rejecting is the
   *    only option that keeps the log whole.
   *
   * The returned rejections are counted into `SyncResult.operacionesRechazadas`
   * so an operator sees the garbage alongside signature-gate rejections.
   */
  private aplicarLimitesDeRecurso(
    peerId: NodoId,
    operaciones: readonly unknown[],
  ): { lote: readonly unknown[]; rechazadas: number } {
    // Cap 1 — operation count per batch. Checked FIRST, on the array length
    // alone, so an oversized batch costs O(1) instead of O(n) serializations.
    // Measuring 500k envelopes we are about to throw away wholesale is exactly
    // the work this cap exists to prevent, and it would also emit 500k
    // rejection events. Nothing survives a whole-batch rejection, so the count
    // reported is the full incoming length either way.
    if (operaciones.length > this.maxBatchOperations) {
      this.emit('loteRechazado', {
        docId: this.docId,
        peerId,
        lotesOperaciones: operaciones.length,
        maximoPermitido: this.maxBatchOperations,
      });
      return { lote: [], rechazadas: operaciones.length };
    }

    // Cap 2 — per-envelope serialized size.
    const lote: unknown[] = [];
    let rechazadas = 0;

    for (const op of operaciones) {
      const bytes = tamanoSerializado(op);
      if (bytes > this.maxEnvelopeBytes) {
        rechazadas++;
        this.emit('sobreRechazadoPorTamano', {
          docId: this.docId,
          peerId,
          secuencia: leerSecuencia(op),
          bytes,
          maximoPermitido: this.maxEnvelopeBytes,
        });
        continue;
      }
      lote.push(op);
    }

    return { lote, rechazadas };
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

// ─── MEDICIÓN DE TAMAÑO (SHELF-113) ────────────────────────────────────────

/**
 * SHELF-113: serialized byte size of an inbound envelope, used by the
 * per-envelope cap.
 *
 * A hostile peer controls the payload, so this must never throw: `JSON.stringify`
 * throws on cyclic structures and silently returns `undefined` on values it
 * cannot encode (BigInt also throws). Both cases mean "not a well-formed
 * envelope we can reason about", so we report `Infinity` and let the caller
 * reject the envelope. An unserializable payload is exactly the payload we do
 * not want to feed into the CRDT.
 */
function tamanoSerializado(valor: unknown): number {
  try {
    const json = JSON.stringify(valor);
    if (typeof json !== 'string') return Number.POSITIVE_INFINITY;
    return byteLengthUtf8(json);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * UTF-8 byte length without allocating a Buffer for every envelope: two bytes per
 * code unit is the exact cost for ASCII and Latin-1, and for anything above
 * U+07FF it over-counts only if astral characters are involved. Over-counting is
 * the safe direction for a size limit, and the 256 KiB cap leaves several orders
 * of magnitude of headroom for real envelopes, so the approximation never
 * rejects a legitimate one.
 */
function byteLengthUtf8(json: string): number {
  let bytes = 0;
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff)
      bytes += 4; // surrogate pair
    else bytes += 3;
  }
  return bytes;
}

/** Read `secuencia` for rejection telemetry only; never for trust decisions. */
function leerSecuencia(valor: unknown): number {
  if (typeof valor !== 'object' || valor === null) return 0;
  const secuencia = (valor as Record<string, unknown>).secuencia;
  return typeof secuencia === 'number' ? secuencia : 0;
}
