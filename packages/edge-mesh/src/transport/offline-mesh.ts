import type { NodoId } from '../types/index.js';

const CANAL_POR_DEFECTO = 'shelf-mesh-discovery';
const CLAVE_POR_DEFECTO = 'shelf:mesh:peers';
const HEARTBEAT_MS_POR_DEFECTO = 2500;
const EXPIRACION_MS_POR_DEFECTO = 10000;
const TIPO_MENSAJE = 'shelf:discovery';

export interface EntradaDescubrimiento {
  readonly nodoId: NodoId;
  readonly peerId: string;
  readonly ts: number;
}

export interface LocalDiscoveryOptions {
  readonly nodoId: NodoId;
  readonly peerId: string;
  readonly canalNombre?: string;
  readonly claveStorage?: string;
  readonly heartbeatMs?: number;
  readonly expiracionMs?: number;
  readonly storage?: StorageLike | null | undefined;
  readonly canalFactory?: (() => BroadcastChannelLike | null) | undefined;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BroadcastChannelLike {
  readonly name: string;
  postMessage(message: unknown): void;
  close(): void;
  addEventListener?(type: string, listener: (ev: MessageEvent) => void): void;
  removeEventListener?(type: string, listener: (ev: MessageEvent) => void): void;
  onmessage?: ((ev: MessageEvent) => void) | null;
  onmessageerror?: ((ev: MessageEvent) => void) | null;
}

export interface LocalDiscoveryEventMap {
  'peer-descubierto': CustomEvent<EntradaDescubrimiento>;
  'peer-expirado': CustomEvent<EntradaDescubrimiento>;
}

export class LocalDiscovery {
  readonly eventTarget: EventTarget;
  readonly nodoId: NodoId;
  readonly peerId: string;

  private readonly canalNombre: string;
  private readonly claveStorage: string;
  private readonly heartbeatMs: number;
  private readonly expiracionMs: number;
  private readonly storageOverride: StorageLike | null | undefined;
  private readonly canalFactoryOverride: (() => BroadcastChannelLike | null) | undefined;

  private canal: BroadcastChannelLike | null = null;
  private timerHeartbeat: ReturnType<typeof setInterval> | null = null;
  private timerLimpieza: ReturnType<typeof setInterval> | null = null;
  private activo = false;
  private readonly peersConocidos: Map<string, EntradaDescubrimiento> = new Map();
  private canalDisponible = false;
  private storageDisponible = false;

  constructor(options: LocalDiscoveryOptions) {
    this.nodoId = options.nodoId;
    this.peerId = options.peerId;
    this.canalNombre = options.canalNombre ?? CANAL_POR_DEFECTO;
    this.claveStorage = options.claveStorage ?? CLAVE_POR_DEFECTO;
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS_POR_DEFECTO;
    this.expiracionMs = options.expiracionMs ?? EXPIRACION_MS_POR_DEFECTO;
    this.storageOverride = options.storage;
    this.canalFactoryOverride = options.canalFactory;
    this.eventTarget = new EventTarget();
  }

  on<K extends keyof LocalDiscoveryEventMap>(tipo: K, handler: (ev: LocalDiscoveryEventMap[K]) => void): void {
    this.eventTarget.addEventListener(tipo as string, handler as EventListener);
  }

  off<K extends keyof LocalDiscoveryEventMap>(tipo: K, handler: (ev: LocalDiscoveryEventMap[K]) => void): void {
    this.eventTarget.removeEventListener(tipo as string, handler as EventListener);
  }

  private emit<K extends keyof LocalDiscoveryEventMap>(tipo: K, detalle: LocalDiscoveryEventMap[K]['detail']): void {
    const evento = new CustomEvent(tipo as string, { detail: detalle });
    this.eventTarget.dispatchEvent(evento);
  }

  estaActivo(): boolean {
    return this.activo;
  }

  esDisponible(): boolean {
    return this.canalDisponible || this.storageDisponible;
  }

  obtenerPeers(): readonly EntradaDescubrimiento[] {
    return Array.from(this.peersConocidos.values()).filter((e) => e.peerId !== this.peerId);
  }

