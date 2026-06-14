import {
	createPeerHealthMonitor,
	getReconnectDelay,
	type PeerHealthState,
} from "edge-mesh";
import { type DataConnection, Peer } from "peerjs";
import { decryptData, encryptData, importPQCSharedSecret } from "./crypto";
import {
	decapsulate,
	encapsulate,
	fromHex,
	generateDSAKeyPair,
	generateKEMKeyPair,
	toHex,
} from "./crypto-pqc";
import { dbSync } from "./database-sync";
import type { AppState, P2PRole, PeerInfo, PeerPermissions } from "./types";
import { logger, setLoggerPeerId } from "./utils/logger";

export type SyncMessage =
	| { type: "ENCRYPTED_PAYLOAD"; payload: { ciphertext: string } }
	| { type: "STATE_UPDATE"; payload: Partial<AppState> }
	| { type: "REQUEST_FULL_STATE" }
	| { type: "PROMOTE_ADMIN"; payload: { targetPeerId: string } }
	| {
			type: "CHANGE_ROLE";
			payload: {
				targetPeerId: string;
				role: P2PRole;
				permissions?: PeerPermissions;
			};
	  }
	| { type: "PEER_LIST_UPDATE"; payload: PeerInfo[] }
	| {
			type: "PQC_HANDSHAKE";
			payload: { kemPublicKey: string; dsaPublicKey: string };
	  }
	| { type: "PQC_KEM_REPLY"; payload: { ciphertext: string } }
	| {
			type: "PQC_HANDSHAKE_REQUEST";
			payload: { kemPubKey: string; dsaPubKey: string; deviceName: string };
	  }
	| {
			type: "PQC_HANDSHAKE_RESPONSE";
			payload: { cipherText: string; signature: string; dsaPubKey: string };
	  }
	| { type: "YJS_UPDATE"; payload: { update: string } }
	| { type: "YJS_SYNC_REQUEST"; payload: { stateVector: string } }
	| {
			type: "UPDATE_PEER_PERMISSIONS";
			payload: {
				targetPeerId: string;
				permissions: PeerPermissions;
				role?: P2PRole;
			};
	  }
	| { type: "PING"; peerId?: string; timestamp?: number }
	| { type: "PONG"; peerId?: string; timestamp?: number }
	// Auth recovery messages
	| {
			type: "REQUEST_ACCOUNT_RECOVERY";
			payload: {
				requestId: string;
				email: string;
				deviceName: string;
				deviceId: string;
			};
	  }
	| {
			type: "RECOVERY_APPROVED";
			payload: { requestId: string; encryptedSeed: string; tempKey: string };
	  }
	| { type: "RECOVERY_DENIED"; payload: { requestId: string; reason: string } }
	| {
			type: "DEVICE_AUTHORIZED";
			payload: { deviceId: string; deviceName: string; authorizedAt: string };
	  };

export type ConnectionErrorInfo = {
	peerId?: string;
	type?: string;
	message: string;
	source: "peerjs" | "connection";
};

export type PeerHealthInfo = PeerHealthState;

type HandshakeRequestPayload = {
	kemPubKey: string;
	dsaPubKey: string;
	deviceName: string;
};

type HandshakeResponsePayload = {
	cipherText: string;
	signature: string;
	dsaPubKey: string;
};

class P2PManager {
	private peer: Peer | null = null;
	private connections: Map<string, DataConnection> = new Map();
	private sharedSecrets: Map<string, Uint8Array> = new Map();
	private encryptionKeys: Map<string, CryptoKey> = new Map();
	private health = createPeerHealthMonitor({
		staleAfterMs: 30000,
		offlineAfterMs: 60000,
	});

	private reconnectionAttempts = 0;
	private readonly MAX_RECONNECT_DELAY = 30000;
	private readonly INITIAL_RECONNECT_DELAY = 1000;
	private readonly MAX_RECONNECT_ATTEMPTS = 10;

	// Per-peer pong tracking: peerId -> timestamp of last PING sent
	private pendingPings: Map<string, number> = new Map();
	private readonly PING_INTERVAL = 30000;
	private readonly PONG_TIMEOUT = 10000;

