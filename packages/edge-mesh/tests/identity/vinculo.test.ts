import { describe, expect, it } from 'vitest';
import {
  ALGORITMOS,
  bytesToBase64,
  ConflictoClavePublicaError,
  crearIdentidadVinculada,
  createPostQuantumIdentity,
  derivarClaveSimetrica,
  derivarNodoId,
  deserializeKeypair,
  esNodoIdDerivado,
  evaluarVinculoNodoId,
  generateKeypair,
  identityFromSecret,
  RegistroConfianzaClaves,
  serializeKeypair,
  verificarNodoIdVinculado,
} from '../../src/identity/index.js';
import type { NodoId } from '../../src/types/index.js';

// ─── DERIVED NODE ID ───────────────────────────────────────────────────────

describe('derived nodeId', () => {
  it('derives the same id for the same ML-KEM key', async () => {
    const a = await crearIdentidadVinculada();
    const b = await crearIdentidadVinculada(a.keypair);
    expect(a.nodoId).toBe(b.nodoId);
  });

  it('derives different ids for different keys', async () => {
    const a = await crearIdentidadVinculada();
    const b = await crearIdentidadVinculada();
    expect(a.nodoId).not.toBe(b.nodoId);
  });

  it('is deterministic across a serialize/deserialize roundtrip', async () => {
    const a = await crearIdentidadVinculada();
    const restored = deserializeKeypair(serializeKeypair(a.keypair));
    expect(await derivarNodoId(restored.kemPublico!)).toBe(a.nodoId);
  });

  it('produces an id in the derived shape and linked to the key', async () => {
    const a = await crearIdentidadVinculada();
    expect(esNodoIdDerivado(a.nodoId)).toBe(true);
    expect(await verificarNodoIdVinculado(a.nodoId, a.exportarKemPublico())).toBe(true);
  });

  it('refuses to link a derived id presented by a different key (impersonation)', async () => {
    const a = await crearIdentidadVinculada();
    const impostor = await crearIdentidadVinculada();
    // The impostor claims node A's derived id while holding its own key.
    const suplantado = createPostQuantumIdentity(a.nodoId, impostor.keypair);

    const vinculo = await evaluarVinculoNodoId(a.nodoId, impostor.exportarKemPublico());
    expect(vinculo.estado).toBe('conflicto');
    expect(await verificarNodoIdVinculado(suplantado.nodoId, impostor.exportarKemPublico())).toBe(false);
  });

  it('domain-separates: a nodeId digest differs from a shared-secret digest', async () => {
    const kp = generateKeypair();
    const buf = new ArrayBuffer(kp.kemPublico!.length);
    new Uint8Array(buf).set(kp.kemPublico!);
    const idHash = bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)));
    const claveHash = bytesToBase64(await derivarClaveSimetrica(kp.kemPublico!));
    expect(idHash).not.toBe(claveHash);
  });
});

// ─── LEGACY ID MIGRATION ───────────────────────────────────────────────────

describe('legacy nodeId migration', () => {
  it('classifies a legacy free-form id as heredado when the caller opts in', async () => {
    const a = await crearIdentidadVinculada();
    const v = await evaluarVinculoNodoId('doctor-01' as NodoId, a.exportarKemPublico(), true);
    expect(v.estado).toBe('heredado');
    if (v.estado === 'heredado') {
      expect(v.idEsperado).toBe(a.nodoId);
    }
  });

  it('fails closed on a legacy id when the caller does not opt in', async () => {
    const a = await crearIdentidadVinculada();
    const v = await evaluarVinculoNodoId('doctor-01' as NodoId, a.exportarKemPublico());
    expect(v.estado).toBe('conflicto');
  });

  it('reports vinculado when the configured id already matches the key', async () => {
    const a = await crearIdentidadVinculada();
    const v = await evaluarVinculoNodoId(a.nodoId, a.exportarKemPublico(), true);
    expect(v.estado).toBe('vinculado');
  });
});

// ─── ML-KEM-768 ────────────────────────────────────────────────────────────

