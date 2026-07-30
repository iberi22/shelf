import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { EdgeMesh, YjsAdapter } from '../src/edge-mesh.js';
import { signEnvelope } from '../src/protocol/index.js';
import type { NodoId } from '../src/types/index.js';

// Mock idb to avoid "indexedDB is not defined" error in Node environment
vi.mock('idb', () => ({
	openDB: vi.fn().mockResolvedValue({
		get: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
		getAll: vi.fn().mockResolvedValue([]),
		clear: vi.fn(),
		close: vi.fn(),
		objectStoreNames: {
			contains: vi.fn().mockReturnValue(true),
		},
	}),
}));

describe('YjsAdapter', () => {
	let adapter: YjsAdapter;

	beforeEach(() => {
		adapter = new YjsAdapter();
	});

	afterEach(() => {
		adapter.destroy();
	});

	it('should support basic Map operations', () => {
		const map = adapter.getMap('test-map');
		map.set('key1', 'value1');
		expect(map.get('key1')).toBe('value1');
	});

	it('should support basic Array operations', () => {
		const array = adapter.getArray('test-array');
		array.push(['item1']);
		expect(array.get(0)).toBe('item1');
	});

	it('should support basic Text operations', () => {
		const text = adapter.getText('test-text');
		text.insert(0, 'Hello World');
		expect(text.toString()).toBe('Hello World');
	});

	it('should apply updates and sync state', () => {
		const adapter2 = new YjsAdapter();

		const map1 = adapter.getMap('sync-map');
		map1.set('a', 1);

		const update = adapter.getState();
		adapter2.applyUpdate(update);

		const map2 = adapter2.getMap('sync-map');
		expect(map2.get('a')).toBe(1);

		adapter2.destroy();
	});

	it('should handle state vectors and merging', () => {
		const adapter2 = new YjsAdapter();

		adapter.getMap('m').set('x', 1);
		adapter2.getMap('m').set('y', 2);

		const sv1 = adapter.getStateVector();
		const update1 = Y.encodeStateAsUpdate(adapter2.doc, sv1);

		adapter.merge(update1);
		expect(adapter.getMap('m').get('y')).toBe(2);
		expect(adapter.getMap('m').get('x')).toBe(1);

		adapter2.destroy();
	});
});

describe('EdgeMesh', () => {
	let edgeMesh: EdgeMesh;
	const nodoId = 'edge-node' as NodoId;

	beforeEach(() => {
		vi.useFakeTimers();
		edgeMesh = new EdgeMesh({
			nodoId,
			heartbeatIntervalMs: 1000,
			heartbeatTimeoutMs: 3000,
		});
	});

	afterEach(async () => {
		await edgeMesh.detener();
		vi.useRealTimers();
	});

	it('should initialize and stop', async () => {
		// Mock transmitir to avoid actual network calls
		vi.spyOn(edgeMesh, 'transmitir').mockResolvedValue(undefined);

		await edgeMesh.iniciar();
		expect(edgeMesh.presence).toBeDefined();

		// Test transition from online to offline
		// Initial state is offline. iniciar calls nodo.conectar()
		// Let's check node state if possible, but EdgeMesh wraps it.

		await edgeMesh.detener();
	});

	it('should handle sync events through YjsAdapter', async () => {
		await edgeMesh.iniciar();

		const updateSpy = vi.fn();
		edgeMesh.yjsAdapter.onUpdate(updateSpy);

		const map = edgeMesh.yjsAdapter.getMap('data');
		map.set('key', 'value');

		expect(updateSpy).toHaveBeenCalled();
	});
});