	private onMessageCallbacks: ((
		message: SyncMessage,
		fromPeerId: string,
	) => void)[] = [];
	private onConnectionChangeCallbacks: ((peers: PeerInfo[]) => void)[] = [];
	private onHandshakeRequestCallbacks: ((
		payload: HandshakeRequestPayload,
		fromPeerId: string,
	) => void)[] = [];
	private onHandshakeResponseCallbacks: ((
		payload: HandshakeResponsePayload,
		fromPeerId: string,
	) => void)[] = [];
	private onRecoveryRequestCallbacks: ((
		requestId: string,
		email: string,
		deviceName: string,
		fromPeerId: string,
	) => void)[] = [];
	private onConnectionErrorCallbacks: ((issue: ConnectionErrorInfo) => void)[] =
		[];
	private onPeerHealthChangeCallbacks: ((state: PeerHealthInfo) => void)[] = [];
	private healthEventsBound = false;

	public localPeerId: string | null = null;
	public role: P2PRole = "collaborator";
	private peers: PeerInfo[] = [];
	private lastMessageTime = new Map<string, number>();
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private pendingConnectionRequests = new Set<string>();

	// PQC Keypairs
	private kemKeyPair = generateKEMKeyPair();
	private dsaKeyPair = generateDSAKeyPair();
	private yjsSyncInitialized = false;
	private readonly yjsRetryDelays = [750, 2500];

	private getMasterPeerId(): string | null {
		return dbSync.getMasterPeerId();
	}

	private isLocalAuthorityPeer(): boolean {
		if (!this.localPeerId) return false;
		const masterId = this.getMasterPeerId();
		if (masterId) return masterId === this.localPeerId;
		return this.role === "admin";
	}

	private isAuthorityMessage(message: SyncMessage): boolean {
		return (
			message.type === "PROMOTE_ADMIN" ||
			message.type === "CHANGE_ROLE" ||
			message.type === "UPDATE_PEER_PERMISSIONS"
		);
	}

	private isAuthorizedAuthoritySender(fromPeerId: string): boolean {
		const masterId = this.getMasterPeerId();
		return Boolean(masterId && fromPeerId === masterId);
	}

	private initYjsSync() {
		if (this.yjsSyncInitialized) return;
		this.yjsSyncInitialized = true;

		dbSync.onChange((update, origin) => {
			if (!dbSync.isReady) return;
			// Only broadcast if the update originated locally to prevent infinite loops
			if (origin === "local") {
				const message: SyncMessage = {
					type: "YJS_UPDATE",
					payload: { update: toHex(update) },
				};

				this.broadcast(message);

				// Retry the same patch a couple of times to recover from transient
				// data-channel drops. Yjs updates are idempotent, so this is safe.
				for (const delay of this.yjsRetryDelays) {
					setTimeout(() => {
						if (!this.connections.size) return;
						this.broadcast(message);
					}, delay);
				}
			}
		});

		dbSync.onReady(() => {
			for (const peerId of this.connections.keys()) {
				this.requestYjsSync(peerId);
			}
		});
	}

	private emitMessageCallbacks(message: SyncMessage, fromPeerId: string) {
		for (const cb of this.onMessageCallbacks) {
			cb(message, fromPeerId);
		}
	}

	private emitConnectionError(issue: ConnectionErrorInfo) {
		for (const cb of this.onConnectionErrorCallbacks) {
			cb(issue);
		}
	}

	private bindPeerHealthEvents() {
		if (this.healthEventsBound) return;
		this.healthEventsBound = true;

		const emit = (state: PeerHealthState) => {
			for (const cb of this.onPeerHealthChangeCallbacks) {
				cb(state);
			}
			const status =
				state.status === "offline"
					? "offline"
					: state.status === "stale"
						? "connected"
						: "verified";
			dbSync.updateEphemeralNode(state.peerId, { status });
			this.notifyConnectionChange();
		};

		this.health.on("peer:healthy", emit);
		this.health.on("peer:stale", emit);
		this.health.on("peer:offline", emit);
	}

