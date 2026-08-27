import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDiscovery } from '../../src/transport/offline-mesh.js';
import { PeerJSTransport } from '../../src/transport/peerjs.js';
import type { NodoId } from '../../src/types/index.js';

vi.mock('peerjs', () => {
  class MockPeer {
    on = vi.fn();
    connect = vi.fn(() => ({
      peer: 'remote-peer',
      on: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
    }));
    destroy = vi.fn();
    disconnect = vi.fn();
  }
  return { default: MockPeer };
});

vi.mock('idb', () => ({
  openDB: vi.fn(),
}));

function createFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as unknown as Storage;
}

type MockChannelInstance = {
  name: string;
  postMessage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  onmessage: ((ev: MessageEvent) => void) | null;
  triggerMessage: (data: unknown) => void;
  instances: MockChannelInstance[];
};

function createMockBroadcastChannel(): {
  MockBC: new (name: string) => MockChannelInstance;
  instances: MockChannelInstance[];
} {
  const instances: MockChannelInstance[] = [];
  class MockBC implements MockChannelInstance {
    name: string;
    postMessage = vi.fn();
    close = vi.fn();
    addEventListener = vi.fn((type: string, handler: (ev: MessageEvent) => void) => {
      if (type === 'message') this.onmessage = handler;
    });
    removeEventListener = vi.fn((type: string, handler: (ev: MessageEvent) => void) => {
      if (type === 'message' && this.onmessage === handler) this.onmessage = null;
    });
    onmessage: ((ev: MessageEvent) => void) | null = null;
    instances = instances;
    constructor(name: string) {
      this.name = name;
      instances.push(this);
    }
    triggerMessage(data: unknown) {
      const ev = { data } as MessageEvent;
      if (this.onmessage) this.onmessage(ev);
    }
  }
  return { MockBC: MockBC as unknown as new (name: string) => MockChannelInstance, instances };
}

