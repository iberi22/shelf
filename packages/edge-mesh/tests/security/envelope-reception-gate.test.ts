import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CAPACIDAD_ESTANDAR } from '../../src/authz/index.js';
import { EdgeMesh } from '../../src/edge-mesh.js';
import { createEnvelope, signEnvelope } from '../../src/protocol/index.js';
import type { EdgeMeshConfig, Envolvente, NodoId } from '../../src/types/index.js';
import { TIPO_MENSAJE } from '../../src/types/index.js';

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

/**
 * Reception-layer gate: nothing reaches local state without proving who sent it.
 *
 * Every test here drives `recibirEnvelope`, which is the same entry point the
 * transport handler (`usarTransport` -> `procesarMensaje`) uses, so these are
 * end-to-end assertions on the real receive path, not on a stub.
 */
describe('EdgeMesh envelope reception gate', () => {
  const VICTIM = 'gate-victim' as NodoId;
  const PEER = 'gate-peer' as NodoId;
  const ATTACKER = 'gate-attacker' as NodoId;

  let victim: EdgeMesh;
  let peer: EdgeMesh;
  let attacker: EdgeMesh;
  let errors: string[];

  function makeMesh(nodoId: NodoId, overrides: Partial<EdgeMeshConfig> = {}): EdgeMesh {
    return new EdgeMesh({
      nodoId,
      storageBackend: 'mem',
      requireAuthz: true,
      requireSignedEnvelopes: true,
      heartbeatIntervalMs: 60_000,
      heartbeatTimeoutMs: 120_000,
      ...overrides,
    });
  }

  beforeEach(() => {
    victim = makeMesh(VICTIM);
    peer = makeMesh(PEER);
    attacker = makeMesh(ATTACKER);

    // The victim trusts the peer's key but never the attacker's: the attacker is
    // an unknown peer that still knows a valid node id.
    victim.registrarClavePublica(PEER, peer.identity.exportarPublico());

    victim.authorizer.concederCapacidad('global', PEER, CAPACIDAD_ESTANDAR.ESCRIBIR);

    errors = [];
    victim.on('error', (ev) => errors.push(ev.detail.mensaje));
  });

  afterEach(async () => {
    await victim.detener();
    await peer.detener();
    await attacker.detener();
  });

  function yjsUpdate(): Uint8Array {
    const doc = new Y.Doc();
    doc.getMap('records').set('estado', 'confidencial');
    return Y.encodeStateAsUpdate(doc);
  }

  // ── 1. THE HEADLINE ASSERTION ──────────────────────────────────────────

  it('rejects an UNSIGNED SYNC envelope when requireSignedEnvelopes is active', async () => {
    const unsigned = createEnvelope(TIPO_MENSAJE.SYNC, PEER, VICTIM, {
      docId: 'default',
      datos: Array.from(yjsUpdate()),
      clock: 1,
    });

    // Sanity: it really has no signature.
    expect(unsigned.firma).toBeNull();

    await victim.recibirEnvelope(unsigned);

    // The write did not land.
    expect(victim.yjsAdapter.getMap('records').get('estado')).toBeUndefined();
    // And it was refused explicitly, not silently dropped.
    expect(errors.some((m) => m.includes('Firma invalida o ausente'))).toBe(true);
  });

  it('accepts the very same envelope once it is signed by the trusted peer', async () => {
    const signed = await signEnvelope(
      createEnvelope(TIPO_MENSAJE.SYNC, PEER, VICTIM, {
        docId: 'default',
        datos: Array.from(yjsUpdate()),
        clock: 1,
      }),
      peer.identity,
    );

    await victim.recibirEnvelope(signed);

    expect(victim.yjsAdapter.getMap('records').get('estado')).toBe('confidencial');
  });

  it('never emits mensajeRecibido for an unsigned SYNC, so extensions cannot act on it', async () => {
    const seen: Envolvente[] = [];
    victim.on('mensajeRecibido', (ev) => seen.push(ev.detail.envolvente));

    await victim.recibirEnvelope(
      createEnvelope(TIPO_MENSAJE.SYNC, PEER, VICTIM, {
        docId: 'default',
        datos: Array.from(yjsUpdate()),
        clock: 1,
      }),
    );

    // GPU marketplace and any other listener hangs off this event.
    expect(seen).toHaveLength(0);
  });

  it('rejects a signed envelope whose origin is an unknown peer', async () => {
    // Correctly signed by the attacker, but the victim never registered that key.
    const forged = await signEnvelope(
      createEnvelope(TIPO_MENSAJE.SYNC, ATTACKER, VICTIM, {
        docId: 'default',
        datos: Array.from(yjsUpdate()),
        clock: 1,
      }),
      attacker.identity,
    );

    await victim.recibirEnvelope(forged);

    expect(victim.yjsAdapter.getMap('records').get('estado')).toBeUndefined();
    expect(errors.some((m) => m.includes('Firma invalida o ausente'))).toBe(true);
  });

  // ── 2. SNAPSHOT USED TO BE EXEMPT ──────────────────────────────────────

  it('rejects an unsigned SNAPSHOT envelope (previously exempt from the gate)', async () => {
    victim.obtenerSnapshotManager('default');

    await victim.recibirEnvelope(
      createEnvelope(TIPO_MENSAJE.SNAPSHOT, ATTACKER, VICTIM, {
        docId: 'default',
        version: 99,
        datos: Array.from(yjsUpdate()),
        nodosConfirmados: [ATTACKER],
      }),
    );

    expect(victim.obtenerSnapshotManager('default').obtenerVersionActual()).toBe(0);
    expect(errors.some((m) => m.includes('Firma invalida o ausente'))).toBe(true);
  });

  it('applies a SNAPSHOT once the trusted peer signs it', async () => {
    const manager = victim.obtenerSnapshotManager('default');

    const signed = await signEnvelope(
      createEnvelope(TIPO_MENSAJE.SNAPSHOT, PEER, VICTIM, {
        docId: 'default',
        version: 7,
        datos: Array.from(yjsUpdate()),
        nodosConfirmados: [PEER],
      }),
      peer.identity,
    );

    await victim.recibirEnvelope(signed);

    expect(manager.obtenerVersionActual()).toBe(7);
  });

  it('rejects an unsigned NAMESPACE join (membership forgery)', async () => {
    await victim.recibirEnvelope(
      createEnvelope(TIPO_MENSAJE.NAMESPACE, ATTACKER, VICTIM, {
        accion: 'unir',
        espacio: 'global',
        nodoId: ATTACKER,
      }),
    );

    expect(victim.namespaces.obtenerNodosEnEspacio('global')).not.toContain(ATTACKER);
    expect(errors.some((m) => m.includes('Firma invalida o ausente'))).toBe(true);
  });

  it('rejects a NAMESPACE join naming a node other than the sender', async () => {
    const signed = await signEnvelope(
      createEnvelope(TIPO_MENSAJE.NAMESPACE, ATTACKER, VICTIM, {
        accion: 'unir',
        espacio: 'global',
        nodoId: PEER,
      }),
      peer.identity,
    );

    await victim.recibirEnvelope(signed);

    expect(victim.namespaces.obtenerNodosEnEspacio('global')).not.toContain(PEER);
  });

  it('applies a NAMESPACE join where sender and payload agree', async () => {
    const signed = await signEnvelope(
      createEnvelope(TIPO_MENSAJE.NAMESPACE, PEER, VICTIM, {
        accion: 'unir',
        espacio: 'global',
        nodoId: PEER,
      }),
      peer.identity,
    );

    await victim.recibirEnvelope(signed);

    expect(victim.namespaces.obtenerNodosEnEspacio('global')).toContain(PEER);
  });

  // ── 3. IDENTITY BINDING ON UNSIGNED TYPES ──────────────────────────────

  it('rejects a GOVERNANCE vote cast on behalf of another node', async () => {
    victim.governance.crearPropuesta('prop-1', 'decision', VICTIM, {}, 60_000);

    await victim.recibirEnvelope(
      createEnvelope(TIPO_MENSAJE.GOVERNANCE, ATTACKER, VICTIM, {
        accion: 'votar',
        propuesta: 'prop-1',
        voto: { nodoId: PEER, voto: 'a_favor', peso: 1, justificacion: null },
      }),
    );

    expect(victim.governance.obtenerPropuesta('prop-1')?.votos).toHaveLength(0);
  });

  it('rejects a HEARTBEAT announcing presence for another node', async () => {
    await victim.recibirEnvelope(
      createEnvelope(TIPO_MENSAJE.HEARTBEAT, ATTACKER, VICTIM, {
        nodoId: PEER,
        timestamp: Date.now(),
        secuencia: 1,
      }),
    );

    expect(victim.presence.obtenerTotalNodos()).toBe(0);
    expect(victim.presence.obtenerNodosActivos()).not.toContain(PEER);
  });

  // ── 4. SELF-REPLAY AND MALFORMED INPUT ─────────────────────────────────

  it('drops an envelope that claims to originate from this node', async () => {
    const selfReplay = await signEnvelope(
      createEnvelope(TIPO_MENSAJE.SYNC, VICTIM, VICTIM, {
        docId: 'default',
        datos: Array.from(yjsUpdate()),
        clock: 1,
      }),
      victim.identity,
    );

    await victim.recibirEnvelope(selfReplay);

    expect(victim.yjsAdapter.getMap('records').get('estado')).toBeUndefined();
  });

  it('drops a null payload without throwing (typeof null === "object")', async () => {
    const evil = await signEnvelope(createEnvelope(TIPO_MENSAJE.SNAPSHOT, PEER, VICTIM, null), peer.identity);

    await expect(victim.recibirEnvelope(evil)).resolves.toBeUndefined();
    expect(victim.obtenerSnapshotManager('default').obtenerVersionActual()).toBe(0);
  });

  it('rejects a non-object envelope before touching any state', async () => {
    await expect(victim.recibirEnvelope('not-an-envelope')).resolves.toBeUndefined();
    await expect(victim.recibirEnvelope(undefined)).resolves.toBeUndefined();
    await expect(victim.recibirEnvelope({ id: 'x', tipo: 'sync' })).resolves.toBeUndefined();
    expect(errors).toHaveLength(0);
  });
});