  iniciar(): void {
    if (this.activo) return;
    this.activo = true;
    const storage = this.obtenerStorage();
    this.storageDisponible = storage !== null;
    const canal = this.crearCanal();
    if (canal !== null) {
      this.canal = canal;
      this.canalDisponible = true;
      this.vincularCanal(canal);
    } else {
      this.canalDisponible = false;
    }
    if (!this.canalDisponible && !this.storageDisponible) {
      return;
    }
    this.anunciar();
    this.timerHeartbeat = setInterval(() => {
      this.anunciar();
    }, this.heartbeatMs);
    const intervaloLimpieza = Math.min(this.heartbeatMs * 2, this.expiracionMs);
    this.timerLimpieza = setInterval(() => {
      this.limpiarExpirados();
      this.sincronizarDesdeStorage();
    }, intervaloLimpieza);
  }

  detener(): void {
    if (!this.activo) return;
    this.activo = false;
    if (this.timerHeartbeat !== null) {
      clearInterval(this.timerHeartbeat);
      this.timerHeartbeat = null;
    }
    if (this.timerLimpieza !== null) {
      clearInterval(this.timerLimpieza);
      this.timerLimpieza = null;
    }
    try {
      const storage = this.obtenerStorage();
      if (storage !== null) {
        const registro = this.leerRegistro(storage);
        registro.delete(this.peerId);
        this.escribirRegistro(storage, registro);
      }
    } catch {}
    if (this.canal !== null) {
      try {
        if (this.canal.removeEventListener && this.manejadorMensaje) {
          this.canal.removeEventListener('message', this.manejadorMensaje);
        }
        if (this.canal.onmessage === this.manejadorMensaje) {
          this.canal.onmessage = null;
        }
        this.canal.close();
      } catch {}
      this.canal = null;
    }
    this.canalDisponible = false;
  }

  anunciar(): void {
    if (!this.activo) return;
    const ahora = Date.now();
    const entrada: EntradaDescubrimiento = {
      nodoId: this.nodoId,
      peerId: this.peerId,
      ts: ahora,
    };
    this.peersConocidos.set(this.peerId, entrada);
    try {
      const storage = this.obtenerStorage();
      if (storage !== null) {
        const registro = this.leerRegistro(storage);
        registro.set(this.peerId, entrada);
        this.escribirRegistro(storage, registro);
        this.sincronizarDesdeStorageConRegistro(registro, ahora);
      }
    } catch {}
    try {
      if (this.canal !== null) {
        const mensaje = {
          tipo: TIPO_MENSAJE,
          peerId: this.peerId,
          nodoId: this.nodoId,
          ts: ahora,
        };
        this.canal.postMessage(mensaje);
      }
    } catch {}
  }

  private obtenerStorage(): StorageLike | null {
    if (this.storageOverride === null) return null;
    if (this.storageOverride !== undefined) return this.storageOverride;
    try {
      const g: unknown = globalThis as unknown;
      const maybe =
        (g as { localStorage?: StorageLike }).localStorage ??
        (g as { window?: { localStorage?: StorageLike } }).window?.localStorage ??
        null;
      if (maybe !== null && typeof maybe.getItem === 'function' && typeof maybe.setItem === 'function') {
        const clavePrueba = '__shelf_test__';
        try {
          maybe.setItem(clavePrueba, '1');
          maybe.removeItem(clavePrueba);
        } catch {
          return null;
        }
        return maybe;
      }
      return null;
    } catch {
      return null;
    }
  }

  private leerRegistro(storage: StorageLike): Map<string, EntradaDescubrimiento> {
    try {
      const raw = storage.getItem(this.claveStorage);
      if (raw === null || raw === '') return new Map();
      const parsed = JSON.parse(raw) as Record<string, EntradaDescubrimiento>;
      const mapa = new Map<string, EntradaDescubrimiento>();
      for (const [k, v] of Object.entries(parsed)) {
        if (
          typeof v === 'object' &&
          v !== null &&
          typeof (v as { peerId?: unknown }).peerId === 'string' &&
          typeof (v as { nodoId?: unknown }).nodoId === 'string' &&
          typeof (v as { ts?: unknown }).ts === 'number'
        ) {
          mapa.set(k, {
            nodoId: v.nodoId as NodoId,
            peerId: (v as { peerId: string }).peerId,
            ts: (v as { ts: number }).ts,
          });
        }
      }
      return mapa;
    } catch {
      return new Map();
    }
  }

