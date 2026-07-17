/**
 * Phase C: ITransport adapter over the existing p2pManager PeerJS instance.
 * EdgeMesh never opens a second Peer — all EDGE_MESH envelopes ride the same data channel.
 */

import {
	createEnvelope,
	type Envolvente,
	type ITransport,
	type NodoId,
	type TipoMensaje,
	type TransportEventMap,
	TIPO_MENSAJE,
	TIPO_TRANSPORTE,
} from "edge-mesh";
import type { SyncMessage } from "./p2p";

/** Wire format for edge-mesh envelopes over PeerJS JSON serialization. */
export type EdgeMeshEnvelopeWire = {
	id: string;
	tipo: string;
	origen: string;
	destino: string;
	timestamp: number;
	firma: number[] | null;
	payload: unknown;
	version: number;
	nonce: string;
};

export interface P2PManagerTransportHost {
	localPeerId: string | null;
	isPeerConnected(peerId: string): boolean;
	getConnectedPeerIds(): string[];
	sendEdgeMeshEnvelope(peerId: string, envelope: EdgeMeshEnvelopeWire): Promise<void>;
	broadcastEdgeMeshEnvelope(envelope: EdgeMeshEnvelopeWire): Promise<void>;
	onEdgeMeshEnvelope(
		cb: (envelope: EdgeMeshEnvelopeWire, fromPeerId: string) => void,
	): () => void;
	onConnectionChange(cb: (peers: { id: string }[]) => void): void;
}

export function envelopeToWire(env: Envolvente): EdgeMeshEnvelopeWire {
	return {
		id: env.id,
		tipo: env.tipo,
		origen: env.origen,
		destino: typeof env.destino === "string" ? env.destino : "*",
		timestamp: env.timestamp,
		firma: env.firma ? Array.from(env.firma) : null,
		payload: normalizePayloadForWire(env.payload),
		version: env.version,
		nonce: env.nonce,
	};
}

export function envelopeFromWire(wire: EdgeMeshEnvelopeWire): Envolvente {
	return {
		id: wire.id,
		tipo: wire.tipo as TipoMensaje,
		origen: wire.origen as NodoId,
		destino: wire.destino as NodoId | "*",
		timestamp: wire.timestamp,
		firma: wire.firma ? new Uint8Array(wire.firma) : null,
		payload: restorePayloadFromWire(wire.payload),
		version: wire.version,
		nonce: wire.nonce,
	};
}

function normalizePayloadForWire(payload: unknown): unknown {
	if (!payload || typeof payload !== "object") return payload;
	const p = payload as Record<string, unknown>;
	// SYNC payloads may carry Uint8Array datos
	if (p.datos instanceof Uint8Array) {
		return { ...p, datos: Array.from(p.datos) };
	}
	return payload;
}

function restorePayloadFromWire(payload: unknown): unknown {
	if (!payload || typeof payload !== "object") return payload;
	const p = payload as Record<string, unknown>;
	if (Array.isArray(p.datos)) {
		return { ...p, datos: new Uint8Array(p.datos as number[]) };
	}
	return payload;
}

function isEnvelopeLike(valor: unknown): valor is Envolvente {
	if (typeof valor !== "object" || valor === null) return false;
	const c = valor as Record<string, unknown>;
	return (
		typeof c.id === "string" &&
		typeof c.tipo === "string" &&
		typeof c.origen === "string" &&
		typeof c.destino === "string" &&
		typeof c.timestamp === "number" &&
		c.payload !== undefined
	);
}

/**
 * Adapts Shelf's p2pManager (single PeerJS) to edge-mesh ITransport.
 * `cerrar()` only unsubscribes — never destroys the host Peer.
 */
export class P2PManagerTransport implements ITransport {
	readonly tipo = TIPO_TRANSPORTE.PEERJS;
	readonly eventTarget: EventTarget;
	readonly nodoId: NodoId;
	private readonly host: P2PManagerTransportHost;
	private unsubEnvelope: (() => void) | null = null;
	private conectado = true;

	constructor(host: P2PManagerTransportHost, nodoId: NodoId) {
		this.host = host;
		this.nodoId = nodoId;
		this.eventTarget = new EventTarget();

		this.unsubEnvelope = host.onEdgeMeshEnvelope((wire, fromPeerId) => {
			try {
				const env = envelopeFromWire(wire);
				this.emit("mensaje", {
					envolvente: env,
					from: fromPeerId as NodoId,
				});
			} catch (err) {
				this.emit("error", {
					mensaje: "Failed to decode EDGE_MESH_ENVELOPE",
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}
		});

		// Surface peer list as conectado/desconectado best-effort
		host.onConnectionChange((peers) => {
			for (const peer of peers) {
				this.emit("conectado", { nodoId: peer.id as NodoId });
			}
		});
	}

	on<K extends keyof TransportEventMap>(
		tipo: K,
		handler: (ev: TransportEventMap[K]) => void,
	): void {
		this.eventTarget.addEventListener(tipo as string, handler as EventListener);
	}

	off<K extends keyof TransportEventMap>(
		tipo: K,
		handler: (ev: TransportEventMap[K]) => void,
	): void {
		this.eventTarget.removeEventListener(
			tipo as string,
			handler as EventListener,
		);
	}

	private emit<K extends keyof TransportEventMap>(
		tipo: K,
		detalle: TransportEventMap[K]["detail"],
	): void {
		this.eventTarget.dispatchEvent(
			new CustomEvent(tipo as string, { detail: detalle }),
		);
	}

	async enviar(
		destino: NodoId,
		payload: unknown,
		tipoMensaje: string = TIPO_MENSAJE.SYNC,
	): Promise<void> {
		const env = isEnvelopeLike(payload)
			? payload
			: createEnvelope(
					tipoMensaje as TipoMensaje,
					this.nodoId,
					destino,
					payload,
				);
		const wire = envelopeToWire(env);
		await this.host.sendEdgeMeshEnvelope(destino, wire);
	}

	async transmitir(
		payload: unknown,
		tipoMensaje: string = TIPO_MENSAJE.SYNC,
	): Promise<void> {
		const env = isEnvelopeLike(payload)
			? payload
			: createEnvelope(
					tipoMensaje as TipoMensaje,
					this.nodoId,
					"*",
					payload,
				);
		const wire = envelopeToWire(env);
		await this.host.broadcastEdgeMeshEnvelope(wire);
	}

	estaConectado(): boolean {
		return this.conectado && this.host.getConnectedPeerIds().length >= 0;
	}

	obtenerConexiones(): readonly string[] {
		return this.host.getConnectedPeerIds();
	}

	async cerrar(): Promise<void> {
		this.unsubEnvelope?.();
		this.unsubEnvelope = null;
		this.conectado = false;
		// Do NOT destroy host PeerJS
	}
}

/** Type-guard helper for SyncMessage routing. */
export function isEdgeMeshEnvelopeMessage(
	message: SyncMessage,
): message is Extract<SyncMessage, { type: "EDGE_MESH_ENVELOPE" }> {
	return message.type === "EDGE_MESH_ENVELOPE";
}

/** Factory used by Shelf to late-bind EdgeMesh onto p2pManager. */
export function createP2PManagerTransport(
	host: P2PManagerTransportHost,
	nodoId: NodoId,
): P2PManagerTransport {
	return new P2PManagerTransport(host, nodoId);
}