	private requestYjsSync(peerId: string) {
		if (!dbSync.isReady) return;
		this.sendTo(peerId, {
			type: "YJS_SYNC_REQUEST",
			payload: { stateVector: toHex(dbSync.getStateVector()) },
		});
	}

	private sendYjsDiff(peerId: string, stateVectorHex: string) {
		if (!dbSync.isReady) return;
		this.sendTo(peerId, {
			type: "YJS_UPDATE",
			payload: { update: toHex(dbSync.getDiff(fromHex(stateVectorHex))) },
		});
	}

	public init(peerId?: string) {
		if (this.peer) return;
		this.initYjsSync();
		this.bindPeerHealthEvents();

		let finalPeerId = peerId;
		if (!finalPeerId && typeof localStorage !== "undefined") {
			finalPeerId = localStorage.getItem("shelf_local_peer_id") || undefined;
		}

		// Check if we are in development mode without depending on Node globals.
		const isLocalBrowser =
			typeof globalThis !== "undefined" &&
			"location" in globalThis &&
			["localhost", "127.0.0.1", "::1"].includes(
				(globalThis as { location?: { hostname?: string } }).location
					?.hostname || "",
			);
		const isDev =
			isLocalBrowser ||
			(typeof globalThis !== "undefined" &&
				"process" in globalThis &&
				!!(globalThis as { process?: { env?: { NODE_ENV?: string } } }).process
					?.env &&
				(globalThis as { process?: { env?: { NODE_ENV?: string } } }).process
					?.env?.NODE_ENV === "development");
		const peerOptions = isDev
			? {
					host: "localhost",
					port: 9000,
					path: "/",
					secure: false,
					pingInterval: 5000,
					debug: 1,
				}
			: {
					debug: 1,
					pingInterval: 5000,
				};

		this.peer = finalPeerId
			? new Peer(finalPeerId, peerOptions)
			: new Peer(peerOptions);

		this.peer.on("open", (id) => {
			this.localPeerId = id;
			dbSync.localPeerId = id; // Sync local peer ID to dbSync for permissions and role resolution
			setLoggerPeerId(id);
			this.reconnectionAttempts = 0;
			if (typeof localStorage !== "undefined") {
				localStorage.setItem("shelf_local_peer_id", id);
			}
			logger.log(`My peer ID is: ${id}`);
			// Master node is admin by default
			if (finalPeerId === "shelf-master") {
				this.role = "admin";
			}

			// Sync role to dbSync for GC coordination
			dbSync.masterRole = this.role;

			const currentMaster = dbSync.getMasterPeerId();
			if (!currentMaster) {
				dbSync.setMasterPeerId(id);
				dbSync.updateLinkedNode(
					id,
					{
						role: "admin",
						isMaster: true,
						status: "verified",
					},
					id,
				);
				// Force local role to admin as well to repair state
				this.role = "admin";
				this.updatePeerList(id, "admin");
				this.notifyConnectionChange();
			} else if (currentMaster === id) {
				this.role = "admin";
				dbSync.updateLinkedNode(
					id,
					{
						role: "admin",
						isMaster: true,
						status: "verified",
					},
					id,
				);
				this.updatePeerList(id, "admin");
				this.notifyConnectionChange();
			}

			this.flushPendingConnections();

			// Start heartbeat/GC loop
			this.heartbeatInterval = setInterval(() => {
				this.runHeartbeat();
			}, 30000);
		});

		this.peer.on("connection", (conn) => {
			this.handleConnection(conn);
		});

		this.peer.on("disconnected", () => {
			if (this.reconnectionAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
				logger.error(
					`Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`,
				);
				return;
			}
			const delay = getReconnectDelay(this.reconnectionAttempts, {
				initialDelayMs: this.INITIAL_RECONNECT_DELAY,
				maxDelayMs: this.MAX_RECONNECT_DELAY,
			});
			logger.warn(
				`PeerJS disconnected. Retrying in ${delay}ms (attempt ${this.reconnectionAttempts + 1})...`,
			);

			setTimeout(() => {
				if (!this.peer?.destroyed && this.peer?.disconnected) {
					this.reconnectionAttempts++;
					this.peer?.reconnect();
				}
			}, delay);
		});

		this.peer.on("error", (err: unknown) => {
			logger.error("PeerJS error:", err);
			const typedErr = err as { type?: string };
			if (typedErr.type === "unavailable-id") {
				if (this.reconnectionAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
					logger.error(
						`Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for unavailable-id. Giving up.`,
					);
					return;
				}
				const delay = getReconnectDelay(this.reconnectionAttempts, {
					initialDelayMs: this.INITIAL_RECONNECT_DELAY,
					maxDelayMs: this.MAX_RECONNECT_DELAY,
				});
				logger.warn(
					`Peer ID taken. Retrying in ${delay}ms (attempt ${this.reconnectionAttempts + 1})...`,
				);

				// Destroy old peer and re-init WITH the same ID after a short delay
				this.peer?.destroy();
				this.peer = null;
				setTimeout(() => {
					this.reconnectionAttempts++;
					this.init(finalPeerId);
				}, delay);
				return;
			}

			this.emitConnectionError({
				source: "peerjs",
				type: typedErr.type,
				message:
					err instanceof Error
						? err.message
						: "No se pudo inicializar la conexión P2P.",
			});
		});

		if (typeof window !== "undefined") {
			window.addEventListener("beforeunload", () => {
				this.peer?.destroy();
			});
		}
	}