describe('ML-KEM-768 encapsulation', () => {
  it('generates a keypair carrying KEM material', () => {
    const kp = generateKeypair();
    expect(kp.algoritmo).toBe(ALGORITMOS.FIRMA);
    expect(kp.kemPublico).toBeInstanceOf(Uint8Array);
    expect(kp.kemPublico!.length).toBe(1184);
    expect(kp.kemPrivado!.length).toBe(2400);
  });

  it('recovers the public key from the private key', async () => {
    const a = await crearIdentidadVinculada();
    expect(bytesToBase64(a.obtenerKemPublico())).toBe(bytesToBase64(a.exportarKemPublico()));
  });

  it('roundtrips a shared secret between two real identities', async () => {
    const alice = await crearIdentidadVinculada();
    const bob = await crearIdentidadVinculada();

    const { cipherText, claveCompartida } = alice.encapsular(bob.exportarKemPublico());
    const recuperada = bob.decapsular(cipherText);

    expect(bytesToBase64(recuperada)).toBe(bytesToBase64(claveCompartida));
    expect(recuperada.length).toBe(32);
  });

  it('a third party holding the wrong key cannot recover the secret', async () => {
    const alice = await crearIdentidadVinculada();
    const bob = await crearIdentidadVinculada();
    const mallory = await crearIdentidadVinculada();

    const { cipherText, claveCompartida } = alice.encapsular(bob.exportarKemPublico());
    const deMallory = mallory.decapsular(cipherText);

    // Implicit rejection: a different key yields a different (wrong) secret.
    expect(bytesToBase64(deMallory)).not.toBe(bytesToBase64(claveCompartida));
  });

  it('derives an identical 32-byte symmetric key on both ends', async () => {
    const alice = await crearIdentidadVinculada();
    const bob = await crearIdentidadVinculada();

    // Alice encapsulates to Bob, so the ciphertext is addressed to BOB. Only Bob can decapsulate
    // it. Asking Alice to decapsulate it exercises ML-KEM's implicit rejection, which yields a
    // different pseudorandom value by design — that is the security property, not a bug. The
    // sender-side view of the same secret is the `claveCompartida` that `encapsular` returned.
    const { cipherText, claveCompartida } = alice.encapsular(bob.exportarKemPublico());
    const claveBob = await bob.derivarClaveSimetricaDesde(cipherText);
    const claveAlice = await derivarClaveSimetrica(claveCompartida);

    expect(claveBob.length).toBe(32);
    expect(bytesToBase64(claveBob)).toBe(bytesToBase64(claveAlice));
  });

  it('recovers KEM material after a serialize roundtrip', async () => {
    const bob = await crearIdentidadVinculada();
    const raw = Uint8Array.from(atob(serializeKeypair(bob.keypair)), (c) => c.codePointAt(0)!);
    const restored = identityFromSecret(bob.nodoId, raw);

    const alice = await crearIdentidadVinculada();
    const { cipherText, claveCompartida } = alice.encapsular(restored.exportarKemPublico());
    expect(bytesToBase64(restored.decapsular(cipherText))).toBe(bytesToBase64(claveCompartida));
  });
});

// ─── TOFU TRUST STORE ──────────────────────────────────────────────────────