describe('EdgeMesh - requireSignedEnvelopes hardening', () => {
	const localNodeId = 'local-node' as NodoId;
	const remoteNodeId = 'remote-node' as NodoId;

	it('should process unsigned envelopes when requireSignedEnvelopes is false (backward compatibility)', async () => {
		const mesh = new EdgeMesh({
			nodoId: localNodeId,
			storageBackend: 'mem',
			requireSignedEnvelopes: false,
		});
		await mesh.iniciar();

		const receivedPromise = new Promise<any>((resolve) => {
			mesh.on('mensajeRecibido', (ev) => resolve(ev.detail.envolvente));
		});

		const env = {
			id: 'env-1',
			tipo: 'sync',
			origen: remoteNodeId,
			destino: localNodeId,
			timestamp: Date.now(),
			payload: { test: true },
			version: 1,
			nonce: 'nonce123',
			firma: null,
		};

		await mesh.recibirEnvelope(env);

		const received = await receivedPromise;
		expect(received).toBeDefined();
		expect(received.id).toBe('env-1');

		await mesh.detener();
	});

	it('should reject unsigned envelopes with console.warn and emit error when requireSignedEnvelopes is true', async () => {
		const consoleWarnSpy = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => {});
		const mesh = new EdgeMesh({
			nodoId: localNodeId,
			storageBackend: 'mem',
			requireSignedEnvelopes: true,
		});
		await mesh.iniciar();

		const errorPromise = new Promise<any>((resolve) => {
			mesh.on('error', (ev) => resolve(ev.detail.mensaje));
		});

		const env = {
			id: 'env-2',
			tipo: 'sync',
			origen: remoteNodeId,
			destino: localNodeId,
			timestamp: Date.now(),
			payload: { test: true },
			version: 1,
			nonce: 'nonce123',
			firma: null,
		};

		await mesh.recibirEnvelope(env);

		const errorMsg = await errorPromise;
		expect(errorMsg).toContain('Firma ausente');
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining('Envelope sin firma'),
		);

		consoleWarnSpy.mockRestore();
		await mesh.detener();
	});

	it('should reject envelopes with invalid signatures with console.error and emit error when requireSignedEnvelopes is true', async () => {
		const consoleErrorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => {});
		const mesh = new EdgeMesh({
			nodoId: localNodeId,
			storageBackend: 'mem',
			requireSignedEnvelopes: true,
		});
		await mesh.iniciar();

		// Register peer public key to allow verification (otherwise it fails finding public key, which is also an invalid signature)
		mesh.registrarClavePublica(remoteNodeId, mesh.identity.exportarPublico());

		const errorPromise = new Promise<any>((resolve) => {
			mesh.on('error', (ev) => resolve(ev.detail.mensaje));
		});

		const env = {
			id: 'env-3',
			tipo: 'sync',
			origen: remoteNodeId,
			destino: localNodeId,
			timestamp: Date.now(),
			payload: { test: true },
			version: 1,
			nonce: 'nonce123',
			firma: new Uint8Array([1, 2, 3]), // Invalid signature
		};

		await mesh.recibirEnvelope(env);

		const errorMsg = await errorPromise;
		expect(errorMsg).toContain('Firma invalida');
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining('Envelope con firma invalida'),
		);

		consoleErrorSpy.mockRestore();
		await mesh.detener();
	});

	it('should accept valid signed envelopes when requireSignedEnvelopes is true', async () => {
		const mesh = new EdgeMesh({
			nodoId: localNodeId,
			storageBackend: 'mem',
			requireSignedEnvelopes: true,
		});
		await mesh.iniciar();

		// Register remote node key
		mesh.registrarClavePublica(remoteNodeId, mesh.identity.exportarPublico());

		const receivedPromise = new Promise<any>((resolve) => {
			mesh.on('mensajeRecibido', (ev) => resolve(ev.detail.envolvente));
		});

		const unsignedEnv = {
			id: 'env-4',
			tipo: 'sync',
			origen: remoteNodeId,
			destino: localNodeId,
			timestamp: Date.now(),
			payload: { docId: 'default', datos: [], clock: 1 },
			version: 1,
			nonce: 'nonce123',
			firma: null,
		};
		const signedEnv = await signEnvelope(unsignedEnv, mesh.identity);

		await mesh.recibirEnvelope(signedEnv);

		const received = await receivedPromise;
		expect(received).toBeDefined();
		expect(received.id).toBe('env-4');

		await mesh.detener();
	});

	it('should not affect YJS_UPDATE envelopes because they are ignored/not validated as edge-mesh envelopes, thus emitting no errors', async () => {
		const mesh = new EdgeMesh({
			nodoId: localNodeId,
			storageBackend: 'mem',
			requireSignedEnvelopes: true,
		});
		await mesh.iniciar();

		let errorEmitted = false;
		mesh.on('error', () => {
			errorEmitted = true;
		});

		const env = {
			id: 'env-5',
			tipo: 'YJS_UPDATE' as any,
			origen: remoteNodeId,
			destino: localNodeId,
			timestamp: Date.now(),
			payload: { test: true },
			version: 1,
			nonce: 'nonce123',
			firma: null,
		};

		await mesh.recibirEnvelope(env);

		// Wait a brief moment to ensure no error is asynchronously emitted
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(errorEmitted).toBe(false);

		await mesh.detener();
	});
});