	private handleConnection(conn: DataConnection) {
		conn.on("open", () => {
			this.connections.set(conn.peer, conn);
			this.health.markConnected(conn.peer);
			this.updatePeerList(conn.peer, "collaborator");

			// Broadcast updated peer list to the mesh
			this.broadcastPeerList();

			// Start PQC Handshake deterministically to avoid both sides sending it
			if (this.localPeerId && this.localPeerId > conn.peer) {
				conn.send({
					type: "PQC_HANDSHAKE",
					payload: {
						kemPublicKey: toHex(this.kemKeyPair.publicKey),
						dsaPublicKey: toHex(this.dsaKeyPair.publicKey),
					},
				});
			}

			conn.on("data", (data) => {
				this.lastMessageTime.set(conn.peer, Date.now());
				const message = data as SyncMessage;

				// Handle Peer List Updates (Mesh Discovery)
				if (message.type === "PEER_LIST_UPDATE") {
					message.payload.forEach((peerInfo) => {
						if (
							peerInfo.id !== this.localPeerId &&
							!this.connections.has(peerInfo.id)
						) {
							logger.log(`Discovered new peer via mesh: ${peerInfo.id}`);
							this.connect(peerInfo.id);
						}
					});
					return;
				}

				// Handle PQC Handshake
				if (message.type === "PQC_HANDSHAKE") {
					const { ciphertext, sharedSecret } = encapsulate(
						fromHex(message.payload.kemPublicKey),
					);
					this.sharedSecrets.set(conn.peer, sharedSecret);
					this.setupEncryption(conn.peer, sharedSecret).then(() => {
						// Update status in ephemeralNodes map
						dbSync.updateEphemeralNode(conn.peer, {
							status: "verified",
						});
						this.health.markPong(conn.peer);
						// Update local peer list
						this.updatePeerList(conn.peer, "collaborator");
						this.notifyConnectionChange();

						this.requestYjsSync(conn.peer);
					});

					conn.send({
						type: "PQC_KEM_REPLY",
						payload: { ciphertext: toHex(ciphertext) },
					});
					logger.log(`PQC Handshake established with ${conn.peer}`);
					return;
				}

				if (message.type === "PQC_KEM_REPLY") {
					const sharedSecret = decapsulate(
						fromHex(message.payload.ciphertext),
						this.kemKeyPair.secretKey,
					);
					this.sharedSecrets.set(conn.peer, sharedSecret);
					this.setupEncryption(conn.peer, sharedSecret).then(() => {
						logger.log(`PQC Shared secret recovered from ${conn.peer}`);

						dbSync.updateEphemeralNode(conn.peer, {
							status: "verified",
						});
						this.health.markPong(conn.peer);
						this.updatePeerList(conn.peer, "collaborator");
						this.notifyConnectionChange();

						this.requestYjsSync(conn.peer);
					});
					return;
				}

				if (this.isAuthorityMessage(message)) {
					if (!this.isAuthorizedAuthoritySender(conn.peer)) {
						logger.warn(
							`[SECURITY] Ignored authority message ${message.type} from non-master peer ${conn.peer}`,
						);
						return;
					}
				}

				// Handle PING/PONG
				if (message.type === "PING") {
					conn.send({
						type: "PONG",
						peerId: this.localPeerId,
						timestamp: Date.now(),
					});
					return;
				}

				if (message.type === "PONG") {
					// Clear pending ping tracking for this peer
					this.pendingPings.delete(conn.peer);
					this.health.markPong(conn.peer);
					return;
				}

				// Handle Encrypted Payload
				if (message.type === "ENCRYPTED_PAYLOAD") {
					this.handleEncryptedMessage(conn.peer, message.payload.ciphertext);
					return;
				}

				// Handle Yjs Updates
				if (message.type === "YJS_UPDATE") {
					dbSync.applyUpdate(fromHex(message.payload.update), conn.peer);
					this.emitMessageCallbacks(message, conn.peer);
					return; // Already handled; prevent fallthrough to callbacks
				}

				if (message.type === "YJS_SYNC_REQUEST") {
					this.sendYjsDiff(conn.peer, message.payload.stateVector);
					return;
				}

				if (message.type === "PQC_HANDSHAKE_REQUEST") {
					for (const cb of this.onHandshakeRequestCallbacks) {
						cb(message.payload, conn.peer);
					}
					return;
				}

				if (message.type === "PQC_HANDSHAKE_RESPONSE") {
					for (const cb of this.onHandshakeResponseCallbacks) {
						cb(message.payload, conn.peer);
					}
					return;
				}

				// Route recovery requests to dedicated callbacks
				if (message.type === "REQUEST_ACCOUNT_RECOVERY") {
					for (const cb of this.onRecoveryRequestCallbacks) {
						cb(
							message.payload.requestId,
							message.payload.email,
							message.payload.deviceName,
							conn.peer,
						);
					}
					return;
				}
				for (const cb of this.onMessageCallbacks) {
					cb(message, conn.peer);
				}
			});

			conn.on("close", () => {
				this.connections.delete(conn.peer);
				this.sharedSecrets.delete(conn.peer);
				this.lastMessageTime.delete(conn.peer);
				this.peers = this.peers.filter((p) => p.id !== conn.peer);
				this.notifyConnectionChange();
				this.health.markOffline(conn.peer);

				// Mark offline in ephemeral state
				dbSync.updateEphemeralNode(conn.peer, {
					status: "offline",
				});
			});

			conn.on("error", (err: unknown) => {
				logger.error(`Connection error with peer ${conn.peer}:`, err);
				this.emitConnectionError({
					peerId: conn.peer,
					source: "connection",
					type: (err as { type?: string } | undefined)?.type,
					message:
						err instanceof Error
							? err.message
							: `No se pudo conectar al peer ${conn.peer}.`,
				});

				// Force cleanup so the UI and presence state can recover immediately.
				if (conn.open) {
					conn.close();
				}
			});
		});
	}