  private escribirRegistro(storage: StorageLike, registro: Map<string, EntradaDescubrimiento>): void {
    try {
      const obj: Record<string, EntradaDescubrimiento> = {};
      for (const [k, v] of registro.entries()) {
        obj[k] = v;
      }
      storage.setItem(this.claveStorage, JSON.stringify(obj));
    } catch {}
  }

  private sincronizarDesdeStorage(): void {
    try {
      const storage = this.obtenerStorage();
      if (storage === null) return;
      const registro = this.leerRegistro(storage);
      this.sincronizarDesdeStorageConRegistro(registro, Date.now());
    } catch {}
  }

  private sincronizarDesdeStorageConRegistro(registro: Map<string, EntradaDescubrimiento>, ahora: number): void {
    for (const [peerId, entrada] of registro.entries()) {
      if (peerId === this.peerId) continue;
      if (ahora - entrada.ts >= this.expiracionMs) continue;
      const previo = this.peersConocidos.get(peerId);
      if (previo === undefined || entrada.ts > previo.ts) {
        this.peersConocidos.set(peerId, entrada);
        if (previo === undefined) {
          this.emit('peer-descubierto', { nodoId: entrada.nodoId, peerId: entrada.peerId, ts: entrada.ts });
        }
      }
    }
  }

  private limpiarExpirados(): void {
    const ahora = Date.now();
    const expirados: EntradaDescubrimiento[] = [];
    for (const [peerId, entrada] of this.peersConocidos.entries()) {
      if (peerId === this.peerId) continue;
      if (ahora - entrada.ts >= this.expiracionMs) {
        expirados.push(entrada);
        this.peersConocidos.delete(peerId);
      }
    }
    for (const e of expirados) {
      this.emit('peer-expirado', e);
    }
    try {
      const storage = this.obtenerStorage();
      if (storage !== null) {
        const registro = this.leerRegistro(storage);
        let modificado = false;
        for (const [peerId, entrada] of registro.entries()) {
          if (ahora - entrada.ts >= this.expiracionMs && peerId !== this.peerId) {
            registro.delete(peerId);
            modificado = true;
          }
        }
        if (modificado) this.escribirRegistro(storage, registro);
      }
    } catch {}
  }

  private crearCanal(): BroadcastChannelLike | null {
    if (this.canalFactoryOverride !== undefined) {
      try {
        return this.canalFactoryOverride();
      } catch {
        return null;
      }
    }
    try {
      const maybeBC = (globalThis as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;
      if (typeof maybeBC !== 'function') return null;
      const bc = new (maybeBC as unknown as new (name: string) => BroadcastChannelLike)(this.canalNombre);
      return bc;
    } catch {
      return null;
    }
  }

  private readonly manejadorMensaje = (ev: MessageEvent | { data: unknown }): void => {
    try {
      const data: unknown = (ev as MessageEvent).data ?? (ev as { data: unknown }).data;
      if (typeof data !== 'object' || data === null) return;
      const msg = data as Record<string, unknown>;
      if (msg.tipo !== TIPO_MENSAJE) return;
      if (typeof msg.peerId !== 'string' || typeof msg.nodoId !== 'string' || typeof msg.ts !== 'number') return;
      if (msg.peerId === this.peerId) return;
      const entrada: EntradaDescubrimiento = {
        nodoId: msg.nodoId as NodoId,
        peerId: msg.peerId as string,
        ts: msg.ts as number,
      };
      try {
        const storage = this.obtenerStorage();
        if (storage !== null) {
          const registro = this.leerRegistro(storage);
          registro.set(entrada.peerId, entrada);
          this.escribirRegistro(storage, registro);
        }
      } catch {}
      const previo = this.peersConocidos.get(entrada.peerId);
      const esNuevo = previo === undefined;
      if (previo === undefined || entrada.ts >= previo.ts) {
        this.peersConocidos.set(entrada.peerId, entrada);
      }
      if (esNuevo) {
        this.emit('peer-descubierto', entrada);
      }
    } catch {}
  };

  private vincularCanal(canal: BroadcastChannelLike): void {
    try {
      if (typeof canal.addEventListener === 'function') {
        canal.addEventListener('message', this.manejadorMensaje as (ev: MessageEvent) => void);
      } else {
        canal.onmessage = this.manejadorMensaje as (ev: MessageEvent) => void;
      }
    } catch {
      try {
        canal.onmessage = this.manejadorMensaje as (ev: MessageEvent) => void;
      } catch {}
    }
  }
}
