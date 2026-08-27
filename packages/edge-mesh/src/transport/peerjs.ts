import Peer, { type DataConnection } from 'peerjs';
import { createEnvelope, MessageDeduplicator } from '../protocol/index.js';
import type { Envolvente, NodoId, TipoMensaje, TipoTransporte } from '../types/index.js';
import { TIPO_MENSAJE, TIPO_TRANSPORTE } from '../types/index.js';
import type { BroadcastChannelLike, StorageLike } from './offline-mesh.js';
import { LocalDiscovery } from './offline-mesh.js';
import type { ITransport, TransportEventMap } from './types.js';

export interface PeerJSTransportOptions {
  readonly peerId: string;
  readonly host?: string;
  readonly port?: number;
  readonly path?: string;
  readonly key?: string;
  readonly debug?: number;
  readonly config?: RTCConfiguration;
  readonly signalingTimeoutMs?: number;
  readonly desactivarOfflineMesh?: boolean;
  readonly discoveryHeartbeatMs?: number;
  readonly discoveryExpiracionMs?: number;
  readonly canalDescubrimiento?: string;
  readonly claveDescubrimiento?: string;
  readonly discoveryStorage?: StorageLike | null;
  readonly discoveryCanalFactory?: () => BroadcastChannelLike | null;
  readonly localDiscovery?: LocalDiscovery | null;
}

export type { TransportEventMap };

export class PeerJSTransport implements ITransport {
  readonly tipo: TipoTransporte = TIPO_TRANSPORTE.PEERJS;
  readonly eventTarget: EventTarget;
  readonly nodoId: NodoId;
  private readonly peer: Peer;
  private readonly conexiones: Map<string, DataConnection>;
  private readonly deduplicator: MessageDeduplicator;
  private conectado: boolean = false;

  private readonly peerId: string;
  private readonly signalingTimeoutMs: number;
  private readonly desactivarOfflineMesh: boolean;
  private readonly discoveryHeartbeatMs: number | undefined;
  private readonly discoveryExpiracionMs: number | undefined;
  private readonly canalDescubrimiento: string | undefined;
  private readonly claveDescubrimiento: string | undefined;
  private readonly discoveryStorage: StorageLike | null | undefined;
  private readonly discoveryCanalFactory: (() => BroadcastChannelLike | null) | undefined;
  private descubrimientoLocal: LocalDiscovery | null;
  private readonly descubrimientoInyectado: boolean;

  private modoOffline = false;
  private timerSenalizacion: ReturnType<typeof setTimeout> | null = null;
  private readonly peersPendientes: Set<string> = new Set();
  private manejadorDescubrimiento: ((ev: CustomEvent<{ nodoId: NodoId; peerId: string; ts: number }>) => void) | null =
    null;

  constructor(nodoId: NodoId, options: PeerJSTransportOptions) {
    this.nodoId = nodoId;
    this.eventTarget = new EventTarget();
    this.conexiones = new Map();
    this.deduplicator = new MessageDeduplicator();

    this.peerId = options.peerId;
    this.signalingTimeoutMs = options.signalingTimeoutMs ?? 5000;
    this.desactivarOfflineMesh = options.desactivarOfflineMesh ?? false;
    this.discoveryHeartbeatMs = options.discoveryHeartbeatMs;
    this.discoveryExpiracionMs = options.discoveryExpiracionMs;
    this.canalDescubrimiento = options.canalDescubrimiento;
    this.claveDescubrimiento = options.claveDescubrimiento;
    this.discoveryStorage = options.discoveryStorage;
    this.discoveryCanalFactory = options.discoveryCanalFactory;
    this.descubrimientoLocal = options.localDiscovery ?? null;
    this.descubrimientoInyectado = options.localDiscovery !== undefined;

    this.peer = new Peer(options.peerId, {
      host: options.host,
      port: options.port,
      path: options.path,
      key: options.key,
      debug: options.debug,
      config: options.config,
    });

    this.peer.on('open', () => {
      this.limpiarTimeoutSenalizacion();
      this.conectado = true;
      this.emit('conectado', { nodoId: this.nodoId });
      if (this.modoOffline) {
        this.salirModoOffline('conectado');
      } else {
        this.procesarPendientes();
      }
    });

    this.peer.on('connection', (conn: DataConnection) => {
      this.manejarConexion(conn);
    });

    this.peer.on('disconnected', () => {
      this.conectado = false;
      this.emit('desconectado', { nodoId: this.nodoId });
    });

    this.peer.on('error', (error: Error) => {
      this.emit('error', { mensaje: error.message, error });
    });

    if (!this.desactivarOfflineMesh && this.signalingTimeoutMs > 0) {
      this.iniciarTimeoutSenalizacion(this.signalingTimeoutMs);
    }
  }

