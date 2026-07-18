import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("edge-mesh", () => ({
	createEnvelope: (
		tipo: string,
		origen: string,
		destino: string,
		payload: unknown,
	) => ({
		id: "env-1",
		tipo,
		origen,
		destino,
		timestamp: 1000,
		firma: null,
		payload,
		version: 1,
		nonce: "nonce-1",
	}),
	TIPO_MENSAJE: {
		SYNC: "sync",
		HEARTBEAT: "heartbeat",
	},
	TIPO_TRANSPORTE: {
		PEERJS: "peerjs",
		MEMORIA: "memoria",
		WEBSOCKET: "websocket",
	},
}));

import {
	createP2PManagerTransport,
	envelopeFromWire,
	envelopeToWire,
	type EdgeMeshEnvelopeWire,
	type P2PManagerTransportHost,
} from "../src/p2p-transport-adapter";

function createMockHost(): P2PManagerTransportHost & {
	sent: { peerId: string; envelope: EdgeMeshEnvelopeWire }[];
	broadcasts: EdgeMeshEnvelopeWire[];
	emitEnvelope: (env: EdgeMeshEnvelopeWire, from: string) => void;
} {
	const envelopeListeners = new Set<
		(envelope: EdgeMeshEnvelopeWire, fromPeerId: string) => void
	>();
	const sent: { peerId: string; envelope: EdgeMeshEnvelopeWire }[] = [];
	const broadcasts: EdgeMeshEnvelopeWire[] = [];

	return {
		localPeerId: "local-1",
		sent,
		broadcasts,
		isPeerConnected: (id) => id === "peer-a" || id === "peer-b",
		getConnectedPeerIds: () => ["peer-a", "peer-b"],
		async sendEdgeMeshEnvelope(peerId, envelope) {
			sent.push({ peerId, envelope });
		},
		async broadcastEdgeMeshEnvelope(envelope) {
			broadcasts.push(envelope);
		},
		onEdgeMeshEnvelope(cb) {
			envelopeListeners.add(cb);
			return () => envelopeListeners.delete(cb);
		},
		onConnectionChange() {
			/* no-op */
		},
		emitEnvelope(env, from) {
			for (const cb of envelopeListeners) cb(env, from);
		},
	};
}

describe("P2PManagerTransport (Phase C)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("serializes and restores envelopes with binary payload", () => {
		const env = {
			id: "1",
			tipo: "sync" as const,
			origen: "n1" as never,
			destino: "*" as const,
			timestamp: Date.now(),
			firma: null,
			payload: { docId: "default", datos: new Uint8Array([1, 2, 3]), clock: 1 },
			version: 1,
			nonce: "x",
		};
		const wire = envelopeToWire(env);
		expect(Array.isArray((wire.payload as { datos: number[] }).datos)).toBe(
			true,
		);
		const restored = envelopeFromWire(wire);
		const datos = (restored.payload as { datos: Uint8Array }).datos;
		expect(datos).toBeInstanceOf(Uint8Array);
		expect(Array.from(datos)).toEqual([1, 2, 3]);
	});

	it("enviar routes through host sendEdgeMeshEnvelope", async () => {
		const host = createMockHost();
		const transport = createP2PManagerTransport(host, "local-1" as never);

		await transport.enviar("peer-a" as never, { hello: true }, "heartbeat");

		expect(host.sent).toHaveLength(1);
		expect(host.sent[0].peerId).toBe("peer-a");
		expect(host.sent[0].envelope.tipo).toBe("heartbeat");
		expect(host.sent[0].envelope.origen).toBe("local-1");
	});

	it("transmitir broadcasts envelopes", async () => {
		const host = createMockHost();
		const transport = createP2PManagerTransport(host, "local-1" as never);

		await transport.transmitir({ ping: 1 }, "heartbeat");

		expect(host.broadcasts).toHaveLength(1);
		expect(host.broadcasts[0].destino).toBe("*");
	});

	it("incoming host envelopes emit transport mensaje events", async () => {
		const host = createMockHost();
		const transport = createP2PManagerTransport(host, "local-1" as never);

		const received: unknown[] = [];
		transport.on("mensaje", (ev) => {
			received.push(ev.detail.envolvente);
		});

		const wire: EdgeMeshEnvelopeWire = {
			id: "env-x",
			tipo: "sync",
			origen: "peer-a",
			destino: "local-1",
			timestamp: Date.now(),
			firma: null,
			payload: { docId: "default", datos: [9, 9], clock: 2 },
			version: 1,
			nonce: "n",
		};
		host.emitEnvelope(wire, "peer-a");

		expect(received).toHaveLength(1);
		expect((received[0] as { origen: string }).origen).toBe("peer-a");
	});

	it("cerrar unsubscribes and does not throw", async () => {
		const host = createMockHost();
		const unsub = vi.fn();
		host.onEdgeMeshEnvelope = () => unsub;

		const transport = createP2PManagerTransport(host, "local-1" as never);
		await transport.cerrar();
		expect(unsub).toHaveBeenCalled();
	});
});
