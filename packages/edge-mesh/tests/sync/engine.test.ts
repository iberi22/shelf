import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpLog } from '../../src/op-log/index.js';
import { SyncEngine } from '../../src/sync/engine.js';
import type { NodoId, Operacion } from '../../src/types/index.js';

describe('SyncEngine Module', () => {
  let engine: SyncEngine;
  let oplog: OpLog;
  const docId = 'test-doc';
  const peerId = 'peer-1' as NodoId;

  beforeEach(() => {
    oplog = new OpLog({ docId });
    engine = new SyncEngine({ docId, opLog: oplog, requireSignedEnvelopes: false });
  });

  describe('sincronizar', () => {
    it('should perform bidirectional sync successfully', async () => {
      // Local operations
      await oplog.append('t1', { val: 1 }, 'local' as NodoId);

      // Remote operations to receive
      const remoteOps: Operacion[] = [
        {
          id: 'remote:2',
          tipo: 't2',
          datos: { val: 2 },
          timestamp: Date.now(),
          autor: peerId,
          secuencia: 2,
          firma: 'firma-mldsa-65-valida',
        },
      ];

      const enviar = vi.fn().mockResolvedValue(undefined);
      const recibir = vi.fn().mockResolvedValue(remoteOps);

      const result = await engine.sincronizar(peerId, enviar, recibir);

      expect(result.exito).toBe(true);
      expect(result.operacionesEnviadas).toBe(1);
      expect(result.operacionesRecibidas).toBe(1);
      expect(enviar).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ secuencia: 1 })]));
      expect(oplog.obtenerUltimaSecuencia()).toBe(2);
    });

    it('should handle pull-only (entrante) direction', async () => {
      engine = new SyncEngine({ docId, opLog: oplog, requireSignedEnvelopes: false, direction: 'entrante' });
      await oplog.append('t1', { val: 1 }, 'local' as NodoId);

      const remoteOps: Operacion[] = [
        {
          id: 'remote:2',
          tipo: 't2',
          datos: { val: 2 },
          timestamp: Date.now(),
          autor: peerId,
          secuencia: 2,
          firma: 'firma-mldsa-65-valida',
        },
      ];

      const enviar = vi.fn().mockResolvedValue(undefined);
      const recibir = vi.fn().mockResolvedValue(remoteOps);

      const result = await engine.sincronizar(peerId, enviar, recibir);

      expect(result.operacionesEnviadas).toBe(0);
      expect(result.operacionesRecibidas).toBe(1);
      expect(enviar).not.toHaveBeenCalled();
    });

    it('should handle push-only (saliente) direction', async () => {
      engine = new SyncEngine({ docId, opLog: oplog, requireSignedEnvelopes: false, direction: 'saliente' });
      await oplog.append('t1', { val: 1 }, 'local' as NodoId);

      const enviar = vi.fn().mockResolvedValue(undefined);
      const recibir = vi.fn().mockResolvedValue([]);

      const result = await engine.sincronizar(peerId, enviar, recibir);

      expect(result.operacionesEnviadas).toBe(1);
      expect(result.operacionesRecibidas).toBe(0);
      expect(recibir).not.toHaveBeenCalled();
    });

    it('should detect conflicts', async () => {
      await oplog.append('local', {}, 'local' as NodoId); // seq 1

      // Remote sends op with same or lower sequence than local
      const remoteOps: Operacion[] = [
        {
          id: 'remote:1',
          tipo: 't1',
          datos: {},
          timestamp: Date.now(),
          autor: peerId,
          secuencia: 1,
          firma: 'firma-mldsa-65-valida',
        },
      ];

      const conflictHandler = vi.fn();
      engine.on('conflictoDetectado', conflictHandler);

      const result = await engine.sincronizar(
        peerId,
        async () => {},
        async () => remoteOps,
      );

      expect(result.conflictos).toBe(1);
      expect(conflictHandler).toHaveBeenCalled();
    });

    it('should prevent concurrent syncs for same document', async () => {
      const slowRecibir = () => new Promise<readonly unknown[]>((resolve) => setTimeout(() => resolve([]), 50));

      const promise1 = engine.sincronizar(peerId, async () => {}, slowRecibir);

      await expect(
        engine.sincronizar(
          peerId,
          async () => {},
          async () => [],
        ),
      ).rejects.toThrow('Sync en progreso');

      await promise1;
    });
  });

  describe('clocks', () => {
    it('should update and get local clock', () => {
      engine.actualizarClockLocal(10);
      expect(engine.obtenerClockLocal()).toBe(10);
      engine.actualizarClockLocal(5); // Should not go backwards
      expect(engine.obtenerClockLocal()).toBe(10);
    });

    it('should update and get remote clock', () => {
      engine.actualizarClockRemoto(peerId, 20);
      expect(engine.obtenerClockRemoto(peerId)).toBe(20);
    });
  });

  it('should report sync status', async () => {
    expect(engine.estaSincronizando()).toBe(false);
    const promise = engine.sincronizar(
      peerId,
      async () => {},
      async () => [],
    );
    expect(engine.estaSincronizando()).toBe(true);
    await promise;
    expect(engine.estaSincronizando()).toBe(false);
  });
});