  on<K extends keyof TransportEventMap>(tipo: K, handler: (ev: TransportEventMap[K]) => void): void {
    this.eventTarget.addEventListener(tipo as string, handler as EventListener);
  }

  off<K extends keyof TransportEventMap>(tipo: K, handler: (ev: TransportEventMap[K]) => void): void {
    this.eventTarget.removeEventListener(tipo as string, handler as EventListener);
  }

  private emit<K extends keyof TransportEventMap>(tipo: K, detalle: TransportEventMap[K]['detail']): void {
    const evento = new CustomEvent(tipo as string, { detail: detalle });
    this.eventTarget.dispatchEvent(evento);
  }

  private manejarConexion(conn: DataConnection): void {
    const nodoRemoto = conn.peer as NodoId;
    this.conexiones.set(nodoRemoto, conn);
    conn.on('data', (datos: unknown) => {
      this.manejarDatos(datos);
    });
    conn.on('close', () => {
      this.conexiones.delete(nodoRemoto);
      this.emit('desconectado', { nodoId: nodoRemoto });
    });
    conn.on('error', (error: Error) => {
      this.emit('error', {
        mensaje: `Conexion error con ${nodoRemoto}`,
        error,
      });
    });
    this.emit('conectado', { nodoId: nodoRemoto });
  }

  private manejarDatos(datos: unknown): void {
    if (!esEnvolvente(datos)) return;
    if (this.deduplicator.esDuplicado(datos)) return;
    this.emit('mensaje', { envolvente: datos });
  }

  async enviar(destino: NodoId, payload: unknown, tipoMensaje: string = TIPO_MENSAJE.SYNC): Promise<void> {
    const conn = this.conexiones.get(destino);
    if (conn === undefined) {
      throw new Error(`No hay conexion con el nodo ${destino}`);
    }
    if (esEnvolvente(payload)) {
      conn.send(payload);
      return;
    }
    const env = createEnvelope(tipoMensaje as TipoMensaje, this.nodoId, destino, payload);
    conn.send(env);
  }

  async transmitir(payload: unknown, tipoMensaje: string = TIPO_MENSAJE.SYNC): Promise<void> {
    const env = esEnvolvente(payload) ? payload : createEnvelope(tipoMensaje as TipoMensaje, this.nodoId, '*', payload);
    const promesas: Promise<void>[] = [];
    for (const conn of this.conexiones.values()) {
      promesas.push(
        new Promise<void>((resolve) => {
          try {
            conn.send(env);
          } catch {}
          resolve();
        }),
      );
    }
    await Promise.all(promesas);
  }

  async conectarRemoto(remotoId: string): Promise<void> {
    const conn = this.peer.connect(remotoId, {
      reliable: true,
      serialization: 'json',
    });
    this.manejarConexion(conn);
  }

  private iniciarTimeoutSenalizacion(timeoutMs: number): void {
    this.limpiarTimeoutSenalizacion();
    this.timerSenalizacion = setTimeout(() => {
      this.timerSenalizacion = null;
      if (!this.conectado) {
        this.entrarModoOffline('timeout');
      }
    }, timeoutMs);
  }

  private limpiarTimeoutSenalizacion(): void {
    if (this.timerSenalizacion !== null) {
      clearTimeout(this.timerSenalizacion);
      this.timerSenalizacion = null;
    }
  }