describe('LocalDiscovery', () => {
  let fakeStorage: Storage;
  let mockBC: { MockBC: new (name: string) => MockChannelInstance; instances: MockChannelInstance[] };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fakeStorage = createFakeStorage();
    mockBC = createMockBroadcastChannel();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('al iniciar, registra peer en localStorage y hace postMessage', () => {
    vi.stubGlobal('BroadcastChannel', mockBC.MockBC);
    vi.stubGlobal('localStorage', fakeStorage);

    const discovery = new LocalDiscovery({
      nodoId: 'nodo-a' as NodoId,
      peerId: 'peer-a',
      canalNombre: 'shelf-mesh-discovery',
      claveStorage: 'shelf:mesh:peers',
      heartbeatMs: 2500,
      expiracionMs: 10000,
    });

    discovery.iniciar();

    const raw = fakeStorage.getItem('shelf:mesh:peers');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as Record<string, { peerId: string; nodoId: string }>;
    expect(parsed['peer-a']).toBeDefined();
    expect(parsed['peer-a'].peerId).toBe('peer-a');

    expect(mockBC.instances.length).toBe(1);
    const canal = mockBC.instances[0] as MockChannelInstance;
    expect(canal.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ peerId: 'peer-a', nodoId: 'nodo-a', tipo: 'shelf:discovery' }),
    );

    discovery.detener();
  });

  it('al recibir anuncio de otro peer, lo emite y registra', () => {
    vi.stubGlobal('BroadcastChannel', mockBC.MockBC);
    vi.stubGlobal('localStorage', fakeStorage);

    const discovery = new LocalDiscovery({
      nodoId: 'nodo-a' as NodoId,
      peerId: 'peer-a',
      heartbeatMs: 2500,
      expiracionMs: 10000,
    });

    const spy = vi.fn();
    discovery.on('peer-descubierto', spy);
    discovery.iniciar();

    const canal = mockBC.instances[0] as MockChannelInstance;
    canal.triggerMessage({ tipo: 'shelf:discovery', peerId: 'peer-b', nodoId: 'nodo-b', ts: Date.now() });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ peerId: 'peer-b', nodoId: 'nodo-b' }) }),
    );
    expect(discovery.obtenerPeers().some((p) => p.peerId === 'peer-b')).toBe(true);

    discovery.detener();
  });

  it('expiración por heartbeat: peers muertos se eliminan tras ~10s', async () => {
    vi.stubGlobal('BroadcastChannel', mockBC.MockBC);
    vi.stubGlobal('localStorage', fakeStorage);

    const discovery = new LocalDiscovery({
      nodoId: 'nodo-a' as NodoId,
      peerId: 'peer-a',
      heartbeatMs: 2500,
      expiracionMs: 10000,
    });

    const expiradoSpy = vi.fn();
    discovery.on('peer-expirado', expiradoSpy);
    discovery.iniciar();

    const canal = mockBC.instances[0] as MockChannelInstance;
    canal.triggerMessage({ tipo: 'shelf:discovery', peerId: 'peer-b', nodoId: 'nodo-b', ts: Date.now() });
    expect(discovery.obtenerPeers().length).toBe(1);

    await vi.advanceTimersByTimeAsync(12000);

    expect(discovery.obtenerPeers().length).toBe(0);
    expect(expiradoSpy).toHaveBeenCalled();

    discovery.detener();
  });

  it('sin BroadcastChannel disponible → no crashea y degrada a storage', () => {
    vi.stubGlobal('BroadcastChannel', undefined as unknown as typeof BroadcastChannel);
    vi.stubGlobal('localStorage', fakeStorage);

    const discovery = new LocalDiscovery({
      nodoId: 'nodo-a' as NodoId,
      peerId: 'peer-a',
    });

    expect(() => discovery.iniciar()).not.toThrow();
    expect(() => discovery.anunciar()).not.toThrow();
    expect(discovery.estaActivo()).toBe(true);
    const raw = fakeStorage.getItem('shelf:mesh:peers');
    expect(raw).not.toBeNull();

    discovery.detener();
    expect(discovery.estaActivo()).toBe(false);
  });

  it('sin BroadcastChannel ni localStorage → no crashea (degradado total)', () => {
    vi.stubGlobal('BroadcastChannel', undefined as unknown as typeof BroadcastChannel);
    vi.stubGlobal('localStorage', undefined as unknown as Storage);

    const discovery = new LocalDiscovery({
      nodoId: 'nodo-a' as NodoId,
      peerId: 'peer-a',
      storage: null,
      canalFactory: () => null,
    });

    expect(() => discovery.iniciar()).not.toThrow();
    expect(discovery.estaActivo()).toBe(true);
    expect(discovery.esDisponible()).toBe(false);
    expect(() => discovery.anunciar()).not.toThrow();
    expect(() => discovery.detener()).not.toThrow();
  });

  it('sincroniza peers desde localStorage al anunciar', () => {
    vi.stubGlobal('BroadcastChannel', mockBC.MockBC);
    const preStorage = createFakeStorage();
    const ahora = Date.now();
    preStorage.setItem(
      'shelf:mesh:peers',
      JSON.stringify({
        'peer-b': { nodoId: 'nodo-b', peerId: 'peer-b', ts: ahora },
      }),
    );
    vi.stubGlobal('localStorage', preStorage);

    const discovery = new LocalDiscovery({
      nodoId: 'nodo-a' as NodoId,
      peerId: 'peer-a',
      heartbeatMs: 2500,
      expiracionMs: 10000,
    });

    const spy = vi.fn();
    discovery.on('peer-descubierto', spy);
    discovery.iniciar();

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ peerId: 'peer-b' }) }),
    );

    discovery.detener();
  });
});