	public connect(peerId: string) {
		if (this.connections.has(peerId)) return;
		if (!this.peer || !this.localPeerId || this.peer.destroyed || !this.peer.open) {
			this.pendingConnectionRequests.add(peerId);
			return;
		}
		const conn = this.peer.connect(peerId);
		this.handleConnection(conn);
	}

	private flushPendingConnections() {
		if (!this.peer || !this.localPeerId || this.peer.destroyed || !this.peer.open) return;

		for (const peerId of Array.from(this.pendingConnectionRequests)) {
			this.pendingConnectionRequests.delete(peerId);
			if (!this.connections.has(peerId)) {
				const conn = this.peer.connect(peerId);
				this.handleConnection(conn);
			}
		}
	}

	private runHeartbeat() {
		const now = Date.now();
		for (const [peerId, conn] of this.connections.entries()) {
			if (!conn.open) {
				this.health.markOffline(peerId);
				conn.close(); // Triggers the 'close' event handler which cleans up
				continue;
			}

			// Check if we are waiting for a PONG response from a previous PING
			const pingSentAt = this.pendingPings.get(peerId);
			if (pingSentAt !== undefined) {
				if (now - pingSentAt > this.PONG_TIMEOUT) {
					// No pong received within 10s — consider peer disconnected
					logger.warn(
						`Pong timeout for peer ${peerId} (${now - pingSentAt}ms). Closing connection.`,
					);
					this.pendingPings.delete(peerId);
					this.health.markOffline(peerId);
					conn.close();
					continue;
				}
				// Still waiting, skip sending another PING
				continue;
			}

			// Check for inactivity (no message of any kind received)
			const lastSeen = this.lastMessageTime.get(peerId) || now;
			if (now - lastSeen > 60000) {
				// 1 minute timeout
				logger.warn(
					`Peer ${peerId} heartbeat inactivity timeout (${now - lastSeen}ms). Closing connection.`,
				);
				this.health.markOffline(peerId);
				conn.close();
				continue;
			}

			// Send PING and track it
			this.pendingPings.set(peerId, now);
			this.health.markPing(peerId);
			conn.send({ type: "PING", peerId: this.localPeerId, timestamp: now });
		}
		this.health.sweep();
	}