describe('SyncEngine signed envelope enforcement (SHELF-111)', () => {
  let oplog: OpLog;
  const docId = 'test-doc-signed';
  const peerId = 'peer-1' as NodoId;

  beforeEach(() => {
    oplog = new OpLog({ docId });
  });

  function unsignedOp(secuencia = 1) {
    return {
      id: `remote:${secuencia}`,
      tipo: 't1',
      datos: { val: secuencia },
      timestamp: Date.now(),
      autor: peerId,
      secuencia,
    };
  }

  const verificador = (op: unknown) => (op as { firma?: string }).firma === 'firma-valida';

  it('rejects unsigned operations (fail closed)', async () => {
    const engineG = new SyncEngine({
      docId,
      opLog: oplog,
      requireSignedEnvelopes: true,
      verificarFirma: verificador,
    });

    const rechazoSpy = vi.fn();
    engineG.on('envelopeRechazado', rechazoSpy);

    const result = await engineG.sincronizar(
      peerId,
      async () => {},
      async () => [unsignedOp(1)],
    );

    expect(result.exito).toBe(true);
    expect(result.operacionesRecibidas).toBe(0);
    expect(result.operacionesRechazadas).toBe(1);
    expect(oplog.obtenerUltimaSecuencia()).toBe(0);
    expect(rechazoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ motivo: 'firma-ausente', secuencia: 1 }),
      }),
    );
  });

  it('rejects garbage non-empty firma strings', async () => {
    const engineG = new SyncEngine({
      docId,
      opLog: oplog,
      requireSignedEnvelopes: true,
      verificarFirma: verificador,
    });
    const result = await engineG.sincronizar(
      peerId,
      async () => {},
      async () => [{ ...unsignedOp(1), firma: 'garbage' }],
    );
    expect(result.operacionesRecibidas).toBe(0);
    expect(result.operacionesRechazadas).toBe(1);
    expect(oplog.obtenerUltimaSecuencia()).toBe(0);
  });

  it('accepts operations with a valid signature', async () => {
    const engineS = new SyncEngine({
      docId,
      opLog: oplog,
      requireSignedEnvelopes: true,
      verificarFirma: verificador,
    });

    const result = await engineS.sincronizar(
      peerId,
      async () => {},
      async () => [{ ...unsignedOp(1), firma: 'firma-valida' }],
    );

    expect(result.exito).toBe(true);
    expect(result.operacionesRecibidas).toBe(1);
    expect(result.operacionesRechazadas).toBe(0);
    expect(oplog.obtenerUltimaSecuencia()).toBe(1);
  });

  it('throws at construction when signatures are required but no verifier is set', () => {
    expect(() => new SyncEngine({ docId, opLog: oplog, requireSignedEnvelopes: true })).toThrow(/verificarFirma/);
    expect(() => new SyncEngine({ docId, opLog: oplog })).toThrow(/verificarFirma/);
  });

  it('rejects operations whose signature fails verificarFirma', async () => {
    const engineV = new SyncEngine({
      docId,
      opLog: oplog,
      requireSignedEnvelopes: true,
      verificarFirma: (op) => (op as { firma: string }).firma === 'firma-valida',
    });

    const resultadoMal = await engineV.sincronizar(
      peerId,
      async () => {},
      async () => [{ ...unsignedOp(1), firma: 'firma-invalida' }],
    );
    expect(resultadoMal.operacionesRecibidas).toBe(0);
    expect(resultadoMal.operacionesRechazadas).toBe(1);

    const resultadoBien = await engineV.sincronizar(
      peerId,
      async () => {},
      async () => [{ ...unsignedOp(2), firma: 'firma-valida' }],
    );
    expect(resultadoBien.operacionesRecibidas).toBe(1);
    expect(resultadoBien.operacionesRechazadas).toBe(0);
  });

  it('does not gate incoming operations when requireSignedEnvelopes is false', async () => {
    const engineF = new SyncEngine({ docId, opLog: oplog, requireSignedEnvelopes: false });

    const result = await engineF.sincronizar(
      peerId,
      async () => {},
      async () => [unsignedOp(1)],
    );

    expect(result.operacionesRecibidas).toBe(1);
    expect(result.operacionesRechazadas).toBe(0);
  });

  it('enforces requireSignedEnvelopes as true by default when omitted from config', async () => {
    const engineDefault = new SyncEngine({ docId, opLog: oplog, verificarFirma: verificador });

    const rechazoSpy = vi.fn();
    engineDefault.on('envelopeRechazado', rechazoSpy);

    const result = await engineDefault.sincronizar(
      peerId,
      async () => {},
      async () => [unsignedOp(1)],
    );

    expect(result.exito).toBe(true);
    expect(result.operacionesRecibidas).toBe(0);
    expect(result.operacionesRechazadas).toBe(1);
    expect(rechazoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ motivo: 'firma-ausente', secuencia: 1 }),
      }),
    );
  });
});