describe('PeerJSTransport fallback offline', () => {
  let fakeStorage: Storage;
  let mockBC: { MockBC: new (name: string) => MockChannelInstance; instances: MockChannelInstance[] };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeStorage = createFakeStorage();
    mockBC = createMockBroadcastChannel();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('(a) si open no llega en 5s → se activa offline', async () => {
    vi.stubGlobal('BroadcastChannel', mockBC.MockBC);
    vi.stubGlobal('localStorage', fakeStorage);

    const transport = new PeerJSTransport('nodo-1' as NodoId, {
      peerId: 'peer-1',
      signalingTimeoutMs: 5000,
      discoveryStorage: fakeStorage as unknown as import('../../src/transport/offline-mesh.js').StorageLike,
      discoveryCanalFactory: () => mockBC.instances[0] ?? new mockBC.MockBC('shelf-mesh-discovery'),
    });

    const modoOfflineSpy = vi.fn();
    transport.on('modo-offline', modoOfflineSpy);

    await vi.advanceTimersByTimeAsync(5000);

    expect(modoOfflineSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ offline: true, nodoId: 'nodo-1' }) }),
    );
    expect(transport.esModoOffline()).toBe(true);
    const discovery = transport.obtenerDescubrimiento();
    expect(discovery).not.toBeNull();
    expect(discovery?.estaActivo()).toBe(true);

    await transport.cerrar();
  });

  it('(a) con LocalDiscovery inyectado: iniciar es llamado', async () => {
    const fakeDiscovery = new LocalDiscovery({
      nodoId: 'nodo-1' as NodoId,
      peerId: 'peer-1',
      storage: fakeStorage as unknown as import('../../src/transport/offline-mesh.js').StorageLike,
      canalFactory: () => mockBC.instances[0] ?? new mockBC.MockBC('shelf-mesh-discovery'),
    });
    const iniciarSpy = vi.spyOn(fakeDiscovery, 'iniciar');
    vi.stubGlobal('BroadcastChannel', mockBC.MockBC);
    vi.stubGlobal('localStorage', fakeStorage);

    const transport = new PeerJSTransport('nodo-1' as NodoId, {
      peerId: 'peer-1',
      signalingTimeoutMs: 3000,
      localDiscovery: fakeDiscovery,
    });

    const spy = vi.fn();
    transport.on('modo-offline', spy);

    await vi.advanceTimersByTimeAsync(3000);

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ offline: true }) }));
    expect(iniciarSpy).toHaveBeenCalled();

    await transport.cerrar();
    expect(fakeDiscovery.estaActivo()).toBe(false);
  });

  it('(c) al llegar open después → offline se desactiva', async () => {
    const fakeDiscovery = new LocalDiscovery({
      nodoId: 'nodo-1' as NodoId,
      peerId: 'peer-1',
      storage: fakeStorage as unknown as import('../../src/transport/offline-mesh.js').StorageLike,
      canalFactory: () => new mockBC.MockBC('shelf-mesh-discovery'),
    });
    const detenerSpy = vi.spyOn(fakeDiscovery, 'detener');

    const transport = new PeerJSTransport('nodo-1' as NodoId, {
      peerId: 'peer-1',
      signalingTimeoutMs: 5000,
      localDiscovery: fakeDiscovery,
    });

    const offlineSpy = vi.fn();
    transport.on('modo-offline', offlineSpy);

    await vi.advanceTimersByTimeAsync(5000);
    expect(transport.esModoOffline()).toBe(true);
    expect(offlineSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ offline: true }) }),
    );

    // @ts-expect-error acceso privado para test
    const peerInstance = (transport as unknown as { peer: { on: ReturnType<typeof vi.fn> } }).peer;
    const openHandler = peerInstance.on.mock.calls.find((c: unknown[]) => (c as string[])[0] === 'open')?.[1] as
      | (() => void)
      | undefined;
    expect(openHandler).toBeDefined();
    openHandler?.();

    expect(offlineSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ offline: false }) }),
    );
    expect(transport.esModoOffline()).toBe(false);
    expect(detenerSpy).toHaveBeenCalled();

    await transport.cerrar();
  });

  it('(c) si open llega antes del timeout → no entra en offline', async () => {
    const transport = new PeerJSTransport('nodo-1' as NodoId, {
      peerId: 'peer-1',
      signalingTimeoutMs: 5000,
      desactivarOfflineMesh: false,
    });

    const offlineSpy = vi.fn();
    transport.on('modo-offline', offlineSpy);

    // @ts-expect-error
    const peerInstance = (transport as unknown as { peer: { on: ReturnType<typeof vi.fn> } }).peer;
    const openHandler = peerInstance.on.mock.calls.find((c: unknown[]) => (c as string[])[0] === 'open')?.[1] as
      | (() => void)
      | undefined;
    openHandler?.();

    await vi.advanceTimersByTimeAsync(6000);

    expect(offlineSpy).not.toHaveBeenCalled();
    expect(transport.esModoOffline()).toBe(false);

    await transport.cerrar();
  });

  it('(d) sin BroadcastChannel disponible → no crashea y timeout sigue emitiendo offline', async () => {
    vi.stubGlobal('BroadcastChannel', undefined as unknown as typeof BroadcastChannel);
    vi.stubGlobal('localStorage', fakeStorage);

    const transport = new PeerJSTransport('nodo-1' as NodoId, {
      peerId: 'peer-1',
      signalingTimeoutMs: 2000,
      discoveryCanalFactory: () => null,
      discoveryStorage: fakeStorage as unknown as import('../../src/transport/offline-mesh.js').StorageLike,
    });

    const spy = vi.fn();
    transport.on('modo-offline', spy);

    await vi.advanceTimersByTimeAsync(2000);

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ offline: true }) }));
    expect(transport.esModoOffline()).toBe(true);
    expect(transport.obtenerDescubrimiento()).not.toBeNull();

    await transport.cerrar();
  });

  it('timeout se cancela al recibir open, maneja 1 solo timer y limpiar en cerrar', async () => {
    const transport = new PeerJSTransport('nodo-1' as NodoId, {
      peerId: 'peer-1',
      signalingTimeoutMs: 5000,
    });

    const spy = vi.fn();
    transport.on('modo-offline', spy);

    await transport.cerrar();
    await vi.advanceTimersByTimeAsync(6000);
    expect(spy).not.toHaveBeenCalled();
    expect(transport.esModoOffline()).toBe(false);

    const transport2 = new PeerJSTransport('nodo-2' as NodoId, {
      peerId: 'peer-2',
      signalingTimeoutMs: 5000,
    });
    const spy2 = vi.fn();
    transport2.on('modo-offline', spy2);
    // @ts-expect-error
    const peer2 = (transport2 as unknown as { peer: { on: ReturnType<typeof vi.fn> } }).peer;
    const open2 = peer2.on.mock.calls.find((c: unknown[]) => (c as string[])[0] === 'open')?.[1] as () => void;
    await vi.advanceTimersByTimeAsync(2000);
    open2();
    await vi.advanceTimersByTimeAsync(4000);
    expect(spy2).not.toHaveBeenCalled();
    await transport2.cerrar();
  });

  it('peers descubiertos se conectan vía conectarRemoto cuando está conectado, o quedan pendientes', async () => {
    const fakeDiscovery = new LocalDiscovery({
      nodoId: 'nodo-1' as NodoId,
      peerId: 'peer-1',
      storage: fakeStorage as unknown as import('../../src/transport/offline-mesh.js').StorageLike,
      canalFactory: () => new mockBC.MockBC('shelf-mesh-discovery'),
    });

    const transport = new PeerJSTransport('nodo-1' as NodoId, {
      peerId: 'peer-1',
      signalingTimeoutMs: 1000,
      localDiscovery: fakeDiscovery,
    });

    const conectarSpy = vi.spyOn(transport, 'conectarRemoto').mockResolvedValue(undefined);

    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.esModoOffline()).toBe(true);

    (fakeDiscovery.eventTarget.dispatchEvent as unknown as (ev: Event) => void)(
      new CustomEvent('peer-descubierto', { detail: { nodoId: 'nodo-b' as NodoId, peerId: 'peer-b', ts: Date.now() } }),
    );

    expect(conectarSpy).not.toHaveBeenCalled();

    // @ts-expect-error
    const peerInstance = (transport as unknown as { peer: { on: ReturnType<typeof vi.fn> } }).peer;
    const openHandler = peerInstance.on.mock.calls.find((c: unknown[]) => (c as string[])[0] === 'open')?.[1] as
      | (() => void)
      | undefined;
    openHandler?.();

    await vi.advanceTimersByTimeAsync(0);
    expect(conectarSpy).toHaveBeenCalledWith('peer-b');

    await transport.cerrar();
  });
});