	public isPeerConnected(peerId: string): boolean {
		const conn = this.connections.get(peerId);
		return conn ? conn.open : false;
	}

	public broadcast(message: SyncMessage) {
		this.connections.forEach((conn) => {
			if (conn.open) {
				this.sendTo(conn.peer, message).catch((err) =>
					logger.error("Broadcast encrypt failed", err),
				);
			}
		});
	}

	public async sendTo(peerId: string, message: SyncMessage) {
		const conn = this.connections.get(peerId);
		if (!conn?.open) return;

		if (this.isAuthorityMessage(message) && !this.isLocalAuthorityPeer()) {
			logger.warn(
				`[SECURITY] Blocked outgoing authority message ${message.type} from non-master peer ${this.localPeerId || "unknown"}`,
			);
			return;
		}

		// Encrypt sensitive messages if we have a shared key
		const key = this.encryptionKeys.get(peerId);
		if (key && this.isSensitive(message)) {
			const ciphertext = await encryptData(JSON.stringify(message), key);
			conn.send({
				type: "ENCRYPTED_PAYLOAD",
				payload: { ciphertext },
			});
		} else {
			conn.send(message);
		}
	}

	private isSensitive(message: SyncMessage): boolean {
		return [
			"PROMOTE_ADMIN",
			"CHANGE_ROLE",
			"UPDATE_PEER_PERMISSIONS",
			"RECOVERY_APPROVED",
		].includes(message.type);
	}

	private async setupEncryption(peerId: string, sharedSecret: Uint8Array) {
		const key = await importPQCSharedSecret(toHex(sharedSecret));
		this.encryptionKeys.set(peerId, key);
	}

	private async handleEncryptedMessage(fromPeerId: string, ciphertext: string) {
		const key = this.encryptionKeys.get(fromPeerId);
		if (!key) return;

		try {
			const decrypted = await decryptData(ciphertext, key);
			const message = JSON.parse(decrypted) as SyncMessage;

			if (
				this.isAuthorityMessage(message) &&
				!this.isAuthorizedAuthoritySender(fromPeerId)
			) {
				logger.warn(
					`[SECURITY] Ignored encrypted authority message ${message.type} from non-master peer ${fromPeerId}`,
				);
				return;
			}

			// Dispatch the decrypted message
			if (message.type === "YJS_UPDATE") {
				dbSync.applyUpdate(fromHex(message.payload.update), fromPeerId);
				this.emitMessageCallbacks(message, fromPeerId);
				return; // Already applied; prevent double-handling via callbacks
			}

			if (message.type === "YJS_SYNC_REQUEST") {
				this.sendYjsDiff(fromPeerId, message.payload.stateVector);
				return;
			}

			this.emitMessageCallbacks(message, fromPeerId);
		} catch (err) {
			logger.error("Failed to decrypt PQC message:", err);
		}
	}

