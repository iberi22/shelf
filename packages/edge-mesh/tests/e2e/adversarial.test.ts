import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CAPACIDAD_ESTANDAR } from '../../src/authz/index.js';
import { EdgeMesh } from '../../src/edge-mesh.js';
import { createEnvelope, signEnvelope } from '../../src/protocol/index.js';
import { MemoryTransport } from '../../src/transport/memory.js';
import type { NodoId } from '../../src/types/index.js';
import { TIPO_MENSAJE } from '../../src/types/index.js';

// Mock idb to prevent "indexedDB is not defined" error in Node
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    clear: vi.fn(),
    close: vi.fn(),
    objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
  }),
}));

describe('E2E Adversarial Security Suite', () => {
  const roomId = 'adversarial-room';

  beforeEach(() => {
    MemoryTransport.resetAll();
  });

  afterEach(() => {
    MemoryTransport.resetAll();
  });

  async function createTestNode(id: string, options: Partial<any> = {}) {
    const mesh = new EdgeMesh({
      nodoId: id as NodoId,
      storageBackend: 'mem',
      requireAuthz: options.requireAuthz ?? true,
      requireSignedEnvelopes: options.requireSignedEnvelopes ?? false,
      heartbeatIntervalMs: 60_000,
      heartbeatTimeoutMs: 120_000,
    });
    const transport = new MemoryTransport(id as NodoId, { roomId });
    mesh.usarTransport(transport);
    await mesh.iniciar();
    return mesh;
  }

  // ─── SCENARIO 1: NO AUTHORIZATION ──────────────────────────────────────────

  it('Scenario 1 (No-Authz): Rejects remote SYNC and remote AUTHZ from unprivileged peers', async () => {
    const victim = await createTestNode('victim-node');
    const attacker = await createTestNode('attacker-node');

    const errorMessages: string[] = [];
    victim.on('error', (ev) => {
      errorMessages.push(ev.detail.mensaje);
    });

    // A. Unauthorized SYNC
    const attackerDoc = new Y.Doc();
    attackerDoc.getMap('secrets').set('leak', 'attacker_payload');
    const update = Y.encodeStateAsUpdate(attackerDoc);

    const syncEnvelope = createEnvelope(TIPO_MENSAJE.SYNC, 'attacker-node' as NodoId, 'victim-node' as NodoId, {
      docId: 'default',
      datos: Array.from(update),
      clock: 1,
    });

    await victim.recibirEnvelope(syncEnvelope);

    // Verify change is NOT applied
    expect(victim.yjsAdapter.getMap('secrets').get('leak')).toBeUndefined();
    // Verify security guard emitted error
    expect(errorMessages.some((msg) => msg.includes('SYNC denegado'))).toBe(true);

    // B. Unauthorized AUTHZ grant
    const authzEnvelope = createEnvelope(TIPO_MENSAJE.AUTHZ, 'attacker-node' as NodoId, 'victim-node' as NodoId, {
      accion: 'conceder',
      espacio: 'global',
      sujeto: 'attacker-node',
      capacidad: 'admin',
    });

    await victim.recibirEnvelope(authzEnvelope);

    // Verify grant is NOT applied
    expect(victim.authorizer.verificarCapacidad('global', 'attacker-node' as NodoId, 'admin')).toBe(false);
    expect(errorMessages.some((msg) => msg.includes('AUTHZ denegado'))).toBe(true);

    await victim.detener();
    await attacker.detener();
  });

  // ─── SCENARIO 2: DELTA REPLAY ──────────────────────────────────────────────

  it('Scenario 2 (Replay): MessageDeduplicator detects and rejects replayed updates', async () => {
    const victim = await createTestNode('victim-node-s2');
    const sender = await createTestNode('legit-sender-s2');

    // Grant write capability to legit-sender
    victim.authorizer.concederCapacidad('global', 'legit-sender-s2' as NodoId, CAPACIDAD_ESTANDAR.ESCRIBIR);

    const senderDoc = new Y.Doc();
    senderDoc.getMap('records').set('state', 'val-1');
    const update = Y.encodeStateAsUpdate(senderDoc);

    const legitEnvelope = createEnvelope(TIPO_MENSAJE.SYNC, 'legit-sender-s2' as NodoId, 'victim-node-s2' as NodoId, {
      docId: 'default',
      datos: Array.from(update),
      clock: 1,
    });

    let syncCompletedCount = 0;
    victim.on('syncCompletado', () => {
      syncCompletedCount++;
    });

    // 1st time: legitimate application
    await victim.recibirEnvelope(legitEnvelope);
    expect(victim.yjsAdapter.getMap('records').get('state')).toBe('val-1');
    expect(syncCompletedCount).toBe(1);

    // 2nd time: Replay attack (exact same envelope)
    await victim.recibirEnvelope(legitEnvelope);
    // Sync should not complete again since deduplicator blocks it
    expect(syncCompletedCount).toBe(1);

    await victim.detener();
    await sender.detener();
  });

  // ─── SCENARIO 3: MALFORMED YJS UPDATES ─────────────────────────────────────

  it('Scenario 3 (Malformed): Corrupted sync data is caught gracefully and does not crash or corrupt state', async () => {
    const victim = await createTestNode('victim-node-s3');
    const attacker = await createTestNode('attacker-node-s3');

    // Grant write capability to bypass pre-flight auth check
    victim.authorizer.concederCapacidad('global', 'attacker-node-s3' as NodoId, CAPACIDAD_ESTANDAR.ESCRIBIR);

    const errorMessages: string[] = [];
    victim.on('error', (ev) => {
      errorMessages.push(ev.detail.mensaje);
    });

    // Malformed/Corrupt binary Yjs update bytes
    const corruptBytes = [12, 34, 56, 78, 90];
    const malformedEnvelope = createEnvelope(
      TIPO_MENSAJE.SYNC,
      'attacker-node-s3' as NodoId,
      'victim-node-s3' as NodoId,
      {
        docId: 'default',
        datos: corruptBytes,
        clock: 2,
      },
    );

    // Applying corrupted bytes should be handled without crashing
    await expect(victim.recibirEnvelope(malformedEnvelope)).resolves.not.toThrow();

    // Verify error was emitted with details of the apply update failure
    expect(errorMessages.some((msg) => msg.includes('Error al aplicar SYNC'))).toBe(true);

    await victim.detener();
    await attacker.detener();
  });

  // ─── SCENARIO 4: IMPERSONATION (SUPLANTACIÓN) ──────────────────────────────

  it('Scenario 4 (Impersonation): Rejects missing, tampered, or mismatched ML-DSA-65 signatures', async () => {
    // Setup victim with requirement of signed envelopes
    const victim = await createTestNode('victim-node-s4', { requireSignedEnvelopes: true });
    const legitSender = await createTestNode('legit-sender-s4', { requireSignedEnvelopes: true });
    const attacker = await createTestNode('attacker-node-s4', { requireSignedEnvelopes: true });

    // Register legitSender's true public key in victim
    victim.registrarClavePublica('legit-sender-s4' as NodoId, legitSender.identity.exportarPublico());
    victim.authorizer.concederCapacidad('global', 'legit-sender-s4' as NodoId, CAPACIDAD_ESTANDAR.ESCRIBIR);

    const errorMessages: string[] = [];
    victim.on('error', (ev) => {
      errorMessages.push(ev.detail.mensaje);
    });

    // Create update in a completely separate Yjs Doc to avoid auto-broadcasting on legitSender
    const separateDoc = new Y.Doc();
    separateDoc.getMap('guarded').set('status', 'safe');
    const update = Y.encodeStateAsUpdate(separateDoc);

    // Case A: Unsigned envelope claiming to be from legitSender
    const unsignedEnvelope = createEnvelope(
      TIPO_MENSAJE.SYNC,
      'legit-sender-s4' as NodoId,
      'victim-node-s4' as NodoId,
      {
        docId: 'default',
        datos: Array.from(update),
        clock: 1,
      },
    );

    await victim.recibirEnvelope(unsignedEnvelope);
    expect(victim.yjsAdapter.getMap('guarded').get('status')).toBeUndefined();
    expect(errorMessages.some((msg) => msg.includes('Firma invalida o ausente'))).toBe(true);

    // Case B: Mismatched signature (attacker signs on behalf of legitSender using attacker's private key)
    // We create a fresh unsigned envelope so it has a distinct ID and is not blocked by deduplicator
    const unsignedEnvelopeB = createEnvelope(
      TIPO_MENSAJE.SYNC,
      'legit-sender-s4' as NodoId,
      'victim-node-s4' as NodoId,
      {
        docId: 'default',
        datos: Array.from(update),
        clock: 2,
      },
    );
    const tamperedEnvelope = await signEnvelope(unsignedEnvelopeB, attacker.identity);
    // Source claimed is 'legit-sender-s4', but signed with attacker's key
    await victim.recibirEnvelope(tamperedEnvelope);
    expect(victim.yjsAdapter.getMap('guarded').get('status')).toBeUndefined();

    // Case C: Valid signature but legit sender key, yet payload tampered
    const unsignedEnvelopeC = createEnvelope(
      TIPO_MENSAJE.SYNC,
      'legit-sender-s4' as NodoId,
      'victim-node-s4' as NodoId,
      {
        docId: 'default',
        datos: Array.from(update),
        clock: 3,
      },
    );
    const legitimatelySignedC = await signEnvelope(unsignedEnvelopeC, legitSender.identity);
    // Tamper payload after signing
    const tamperedPayloadEnvelope = {
      ...legitimatelySignedC,
      payload: {
        ...legitimatelySignedC.payload,
        datos: [9, 9, 9], // tampered bytes
      },
    };
    await victim.recibirEnvelope(tamperedPayloadEnvelope);
    expect(victim.yjsAdapter.getMap('guarded').get('status')).toBeUndefined();

    // Case D: Successful verification with valid signature and public key
    const unsignedEnvelopeD = createEnvelope(
      TIPO_MENSAJE.SYNC,
      'legit-sender-s4' as NodoId,
      'victim-node-s4' as NodoId,
      {
        docId: 'default',
        datos: Array.from(update),
        clock: 4,
      },
    );
    const legitimatelySignedD = await signEnvelope(unsignedEnvelopeD, legitSender.identity);
    await victim.recibirEnvelope(legitimatelySignedD);
    expect(victim.yjsAdapter.getMap('guarded').get('status')).toBe('safe');

    await victim.detener();
    await legitSender.detener();
    await attacker.detener();
  });

  // ─── FUZZING OF DELTAS DECODER ─────────────────────────────────────────────

  it('Fuzzer: Fuzzes the delta decoder with diverse invalid inputs and verifies zero crashes', async () => {
    const victim = await createTestNode('victim-node-fuzzer');
    victim.authorizer.concederCapacidad('global', 'fuzzed-sender' as NodoId, CAPACIDAD_ESTANDAR.ESCRIBIR);

    // 100 random/malformed/boundary values for payload.datos
    const fuzzedInputs = [
      null,
      undefined,
      {},
      [],
      'corrupt_string',
      12345,
      true,
      false,
      { data: 'not_an_array' },
      { data: [1, 2, 3, -4, 999999] },
      { data: Array.from({ length: 1000 }, () => Math.floor(Math.random() * 256)) },
      new Uint8Array([0xff, 0x00, 0x12, 0x34]),
      new Uint8Array(0),
      [[], []],
      [{ nested: {} }],
      NaN,
      Infinity,
      -Infinity,
      { datos: { data: [12, 34] } },
    ];

    // Generate up to 100 diverse inputs by combining random buffers and junk
    for (let i = 0; i < 81; i++) {
      if (i % 3 === 0) {
        // Random numbers/arrays
        fuzzedInputs.push(Array.from({ length: i }, () => Math.floor(Math.random() * 300 - 150)));
      } else if (i % 3 === 1) {
        // Nested objects
        fuzzedInputs.push({ data: { nested: { val: i, arr: [i, -i] } } });
      } else {
        // Unconventional string forms
        fuzzedInputs.push(`junk-data-chunk-${i}`);
      }
    }

    expect(fuzzedInputs.length).toBeGreaterThanOrEqual(100);

    for (const [index, fuzzedData] of fuzzedInputs.entries()) {
      const envelope = createEnvelope(TIPO_MENSAJE.SYNC, 'fuzzed-sender' as NodoId, 'victim-node-fuzzer' as NodoId, {
        docId: 'default',
        datos: fuzzedData,
        clock: index,
      });

      // Assert that sending malformed inputs to receiving pipeline never throws or crashes
      await expect(victim.recibirEnvelope(envelope)).resolves.not.toThrow();
    }

    await victim.detener();
  });
});