describe('TOFU trust store', () => {
  it('pins the first key seen for a node', async () => {
    const store = new RegistroConfianzaClaves();
    const a = await crearIdentidadVinculada();
    expect(store.conocido(a.nodoId)).toBe(false);

    store.registrarClavePublica(a.nodoId, a.exportarPublico(), a.exportarKemPublico());
    expect(store.conocido(a.nodoId)).toBe(true);
    expect(store.verificarClavePublica(a.nodoId, a.exportarPublico())).toBe(true);
  });

  it('is idempotent when the same key is presented again', async () => {
    const store = new RegistroConfianzaClaves();
    const a = await crearIdentidadVinculada();
    store.registrarClavePublica(a.nodoId, a.exportarPublico(), a.exportarKemPublico());
    const antes = store.obtener(a.nodoId)!.primeraVez;

    store.registrarClavePublica(a.nodoId, a.exportarPublico(), a.exportarKemPublico());
    expect(store.obtener(a.nodoId)!.primeraVez).toBe(antes);
    expect(store.obtener(a.nodoId)!.rotaciones).toBe(0);
  });

  it('REJECTS a changed signature key instead of overwriting it', async () => {
    const store = new RegistroConfianzaClaves();
    const a = await crearIdentidadVinculada();
    const impostor = await crearIdentidadVinculada();
    store.registrarClavePublica(a.nodoId, a.exportarPublico(), a.exportarKemPublico());

    expect(() =>
      store.registrarClavePublica(a.nodoId, impostor.exportarPublico(), impostor.exportarKemPublico()),
    ).toThrow(ConflictoClavePublicaError);

    // Pinned key survives the rejected attempt.
    expect(store.verificarClavePublica(a.nodoId, a.exportarPublico())).toBe(true);
    expect(store.verificarClavePublica(a.nodoId, impostor.exportarPublico())).toBe(false);
  });

  it('REJECTS a changed ML-KEM key under the same node id', async () => {
    const store = new RegistroConfianzaClaves();
    const a = await crearIdentidadVinculada();
    const impostor = await crearIdentidadVinculada();
    store.registrarClavePublica(a.nodoId, a.exportarPublico(), a.exportarKemPublico());

    // Same signature key, swapped KEM key: still a violation.
    expect(() => store.registrarClavePublica(a.nodoId, a.exportarPublico(), impostor.exportarKemPublico())).toThrow(
      ConflictoClavePublicaError,
    );
  });

  it('accepts an explicit rotation and counts it', async () => {
    const store = new RegistroConfianzaClaves();
    const a = await crearIdentidadVinculada();
    const rotado = await crearIdentidadVinculada();
    store.registrarClavePublica(a.nodoId, a.exportarPublico(), a.exportarKemPublico());

    store.rotarClavePublica(a.nodoId, rotado.exportarPublico(), rotado.exportarKemPublico(), 'renovacion medica');
    expect(store.verificarClavePublica(a.nodoId, rotado.exportarPublico())).toBe(true);
    expect(store.obtener(a.nodoId)!.rotaciones).toBe(1);
  });

  it('persists and reloads, keeping the pin across sessions', async () => {
    const store = new RegistroConfianzaClaves();
    const a = await crearIdentidadVinculada();
    const impostor = await crearIdentidadVinculada();
    store.registrarClavePublica(a.nodoId, a.exportarPublico(), a.exportarKemPublico());

    const recargado = RegistroConfianzaClaves.fromJSON(JSON.parse(JSON.stringify(store)));
    expect(recargado.verificarClavePublica(a.nodoId, a.exportarPublico())).toBe(true);
    expect(() =>
      recargado.registrarClavePublica(a.nodoId, impostor.exportarPublico(), impostor.exportarKemPublico()),
    ).toThrow(ConflictoClavePublicaError);
  });

  it('works through a pluggable async store', async () => {
    let guardado: unknown = null;
    const disco = {
      cargar: async () => guardado,
      guardar: async (d: unknown) => {
        guardado = d;
      },
    };

    const a = await crearIdentidadVinculada();
    const store = await RegistroConfianzaClaves.abrir(disco);
    await store.registrarIdentidadPropia(a.nodoId, a);
    expect(guardado).not.toBeNull();

    const reabierto = await RegistroConfianzaClaves.abrir(disco);
    expect(reabierto.obtener(a.nodoId)?.nodoIdDerivado).toBe(a.nodoId);
  });

  it('forgets a node on explicit removal', async () => {
    const store = new RegistroConfianzaClaves();
    const a = await crearIdentidadVinculada();
    store.registrarClavePublica(a.nodoId, a.exportarPublico(), a.exportarKemPublico());
    expect(store.olvidar(a.nodoId)).toBe(true);
    expect(store.conocido(a.nodoId)).toBe(false);
  });
});

// ─── LEGACY SERIALIZATION COMPATIBILITY ────────────────────────────────────

describe('legacy serialization', () => {
  it('restores a v1 (pre-KEM) keypair and backfills KEM material', async () => {
    const kp = generateKeypair();
    // Rebuild a v1 blob: u32 privLen | u32 pubLen | priv | pub
    const privLen = kp.parPrivado.length;
    const pubLen = kp.parPublico.length;
    const v1 = new Uint8Array(8 + privLen + pubLen);
    const view = new DataView(v1.buffer);
    view.setUint32(0, privLen, true);
    view.setUint32(4, pubLen, true);
    v1.set(kp.parPrivado, 8);
    v1.set(kp.parPublico, 8 + privLen);

    const legacy = deserializeKeypair(bytesToBase64(v1));
    expect(legacy.kemPublico).toBeUndefined();

    const id = await crearIdentidadVinculada();
    const identity = createPostQuantumIdentity(id.nodoId, legacy);
    // Backfilled: the node is now encryptable, and its derived id differs
    // (auditable rotation rather than a silent one).
    expect(identity.exportarKemPublico().length).toBe(1184);
    expect(await derivarNodoId(identity.exportarKemPublico())).not.toBe(id.nodoId);
  });
});