  private entrarModoOffline(motivo: string): void {
    if (this.modoOffline) return;
    this.modoOffline = true;
    this.emit('modo-offline', { nodoId: this.nodoId, offline: true, motivo });
    if (this.descubrimientoLocal === null && !this.descubrimientoInyectado) {
      this.descubrimientoLocal = this.crearDescubrimientoLocal();
    }
    const discovery = this.descubrimientoLocal;
    if (discovery === null) return;
    this.manejadorDescubrimiento = (ev: CustomEvent<{ nodoId: NodoId; peerId: string }>) => {
      const { peerId } = ev.detail;
      if (peerId === this.peerId) return;
      if (this.conexiones.has(peerId as NodoId)) return;
      this.emit('peer-descubierto', { nodoId: ev.detail.nodoId, peerId });
      if (this.conectado) {
        this.conectarRemoto(peerId).catch(() => {
          this.peersPendientes.add(peerId);
        });
      } else {
        this.peersPendientes.add(peerId);
      }
    };
    try {
      discovery.on(
        'peer-descubierto',
        this.manejadorDescubrimiento as unknown as (
          ev: CustomEvent<{ nodoId: NodoId; peerId: string; ts: number }>,
        ) => void,
      );
    } catch {}
    try {
      discovery.iniciar();
    } catch {}
  }

  private salirModoOffline(motivo: string): void {
    if (!this.modoOffline) return;
    this.modoOffline = false;
    this.emit('modo-offline', { nodoId: this.nodoId, offline: false, motivo });
    const discovery = this.descubrimientoLocal;
    if (discovery !== null) {
      try {
        if (this.manejadorDescubrimiento !== null) {
          discovery.off(
            'peer-descubierto',
            this.manejadorDescubrimiento as unknown as (
              ev: CustomEvent<{ nodoId: NodoId; peerId: string; ts: number }>,
            ) => void,
          );
        }
      } catch {}
      try {
        discovery.detener();
      } catch {}
    }
    this.manejadorDescubrimiento = null;
    this.procesarPendientes();
  }

  private procesarPendientes(): void {
    if (this.peersPendientes.size === 0) return;
    if (!this.conectado) return;
    const pendientes = Array.from(this.peersPendientes);
    this.peersPendientes.clear();
    for (const pid of pendientes) {
      if (this.conexiones.has(pid as NodoId)) continue;
      this.conectarRemoto(pid).catch(() => {
        this.peersPendientes.add(pid);
      });
    }
  }

  private crearDescubrimientoLocal(): LocalDiscovery | null {
    try {
      return new LocalDiscovery({
        nodoId: this.nodoId,
        peerId: this.peerId,
        canalNombre: this.canalDescubrimiento,
        claveStorage: this.claveDescubrimiento,
        heartbeatMs: this.discoveryHeartbeatMs,
        expiracionMs: this.discoveryExpiracionMs,
        storage: this.discoveryStorage,
        canalFactory: this.discoveryCanalFactory,
      });
    } catch {
      return null;
    }
  }

  estaConectado(): boolean {
    return this.conectado;
  }

  esModoOffline(): boolean {
    return this.modoOffline;
  }

  obtenerDescubrimiento(): LocalDiscovery | null {
    return this.descubrimientoLocal;
  }

  obtenerConexiones(): readonly string[] {
    return Array.from(this.conexiones.keys());
  }

  async cerrar(): Promise<void> {
    this.limpiarTimeoutSenalizacion();
    if (this.modoOffline) {
      const discovery = this.descubrimientoLocal;
      if (discovery !== null) {
        try {
          if (this.manejadorDescubrimiento !== null) {
            discovery.off(
              'peer-descubierto',
              this.manejadorDescubrimiento as unknown as (
                ev: CustomEvent<{ nodoId: NodoId; peerId: string; ts: number }>,
              ) => void,
            );
          }
          discovery.detener();
        } catch {}
      }
      this.manejadorDescubrimiento = null;
    }
    for (const conn of this.conexiones.values()) {
      try {
        conn.close();
      } catch {}
    }
    this.conexiones.clear();
    try {
      this.peer.destroy();
    } catch {}
    this.conectado = false;
    this.modoOffline = false;
    this.peersPendientes.clear();
    this.deduplicator.reiniciar();
  }
}

function esEnvolvente(valor: unknown): valor is Envolvente {
  if (typeof valor !== 'object' || valor === null) return false;
  const candidate = valor as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.tipo === 'string' &&
    typeof candidate.origen === 'string' &&
    typeof candidate.destino === 'string' &&
    typeof candidate.timestamp === 'number' &&
    candidate.payload !== undefined
  );
}