	private updatePeerList(id: string, role: P2PRole) {
		if (!this.peers.find((p) => p.id === id)) {
			this.peers.push({
				id,
				role,
				isMaster: this.getMasterPeerId() === id,
				lastSeen: new Date().toISOString(),
			});
			this.notifyConnectionChange();
		}
	}

	private broadcastPeerList() {
		this.broadcast({
			type: "PEER_LIST_UPDATE",
			payload: this.peers,
		});
	}

	private notifyConnectionChange() {
		for (const cb of this.onConnectionChangeCallbacks) {
			cb([...this.peers]);
		}
	}

	public onMessage(cb: (message: SyncMessage, fromPeerId: string) => void) {
		this.onMessageCallbacks.push(cb);
	}

	public onConnectionChange(cb: (peers: PeerInfo[]) => void) {
		this.onConnectionChangeCallbacks.push(cb);
	}

	public onHandshakeRequest(
		cb: (payload: HandshakeRequestPayload, fromPeerId: string) => void,
	) {
		this.onHandshakeRequestCallbacks.push(cb);
	}

	public onHandshakeResponse(
		cb: (payload: HandshakeResponsePayload, fromPeerId: string) => void,
	) {
		this.onHandshakeResponseCallbacks.push(cb);
	}

	/**
	 * Register a callback for incoming account recovery requests.
	 * Called on the master device when another device wants to recover.
	 */
	public onRecoveryRequest(
		cb: (
			requestId: string,
			email: string,
			deviceName: string,
			fromPeerId: string,
		) => void,
	) {
		this.onRecoveryRequestCallbacks.push(cb);
	}

	public onConnectionError(cb: (issue: ConnectionErrorInfo) => void) {
		this.onConnectionErrorCallbacks.push(cb);
	}

	public onPeerHealthChange(cb: (state: PeerHealthInfo) => void) {
		this.onPeerHealthChangeCallbacks.push(cb);
		return () => {
			this.onPeerHealthChangeCallbacks =
				this.onPeerHealthChangeCallbacks.filter((entry) => entry !== cb);
		};
	}

	public getPeerHealth(peerId: string): PeerHealthInfo | undefined {
		return this.health.get(peerId);
	}

	public getPeerHealthList(): PeerHealthInfo[] {
		return this.health.list();
	}

	/**
	 * Send an account recovery request to a peer (master device).
	 */
	public sendRecoveryRequest(
		toPeerId: string,
		requestId: string,
		email: string,
		deviceName: string,
		deviceId: string,
	) {
		this.sendTo(toPeerId, {
			type: "REQUEST_ACCOUNT_RECOVERY",
			payload: { requestId, email, deviceName, deviceId },
		});
	}

	/**
	 * Approve a recovery request — sends the encrypted seed to the requesting device.
	 */
	public approveRecovery(
		toPeerId: string,
		requestId: string,
		encryptedSeed: string,
		tempKey: string,
	) {
		this.sendTo(toPeerId, {
			type: "RECOVERY_APPROVED",
			payload: { requestId, encryptedSeed, tempKey },
		});
	}

	/**
	 * Deny a recovery request.
	 */
	public denyRecovery(
		toPeerId: string,
		requestId: string,
		reason = "Request denied by user",
	) {
		this.sendTo(toPeerId, {
			type: "RECOVERY_DENIED",
			payload: { requestId, reason },
		});
	}

	public disconnectPeer(peerId: string) {
		const conn = this.connections.get(peerId);
		if (conn) {
			conn.close();
			this.connections.delete(peerId);
			this.sharedSecrets.delete(peerId);
			this.health.markOffline(peerId);
			this.notifyConnectionChange();
		}
	}

	public disconnect() {
		for (const conn of Array.from(this.connections.values())) {
			conn.close();
		}
		this.connections.clear();
		this.sharedSecrets.clear();
		this.pendingConnectionRequests.clear();
		this.peer?.destroy();
		this.peer = null;
	}
}

export const p2pManager = new P2PManager();
