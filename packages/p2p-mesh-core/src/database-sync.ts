import * as Y from "yjs";
import type {
	AppState,
	ArqueoSession,
	AuditEntry,
	Branch,
	Client,
	EntityEditProposal,
	InventoryConfig,
	InvoiceOCRResult,
	P2PRole,
	PeerInfo,
	PeerPermissions,
	Product,
	ProductChangeHistoryEntry,
	PurchaseOrder,
	Sale,
	Supplier,
	TeamMember,
} from "./types";
import { logger } from "./utils/logger";

export type ConnectionEvent = {
	peerId: string;
	eventType:
		| "connected"
		| "verified"
		| "offline"
		| "disconnected"
		| "reconnected";
	timestamp: number;
};

type EntityRecord = {
	id: string;
	lastSeen?: string;
	action?: string;
	timestamp?: string;
	updatedAt?: string;
	updatedBy?: string;
};

type SyncEntityRecord = EntityRecord & {
	__baseUpdatedAt?: string;
};

type LinkedNodeRecord = Omit<PeerInfo, "lastSeen"> & {
	permissions?: PeerPermissions;
	isMaster?: boolean;
	lastSeen: string;
	status?: "connected" | "verified" | "offline";
	connectedAt?: string;
	verifiedAt?: string;
};

/**
 * Distributed Database Manager using Yjs (CRDT)
 * Optimized to use Y.Map for better entity management and eventual consistency merging.
 */
export class DatabaseSyncManager {
	public doc: Y.Doc;
	private products: Y.Map<Product>;
	private sales: Y.Map<Sale>;
	private clients: Y.Map<Client>;
	private suppliers: Y.Map<Supplier>;
	private purchaseOrders: Y.Map<PurchaseOrder>;
	private auditLogs: Y.Map<AuditEntry>;
	private arqueoSessions: Y.Map<ArqueoSession>;
	private ocrResults: Y.Map<InvoiceOCRResult>;
	private teamMembers: Y.Map<TeamMember>;
	private branches: Y.Map<Branch>;
	private metadata: Y.Map<string>;
	private linkedNodes: Y.Map<LinkedNodeRecord>;
	private pendingEdits: Y.Map<EntityEditProposal>;
	private productChangeHistory: Y.Map<ProductChangeHistoryEntry>;
	private ephemeralNodes: Map<string, Partial<LinkedNodeRecord>> = new Map();
	private peerHistory: Map<string, ConnectionEvent[]> = new Map();
	public localPeerId: string | null = null;
	public activeBranchId: string | undefined = undefined;
	private readyCallbacks: (() => void)[] = [];
	private failoverHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private hostFailoverCallbacks: ((payload: {
		successorId: string;
		previousMasterId: string | null;
	}) => void)[] = [];
	/**
	 * Guards against premature YJS_UPDATE broadcasts.
	 * Set to true only after initWithState() completes.
	 */
	public isReady: boolean = false;

	private getAuthorityPeerId(): string | null {
		return (
			this.metadata.get("authorityPeerId") ||
			this.metadata.get("masterPeerId") ||
			null
		);
	}

	public isLocalAuthority(): boolean {
		if (!this.localPeerId) return false;
		const masterId = this.getAuthorityPeerId();
		if (masterId) return masterId === this.localPeerId;
		const selfNode = this.linkedNodes.get(this.localPeerId);
		return !!selfNode?.isMaster;
	}

	/** True if peer completed PQC handshake (status verified). */
	public isPeerVerified(peerId?: string | null): boolean {
		if (!peerId) return false;
		return this.ephemeralNodes.get(peerId)?.status === "verified";
	}

	/** Public authority check for mesh transport guards. */
	public isAuthorityPeerId(peerId?: string | null): boolean {
		return this.isAuthorityPeer(peerId);
	}

	private isAuthorityPeer(peerId?: string | null): boolean {
		if (!peerId) return false;
		const masterId = this.getAuthorityPeerId();
		if (masterId) return peerId === masterId;
		const node = this.linkedNodes.get(peerId);
		return !!node?.isMaster;
	}

	private isPeerConfigMutationAllowed(
		authorityPeerId: string | null | undefined,
		targetPeerId: string,
	) {
		if (!authorityPeerId) return false;
		if (this.isAuthorityPeer(authorityPeerId)) return true;
		return (
			authorityPeerId === targetPeerId && this.isAuthorityPeer(targetPeerId)
		);
	}

	private getEffectivePeerConfig(peerId?: string | null): {
		role: P2PRole;
		permissions?: PeerPermissions;
		isMaster: boolean;
	} {
		if (!peerId) {
			return {
				role: "vendedor" as P2PRole,
				permissions: undefined as PeerPermissions | undefined,
				isMaster: false,
			};
		}

		const node = this.linkedNodes.get(peerId);
		const ephem = this.ephemeralNodes.get(peerId);
		const isVerified = ephem?.status === "verified";
		const isMasterPeer = this.isAuthorityPeer(peerId) || !!node?.isMaster;

		if (!node) {
			return {
				role: (this.metadata.get("role") || "vendedor") as P2PRole,
				permissions: undefined,
				isMaster: isMasterPeer && (peerId === this.localPeerId || isVerified),
			};
		}

		// Security: Admin/Master roles REQUIRE cryptographic verification
		const canAssumePrivilegedRole = peerId === this.localPeerId || (isVerified && ephem?.dsaPublicKey === node.dsaPublicKey);

		if (isMasterPeer && canAssumePrivilegedRole) {
			return {
				role: "admin" as P2PRole,
				permissions: node.permissions,
				isMaster: true,
			};
		}

		const rawRole = node.role || "vendedor";
		const effectiveRole =
			rawRole === "admin" && !canAssumePrivilegedRole
				? "vendedor"
				: rawRole;

		const defaults = this.getDefaultPermissions(effectiveRole as P2PRole);
		const explicit = node.permissions;
		const hasExplicit =
			!!explicit &&
			Object.keys(explicit as object).some(
				(key) => (explicit as unknown as Record<string, unknown>)[key] !== undefined,
			);

		return {
			role: effectiveRole as P2PRole,
			permissions: hasExplicit ? { ...defaults, ...explicit } : defaults,
			isMaster: false,
		};
	}

	private isBranchScoped(collectionName: string): boolean {
		const scopedCollections = [
			"products",
			"sales",
			"arqueoSessions",
			"ocrResults",
			"purchaseOrders",
			"productChangeHistory",
			"pendingEdits",
		];
		return scopedCollections.includes(collectionName);
	}

	constructor() {
		this.doc = new Y.Doc();
		this.products = this.doc.getMap("products");
		this.sales = this.doc.getMap("sales");
		this.clients = this.doc.getMap("clients");
		this.suppliers = this.doc.getMap("suppliers");
		this.purchaseOrders = this.doc.getMap("purchaseOrders");
		this.auditLogs = this.doc.getMap("auditLogs");
		this.arqueoSessions = this.doc.getMap("arqueoSessions");
		this.ocrResults = this.doc.getMap("ocrResults");
		this.teamMembers = this.doc.getMap("teamMembers");
		this.branches = this.doc.getMap("branches");
		this.metadata = this.doc.getMap("metadata");
		this.linkedNodes = this.doc.getMap("linkedNodes");
		this.pendingEdits = this.doc.getMap("pendingEdits");
		this.productChangeHistory = this.doc.getMap("productChangeHistory");
	}

	private checkPermissions(
		collectionName: string,
		item?: Partial<EntityRecord>,
	): boolean {
		if (!this.localPeerId) return true; // Allow during initialization

		const selfNode = this.linkedNodes.get(this.localPeerId);
		if (!selfNode) {
			if (this.getAuthorityPeerId() === this.localPeerId) return true;

			// Default to strict collaborator restrictions if node is unknown!
			if (collectionName === "auditLogs") {
				if (
					item?.action &&
					typeof item.action === "string" &&
					item.action.includes("PRIVILEGE")
				) {
					logger.warn(
						`[SECURITY] Blocked malicious audit log from unknown node`,
					);
					return false;
				}
				return true;
			}
			return false; // Safest fallback
		}

		const effectiveSelf = this.getEffectivePeerConfig(this.localPeerId);
		if (effectiveSelf.role === "admin" || effectiveSelf.isMaster) return true;

		const perms: Partial<PeerPermissions> = effectiveSelf.permissions || {};
		switch (collectionName) {
			case "products":
				return !!perms.canEditProducts;
			case "productChangeHistory":
				return !!perms.canEditProducts;
			case "sales":
				return !!perms.canEditSales;
			case "clients":
				return !!perms.canEditClients;
			case "suppliers":
				return !!perms.canEditSuppliers;
			case "purchaseOrders":
				return !!perms.canEditPurchaseOrders;
			case "teamMembers":
				return false;
			case "branches":
				return true; // Allow for now, might need more granular perms later
			case "arqueoSessions":
				return !!perms.canViewArqueo;
			case "ocrResults":
				return !!perms.canEditPurchaseOrders;
			case "auditLogs":
				// Collaborators can only append normal audit logs, block malicious ones
				if (
					item?.action &&
					typeof item.action === "string" &&
					item.action.includes("PRIVILEGE")
				) {
					logger.warn(
						`[SECURITY] Blocked malicious audit log from collaborator`,
					);
					return false;
				}
				return true;
			default:
				return false;
		}
	}

	/**
	 * Helper to perform surgical inserts or updates on a Y.Map
	 */
	public upsertEntity<
		T extends {
			id: string;
			lastSeen?: string;
			action?: string;
			timestamp?: string;
			updatedAt?: string;
			updatedBy?: string;
			__baseUpdatedAt?: string;
		},
	>(collectionName: keyof AppState, item: T) {
		if (!this.checkPermissions(collectionName, item)) {
			logger.warn(
				`[SECURITY] Unauthorized mutation attempt on ${collectionName}`,
			);
			return;
		}

		const yMap = this.getMapForCollection(collectionName);
		if (!yMap) return;
		const { __baseUpdatedAt, ...persistableItem } = item as T &
			SyncEntityRecord;

		// MERGE RESOLUTION SYSTEM
		// If a collaborator edits a product, we route it to pendingEdits for the admin to approve.
		if (collectionName === "products" && this.localPeerId && this.isReady) {
			const effectiveSelf = this.getEffectivePeerConfig(this.localPeerId);
			const isAdmin = effectiveSelf.role === "admin" || effectiveSelf.isMaster;
			const autoApplyProductUpdates = Boolean(
				this.getInventoryConfig()?.autoApplyProductUpdates,
			);

			if (!isAdmin && !autoApplyProductUpdates) {
				const originalData = yMap.get(item.id);
				const hasConcurrentChange =
					!!originalData?.updatedAt &&
					!!__baseUpdatedAt &&
					originalData.updatedAt !== __baseUpdatedAt &&
					originalData.updatedBy !== item.updatedBy;

				if (originalData && hasConcurrentChange) {
					const proposalId = `prop-${Date.now()}-${this.localPeerId}`;
					const proposal: EntityEditProposal = {
						id: proposalId,
						entityId: item.id,
						collectionName: collectionName,
						proposedData: persistableItem,
						originalData: originalData,
						peerId: this.localPeerId,
						timestamp: new Date().toISOString(),
						status: "pending",
					};

					this.doc.transact(() => {
						this.pendingEdits.set(proposalId, proposal as any);
					}, { origin: "local", branchId: this.activeBranchId });

					logger.log(
						`[MERGE] Conflicting collaborator edit on ${item.id} routed to pendingEdits`,
					);
					return;
				}
			}
		}

		const branchId =
			(item as any).branchId ||
			(this.isBranchScoped(collectionName) ? this.activeBranchId : undefined);

		this.doc.transact(() => {
			yMap.set(item.id, persistableItem as any);
		}, { origin: "local", branchId });
	}

	/**
	 * Helper to perform surgical deletes (soft deletes or physical if needed)
	 */
	public deleteEntity(collectionName: keyof AppState, id: string) {
		if (!this.checkPermissions(collectionName)) {
			logger.warn(
				`[SECURITY] Unauthorized deletion attempt on ${collectionName}`,
			);
			return;
		}

		const yMap = this.getMapForCollection(collectionName);
		if (!yMap) return;

		const branchId = this.isBranchScoped(collectionName) ? this.activeBranchId : undefined;

		this.doc.transact(() => {
			yMap.delete(id);
		}, { origin: "local", branchId });
	}

	/**
	 * Admin-only function to resolve a pending edit
	 */
	public resolvePendingEdit(
		proposalId: string,
		resolution: "approve" | "reject",
		mergedData?: any,
	) {
		const effectiveSelf = this.getEffectivePeerConfig(this.localPeerId);
		const isAdmin = effectiveSelf.role === "admin" || effectiveSelf.isMaster;

		if (!isAdmin) {
			logger.warn(
				`[SECURITY] Unauthorized attempt to resolve pending edit by ${this.localPeerId}`,
			);
			return;
		}

		const proposal = this.pendingEdits.get(proposalId);
		if (!proposal) return;

		const branchId = this.isBranchScoped(proposal.collectionName)
			? (proposal.proposedData as any).branchId || this.activeBranchId
			: undefined;

		this.doc.transact(() => {
			if (resolution === "approve") {
				const finalData = mergedData || proposal.proposedData;
				const collectionMap = this.getMapForCollection(proposal.collectionName);
				if (collectionMap) {
					// We temporarily bypass the upsertEntity hook by setting it directly to the map
					collectionMap.set(proposal.entityId, finalData as any);
				}
			}

			// Always remove the proposal once resolved
			this.pendingEdits.delete(proposalId);
		}, { origin: "local", branchId });

		logger.log(`[MERGE] Proposal ${proposalId} resolved as ${resolution}`);
	}

	private getMapForCollection(collection: string): Y.Map<EntityRecord> | null {
		switch (collection) {
			case "products":
				return this.products as unknown as Y.Map<EntityRecord>;
			case "sales":
				return this.sales as unknown as Y.Map<EntityRecord>;
			case "clients":
				return this.clients as unknown as Y.Map<EntityRecord>;
			case "suppliers":
				return this.suppliers as unknown as Y.Map<EntityRecord>;
			case "purchaseOrders":
				return this.purchaseOrders as unknown as Y.Map<EntityRecord>;
			case "auditLogs":
				return this.auditLogs as unknown as Y.Map<EntityRecord>;
			case "arqueoSessions":
				return this.arqueoSessions as unknown as Y.Map<EntityRecord>;
			case "ocrResults":
				return this.ocrResults as unknown as Y.Map<EntityRecord>;
			case "teamMembers":
				return this.teamMembers as unknown as Y.Map<EntityRecord>;
			case "branches":
				return this.branches as unknown as Y.Map<EntityRecord>;
			case "pendingEdits":
				return this.pendingEdits as unknown as Y.Map<EntityRecord>;
			case "productChangeHistory":
				return this.productChangeHistory as unknown as Y.Map<EntityRecord>;
			case "peers":
				return this.linkedNodes as unknown as Y.Map<EntityRecord>;
			default:
				return null;
		}
	}

	/**
	 * Syncs the local AppState into the Yjs Doc.
	 */
	public initWithState(state: AppState) {
		this.doc.transact(() => {
			const mergeAndSync = <T extends { id: string }>(
				collectionName: keyof AppState,
				array: T[] = [],
			) => {
				if (array) {
					for (const item of array) {
						this.upsertEntity(collectionName, item);
					}
				}
			};

			mergeAndSync("products", state.products);
			mergeAndSync("arqueoSessions", state.arqueoSessions);
			mergeAndSync("ocrResults", state.ocrResults);
			mergeAndSync("sales", state.sales);
			mergeAndSync("clients", state.clients);
			mergeAndSync("suppliers", state.suppliers);
			mergeAndSync("purchaseOrders", state.purchaseOrders);
			mergeAndSync("auditLogs", state.auditLogs);
			mergeAndSync("teamMembers", state.teamMembers);
			mergeAndSync("branches", state.branches);
			mergeAndSync("productChangeHistory", state.productChangeHistory);

			if (state.pendingEdits) {
				for (const edit of state.pendingEdits) {
					this.pendingEdits.set(edit.id, edit as any);
				}
			}

			this.metadata.set(
				"inventoryConfig",
				JSON.stringify(state.inventoryConfig),
			);

			if (state.peers && state.peers.length > 0) {
				for (const peer of state.peers) {
					this.upsertEntity("peers", peer); // Special case for peers/linkedNodes
				}
			}
		}, "local");

		// Mark as ready AFTER the initial state has been fully loaded into Y.Doc.
		// This prevents the on('update') handler in p2p.ts from broadcasting
		// empty state before the CRDT has been populated.
		this.isReady = true;
		for (const callback of this.readyCallbacks) {
			callback();
		}

		// Start failover monitoring heartbeat (every 30s)
		if (this.failoverHeartbeatTimer) {
			clearInterval(this.failoverHeartbeatTimer);
		}
		this.failoverHeartbeatTimer = setInterval(() => {
			if (this.localPeerId) {
				// 1. Update our own lastSeen to signal we are active
				this.updateLinkedNode(this.localPeerId, {
					status: "verified", // If heartbeat is running, we are effectively active
				});

				// 2. Check if host has timed out and execute failover if needed
				this.checkHostHealth();
			}
		}, 30000);
	}

	public onReady(callback: () => void) {
		this.readyCallbacks.push(callback);
		if (this.isReady) {
			callback();
		}
		return () => {
			this.readyCallbacks = this.readyCallbacks.filter((cb) => cb !== callback);
		};
	}

	public onHostFailover(
		callback: (payload: {
			successorId: string;
			previousMasterId: string | null;
		}) => void,
	) {
		this.hostFailoverCallbacks.push(callback);
		return () => {
			this.hostFailoverCallbacks = this.hostFailoverCallbacks.filter(
				(cb) => cb !== callback,
			);
		};
	}

	/**
	 * Returns the current state derived from the Yjs Doc.
	 */
	public getState(localPeerId?: string | null): Partial<AppState> {
		const peers = this.getLinkedNodes();
		const effectiveLocalId = localPeerId || this.localPeerId;

		let resolvedRole: P2PRole = "vendedor";
		let resolvedPermissions: PeerPermissions | undefined;

		if (effectiveLocalId) {
			const masterId = this.getMasterPeerId();
			const effectiveSelf = this.getEffectivePeerConfig(effectiveLocalId);

			// If we are the original host, we always retain admin privileges
			if (masterId === effectiveLocalId) {
				resolvedRole = "admin";
			} else if (effectiveSelf.role) {
				resolvedRole = effectiveSelf.role;
				resolvedPermissions = effectiveSelf.permissions;
			} else {
				resolvedRole = "vendedor";
			}
		} else {
			resolvedRole = "admin";
		}

		return {
			products: Array.from(this.products.values()),
			sales: Array.from(this.sales.values()),
			clients: Array.from(this.clients.values()),
			suppliers: Array.from(this.suppliers.values()),
			purchaseOrders: Array.from(this.purchaseOrders.values()),
			auditLogs: Array.from(this.auditLogs.values()),
			arqueoSessions: Array.from(this.arqueoSessions.values()),
			ocrResults: Array.from(this.ocrResults.values()),
			teamMembers: Array.from(this.teamMembers.values()),
			branches: Array.from(this.branches.values()),
			inventoryConfig: this.getInventoryConfig(),
			role: resolvedRole,
			permissions: resolvedPermissions,
			peers: peers,
			pendingEdits: Array.from(
				this.pendingEdits.values(),
			) as EntityEditProposal[],
			productChangeHistory: Array.from(
				this.productChangeHistory.values(),
			) as ProductChangeHistoryEntry[],
		};
	}

	public getInventoryConfig(): InventoryConfig | undefined {
		const raw = this.metadata.get("inventoryConfig");
		if (!raw) return undefined;
		try {
			return JSON.parse(raw) as InventoryConfig;
		} catch (error) {
			logger.warn("[SYNC] Failed to parse inventoryConfig metadata", error);
			return undefined;
		}
	}

	private logConnectionEvent(
		peerId: string,
		eventType: ConnectionEvent["eventType"],
	) {
		const history = this.peerHistory.get(peerId) || [];
		const event: ConnectionEvent = {
			peerId,
			eventType,
			timestamp: Date.now(),
		};

		history.push(event);
		if (history.length > 100) {
			history.shift();
		}
		this.peerHistory.set(peerId, history);

		logger.debug(`[SYNC] Logged connection event for ${peerId}: ${eventType}`);
	}

	public getPeerHistory(peerId: string): ConnectionEvent[] {
		return this.peerHistory.get(peerId) || [];
	}

	public setInventoryConfig(config: InventoryConfig) {
		if (!this.isLocalAuthority()) {


			logger.warn(
				`[SECURITY] Blocked unauthorized inventory config update from ${this.localPeerId}`,
			);
			return;
		}



		this.doc.transact(() => {
			this.metadata.set("inventoryConfig", JSON.stringify(config));
		}, "local");
	}
	public getMasterPeerId(): string | null {
		const authorityPeerId = this.metadata.get("authorityPeerId");
		if (authorityPeerId) {
			return authorityPeerId;
		}
		for (const node of this.linkedNodes.values()) {
			if (node.isMaster) return node.id;
		}
		return this.metadata.get("masterPeerId") || null;
	}

	public forceHostFailover() {
		const currentMasterId = this.getMasterPeerId();
		const successorId = this.selectSuccessor();
		if (successorId) {
			this.promoteSuccessor(successorId, currentMasterId);
			logger.log(
				`[FAILOVER] Manual host failover triggered. New host: ${successorId}`,
			);
		} else {
			logger.error("[FAILOVER] No suitable successor found for manual failover.");
		}
	}

	/**
	 * Designate mesh master. Reassignment to a different peer is blocked once a master exists.
	 * Idempotent when peerId is already master (safe re-assert before authority messages).
	 */
	public setMasterPeerId(peerId: string) {
		const currentMaster = this.getMasterPeerId();
		if (currentMaster && currentMaster !== peerId) {
			logger.warn(
				`[SECURITY] Blocked unauthorized master reassignment to ${peerId}`,
			);
			return;
		}

		this.doc.transact(() => {
			this.metadata.set("authorityPeerId", peerId);
			this.metadata.set("masterPeerId", peerId);
			// Keep linkedNodes.isMaster coherent for getMasterPeerId() fallback walk
			const existing = this.linkedNodes.get(peerId);
			const isSelf = !!this.localPeerId && peerId === this.localPeerId;
			if (existing || isSelf) {
				this.linkedNodes.set(peerId, {
					...(existing || { id: peerId, role: "admin" as P2PRole }),
					id: peerId,
					role: "admin",
					isMaster: true,
					lastSeen: new Date().toISOString(),
				});
			}
			for (const [id, node] of this.linkedNodes.entries()) {
				if (id !== peerId && node.isMaster) {
					this.linkedNodes.set(id, { ...node, isMaster: false });
				}
			}
		}, "local");
	}

	public getLinkedNodes(): LinkedNodeRecord[] {
		const crdtPeers = Array.from(this.linkedNodes.values());
		const peersMap = new Map<string, LinkedNodeRecord>();

		for (const p of crdtPeers) {
			peersMap.set(p.id, { ...p, ...(this.ephemeralNodes.get(p.id) || {}) });
		}

		for (const [id, ephem] of this.ephemeralNodes.entries()) {
			if (!peersMap.has(id)) {
				peersMap.set(id, {
					id,
					role: "vendedor",
					...ephem,
					lastSeen: ephem.lastSeen || new Date().toISOString(),
				});
			}
		}

		return Array.from(peersMap.values());
	}

	public updateLinkedNode(
		peerId: string,
		info: Partial<LinkedNodeRecord>,
		authorityPeerId: string | null = this.localPeerId,
	) {
		const existing = this.linkedNodes.get(peerId);

		if (info.status && info.status !== existing?.status) {
			if (info.status === "verified") {
				this.logConnectionEvent(peerId, "verified");
			} else if (info.status === "offline") {
				this.logConnectionEvent(peerId, "disconnected");
				this.logConnectionEvent(peerId, "offline");
			} else if (info.status === "connected") {
				if (existing?.status === "offline") {
					this.logConnectionEvent(peerId, "reconnected");
				} else {
					this.logConnectionEvent(peerId, "connected");
				}
			}
		}

		this.doc.transact(() => {
			const existingRecord = existing || ({} as LinkedNodeRecord);
			const { id: _existingId, ...existingWithoutId } = existingRecord;
			const canEditPeerConfig = this.isPeerConfigMutationAllowed(
				authorityPeerId,
				peerId,
			);
			const nextRole =
				canEditPeerConfig && info.role
					? info.role
					: existingRecord.role || "vendedor";
			const nextPermissions =
				canEditPeerConfig && info.permissions
					? info.permissions
					: existingRecord.permissions || this.getDefaultPermissions(nextRole);
			const nextDsaPublicKey =
				canEditPeerConfig && info.dsaPublicKey
					? info.dsaPublicKey
					: existingRecord.dsaPublicKey;
			const nextIsMaster =
				peerId === authorityPeerId
					? typeof info.isMaster === "boolean"
						? info.isMaster
						: existingRecord.isMaster || false
					: false;
			const safeInfo = canEditPeerConfig
				? info
				: (({
						role: _role,
						permissions: _permissions,
						isMaster: _isMaster,
						...rest
					}) => rest)(info || {});

			const nextConnectedAt = existingRecord.connectedAt || new Date().toISOString();
			let nextVerifiedAt = existingRecord.verifiedAt;
			if (
				(info.status === "verified" || existingRecord.status === "verified") &&
				!nextVerifiedAt
			) {
				nextVerifiedAt = new Date().toISOString();
			}

			this.linkedNodes.set(peerId, {
				...existingWithoutId,
				...safeInfo,
				id: peerId,
				permissions: nextPermissions,
				role: nextRole,
				dsaPublicKey: nextDsaPublicKey,
				isMaster: nextIsMaster,
				lastSeen: new Date().toISOString(),
				connectedAt: nextConnectedAt,
				verifiedAt: nextVerifiedAt,
			});
		}, "local");
	}

	private getDefaultPermissions(
		role: P2PRole = "vendedor",
	): PeerPermissions {
		if (role === "admin") {
			return {
				canViewProducts: true,
				canEditProducts: true,
				canViewSales: true,
				canEditSales: true,
				canViewClients: true,
				canEditClients: true,
				canViewSuppliers: true,
				canEditSuppliers: true,
				canViewPurchaseOrders: true,
				canEditPurchaseOrders: true,
				canViewReports: true,
				canViewArqueo: true,
				canViewDashboard: true,
			};
		}

		if (role === "vendedor") {
			return {
				canViewProducts: true,
				canEditProducts: false,
				canViewSales: true,
				canEditSales: true,
				canViewClients: true,
				canEditClients: true,
				canViewSuppliers: false,
				canEditSuppliers: false,
				canViewPurchaseOrders: false,
				canEditPurchaseOrders: false,
				canViewReports: false,
				canViewArqueo: false,
				canViewDashboard: false,
			};
		}

		return {
			canViewProducts: true,
			canEditProducts: true,
			canViewSales: true,
			canEditSales: true,
			canViewClients: true,
			canEditClients: true,
			canViewSuppliers: false,
			canEditSuppliers: false,
			canViewPurchaseOrders: false,
			canEditPurchaseOrders: false,
			canViewReports: false,
			canViewArqueo: false,
			canViewDashboard: false,
		};
	}

	public updateEphemeralNode(peerId: string, info: Partial<LinkedNodeRecord>) {
		const existing = this.ephemeralNodes.get(peerId);

		if (info.status && info.status !== existing?.status) {
			if (info.status === "verified") {
				this.logConnectionEvent(peerId, "verified");
			} else if (info.status === "offline") {
				this.logConnectionEvent(peerId, "disconnected");
				this.logConnectionEvent(peerId, "offline");
			} else if (info.status === "connected") {
				if (existing?.status === "offline") {
					this.logConnectionEvent(peerId, "reconnected");
				} else {
					this.logConnectionEvent(peerId, "connected");
				}
			}
		}

		this.ephemeralNodes.set(peerId, {
			...(existing || {}),
			...info,
			lastSeen: new Date().toISOString(),
		});

		// We intentionally don't wrap this in a Yjs transaction to avoid broadcasting status changes.
	}

	public updatePeerConfig(
		peerId: string,
		role: P2PRole,
		permissions?: PeerPermissions,
		authorityPeerId: string | null = this.localPeerId,
	) {
		if (!this.isPeerConfigMutationAllowed(authorityPeerId, peerId)) {
			logger.warn(
				`[SECURITY] Blocked unauthorized peer config update for ${peerId}`,
			);
			return;
		}

		this.doc.transact(() => {
			const existing = this.linkedNodes.get(peerId) || ({} as LinkedNodeRecord);
			const { id: _existingConfigId, ...existingConfigWithoutId } = existing;
			const existingEphemeral = this.ephemeralNodes.get(peerId) || {};
			const nextRole = role;
			const nextPermissions =
				permissions || this.getDefaultPermissions(nextRole);

			this.linkedNodes.set(peerId, {
				...existingEphemeral,
				...existingConfigWithoutId,
				id: peerId,
				role: nextRole,
				permissions: nextPermissions,
				isMaster:
					peerId === authorityPeerId ? existing.isMaster || false : false,
				lastSeen: new Date().toISOString(),
			});
		}, "local");
	}


	private selectSuccessor(): string | null {
		const nodes = this.getLinkedNodes();
		const currentMasterId = this.getMasterPeerId();

		// Candidates must be online and not the current master
		const candidates = nodes.filter(
			(node) => node.id !== currentMasterId && node.status !== "offline",
		);

		if (candidates.length === 0) return null;

		// Sort deterministically:
		// 1. Status: Prefer 'verified' over 'connected'
		// 2. verifiedAt: Earliest first (longest verified uptime)
		// 3. connectedAt: Earliest first (longest connection)
		// 4. id: Lexicographical fallback
		candidates.sort((a, b) => {
			if (a.status === "verified" && b.status !== "verified") return -1;
			if (a.status !== "verified" && b.status === "verified") return 1;

			if (a.verifiedAt && b.verifiedAt) {
				const timeA = new Date(a.verifiedAt).getTime();
				const timeB = new Date(b.verifiedAt).getTime();
				if (timeA !== timeB) return timeA - timeB;
			} else if (a.verifiedAt) {
				return -1;
			} else if (b.verifiedAt) {
				return 1;
			}

			if (a.connectedAt && b.connectedAt) {
				const timeA = new Date(a.connectedAt).getTime();
				const timeB = new Date(b.connectedAt).getTime();
				if (timeA !== timeB) return timeA - timeB;
			}

			return a.id.localeCompare(b.id);
		});

		return candidates[0].id;
	}

	private promoteSuccessor(successorId: string, previousMasterId: string | null) {
		this.doc.transact(() => {
			// Update global metadata
			this.metadata.set("authorityPeerId", successorId);
			this.metadata.set("masterPeerId", successorId);

			// Update the successor's role and master status
			const existingSuccessor =
				this.linkedNodes.get(successorId) || ({} as LinkedNodeRecord);
			this.linkedNodes.set(successorId, {
				...existingSuccessor,
				id: successorId,
				isMaster: true,
				role: "admin",
				permissions: this.getDefaultPermissions("admin"),
				lastSeen: new Date().toISOString(),
			});

			// Demote the previous master if present
			if (previousMasterId && previousMasterId !== successorId) {
				const existingOldMaster = this.linkedNodes.get(previousMasterId);
				if (existingOldMaster) {
					this.linkedNodes.set(previousMasterId, {
						...existingOldMaster,
						isMaster: false,
						lastSeen: existingOldMaster.lastSeen,
					});
				}
			}
		}, "local");

		logger.log(
			`[FAILOVER] Host failover completed. New host: ${successorId} (Previous: ${previousMasterId})`,
		);

		// Emit event to local listeners
		for (const cb of this.hostFailoverCallbacks) {
			cb({ successorId, previousMasterId });
		}
	}

	private checkHostHealth() {
		const currentMasterId = this.getMasterPeerId();
		if (!currentMasterId || currentMasterId === this.localPeerId) return;

		const masterNode = this.linkedNodes.get(currentMasterId);
		const lastSeenStr = masterNode?.lastSeen;

		if (lastSeenStr) {
			const lastSeen = new Date(lastSeenStr).getTime();
			const now = Date.now();

			if (now - lastSeen > 60000) {
				logger.warn(
					`[FAILOVER] Master ${currentMasterId} offline for ${now - lastSeen}ms. Initiating failover.`,
				);

				const successorId = this.selectSuccessor();
				if (successorId) {
					// We only trigger the promotion transaction if WE are the successor.
					// This prevents transaction collision, though Yjs would handle it.
					// Deterministic selection ensures only one peer (the successor) will act.
					if (successorId === this.localPeerId) {
						this.promoteSuccessor(successorId, currentMasterId);
					}
				} else {
					logger.error("[FAILOVER] No suitable successor found for failover.");
				}
			}
		}
	}

	public removeLinkedNode(
		peerId: string,
		authorityPeerId: string | null = this.localPeerId,
	) {
		if (!this.isPeerConfigMutationAllowed(authorityPeerId, peerId)) {
			logger.warn(
				`[SECURITY] Blocked unauthorized peer removal for ${peerId} by ${authorityPeerId}`,
			);
			return;
		}


		this.doc.transact(() => {
			this.linkedNodes.delete(peerId);
		}, "local");
	}

	/** Role override set by p2pManager to sync the effective peer role into database-sync */
	public masterRole: string | null = null;

	private gcIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

	/**
	 * Starts periodic garbage collection for a collection.
	 * Only nodes with 'admin' or 'master' role will execute the deletion.
	 */
	public startGarbageCollection(
		collectionName: string,
		maxAgeMs: number,
		checkIntervalMs: number = 60000,
	) {
		if (this.gcIntervals.has(collectionName)) {
			clearInterval(this.gcIntervals.get(collectionName));
		}

		const interval = setInterval(() => {
			// Resolve role: prefer explicit masterRole (set by p2pManager), then linkedNodes, then metadata
			let role: string | null = this.masterRole;
			if (!role) {
				const selfNode = this.localPeerId
					? this.linkedNodes.get(this.localPeerId)
					: null;
				role = selfNode?.role || this.metadata.get("role") || null;
				if (
					!role &&
					this.localPeerId &&
					this.metadata.get("masterPeerId") === this.localPeerId
				) {
					role = "admin";
				}
			}

			// Guard: only admin/master peers execute cleanup
			if (role !== "admin" && role !== "master") {
				return;
			}

			logger.debug(
				`[GC] Running cleanup for ${collectionName} (role: ${role})`,
			);

			const yMap = this.getMapForCollection(collectionName);
			if (!yMap) return;

			const now = Date.now();
			const keysToDelete: string[] = [];

			for (const [key, item] of yMap.entries()) {
				if (item?.timestamp) {
					const itemTime = new Date(item.timestamp).getTime();
					if (now - itemTime > maxAgeMs) {
						keysToDelete.push(key);
					}
				}
			}

			if (keysToDelete.length > 0) {
				this.doc.transact(() => {
					for (const key of keysToDelete) {
						yMap.delete(key);
					}
				}, "local");
				logger.log(
					`[GC] Purged ${keysToDelete.length} old items from ${collectionName}`,
				);
			}
		}, checkIntervalMs);

		this.gcIntervals.set(collectionName, interval);
	}

	public stopGarbageCollection(collectionName: string) {
		if (this.gcIntervals.has(collectionName)) {
			clearInterval(this.gcIntervals.get(collectionName));
			this.gcIntervals.delete(collectionName);
		}
	}

	/**
	 * Sync methods.
	 * Note: The massive array sync methods (syncProducts, syncSales, etc.) have been removed
	 * in favor of surgical atomic updates via upsertEntity and deleteEntity.
	 */

	/**
	 * Applies an update from a remote peer.
	 */
	public syncLayer: any = null;

	/** Security origin used when surgically reverting unauthorized remote keys. */
	private static readonly SECURITY_REVERT_ORIGIN = "p2p-security-revert";

	/** Entity maps that participate in remote mutation authz. */
	private static readonly SECURED_COLLECTIONS = [
		"products",
		"sales",
		"clients",
		"suppliers",
		"purchaseOrders",
		"arqueoSessions",
		"ocrResults",
		"teamMembers",
		"branches",
		"auditLogs",
		"productChangeHistory",
		"pendingEdits",
		"linkedNodes",
	] as const;

	public setSyncLayer(layer: any) {
		this.syncLayer = layer;
	}

	public onEnvelope(callback: (envelope: any) => void) {
		// This is a placeholder for the callback used in P2PSyncManager
	}

	/**
	 * True when the origin represents a remote peer (string peer id).
	 * Local/system origins (null, undefined, objects, security revert) are trusted.
	 */
	private isRemotePeerOrigin(origin: unknown): origin is string {
		if (typeof origin !== "string") return false;
		if (origin === DatabaseSyncManager.SECURITY_REVERT_ORIGIN) return false;
		if (this.localPeerId && origin === this.localPeerId) return false;
		// Common local Yjs origins used by the app
		if (
			origin === "local" ||
			origin === "shelf-edge-workflow" ||
			origin === "shelf-edge-security-revert" ||
			origin === "shelf-edge-e2e"
		) {
			return false;
		}
		return true;
	}

	/**
	 * Surgical post-merge check used only for privilege-sensitive collections.
	 * Entity CRDT (products/sales/clients/…) is gated by isTrustedRemoteWriter().
	 */
	private checkRemotePermissions(
		peerId: string,
		collectionName: string,
		item?: Partial<EntityRecord>,
	): boolean {
		if (this.isAuthorityPeer(peerId)) return true;

		const effective = this.getEffectivePeerConfig(peerId);
		if (effective.role === "admin" || effective.isMaster) return true;

		const isPrivilegeEscalationAudit =
			collectionName === "auditLogs" &&
			typeof item?.action === "string" &&
			item.action.includes("PRIVILEGE");

		// Privilege maps: non-admins cannot mutate
		if (
			collectionName === "teamMembers" ||
			collectionName === "linkedNodes" ||
			collectionName === "pendingEdits"
		) {
			return false;
		}
		if (isPrivilegeEscalationAudit) {
			return false;
		}

		// Entity collections: trusted writers keep their merge (isTrustedRemoteWriter already gated)
		if (
			collectionName === "products" ||
			collectionName === "productChangeHistory" ||
			collectionName === "sales" ||
			collectionName === "clients" ||
			collectionName === "suppliers" ||
			collectionName === "purchaseOrders" ||
			collectionName === "ocrResults" ||
			collectionName === "arqueoSessions" ||
			collectionName === "branches" ||
			collectionName === "auditLogs"
		) {
			return true;
		}

		return false;
	}

	private snapshotCollectionMaps(): Map<
		string,
		Map<string, unknown>
	> {
		const snap = new Map<string, Map<string, unknown>>();
		for (const name of DatabaseSyncManager.SECURED_COLLECTIONS) {
			const yMap = this.doc.getMap(name);
			const copy = new Map<string, unknown>();
			yMap.forEach((value: unknown, key: string) => {
				copy.set(key, value);
			});
			snap.set(name, copy);
		}
		return snap;
	}

	/**
	 * After a remote applyUpdate, surgically restore any keys the peer was not
	 * allowed to change. Uses SECURITY_REVERT_ORIGIN so observers can ignore it.
	 */
	private revertUnauthorizedRemoteChanges(
		peerId: string,
		before: Map<string, Map<string, unknown>>,
	): string[] {
		const revertedCollections: string[] = [];

		this.doc.transact(() => {
			for (const name of DatabaseSyncManager.SECURED_COLLECTIONS) {
				const yMap = this.doc.getMap(name);
				const prev = before.get(name) ?? new Map<string, unknown>();
				let touched = false;

				// Keys currently in map
				for (const key of Array.from(yMap.keys())) {
					const current = yMap.get(key);
					const previous = prev.get(key);
					const changed =
						previous === undefined ||
						JSON.stringify(previous) !== JSON.stringify(current);

					if (!changed) continue;

					const item =
						current && typeof current === "object"
							? (current as Partial<EntityRecord>)
							: undefined;

					if (!this.checkRemotePermissions(peerId, name, item)) {
						if (previous === undefined) {
							yMap.delete(key);
						} else {
							yMap.set(key, previous);
						}
						touched = true;
					}
				}

				// Keys deleted by remote
				for (const [key, previous] of prev) {
					if (!yMap.has(key)) {
						if (!this.checkRemotePermissions(peerId, name, previous as Partial<EntityRecord>)) {
							yMap.set(key, previous);
							touched = true;
						}
					}
				}

				if (touched) revertedCollections.push(name);
			}
		}, DatabaseSyncManager.SECURITY_REVERT_ORIGIN);

		return revertedCollections;
	}

	public applyUpdate(update: Uint8Array, origin?: unknown) {
		if (update.length === 0) return;

		if (!this.isRemotePeerOrigin(origin)) {
			Y.applyUpdate(this.doc, update, origin);
			return;
		}

		const peerId = origin as string;
		// Hard gate: drop entire CRDT payload from completely unknown peers (inject attacks).
		// Known mesh members (linkedNodes or ephemeral after connect/handshake) may merge.
		// Local write ACL remains on upsertEntity. Privilege maps (teamMembers/linkedNodes/
		// pendingEdits / PRIVILEGE audits) are surgically protected post-merge.
		if (!this.isTrustedRemoteWriter(peerId)) {
			logger.warn(
				`[SECURITY] Dropped remote CRDT update from untrusted peer ${peerId}`,
			);
			return;
		}

		const beforePrivilege = this.snapshotPrivilegeMaps();
		Y.applyUpdate(this.doc, update, origin);
		this.revertUnauthorizedPrivilegeMaps(peerId, beforePrivilege);
	}

	private static readonly PRIVILEGE_COLLECTIONS = [
		"teamMembers",
		"linkedNodes",
		"pendingEdits",
		"auditLogs",
	] as const;

	private snapshotPrivilegeMaps(): Map<string, Map<string, unknown>> {
		const snap = new Map<string, Map<string, unknown>>();
		for (const name of DatabaseSyncManager.PRIVILEGE_COLLECTIONS) {
			const yMap = this.doc.getMap(name);
			const copy = new Map<string, unknown>();
			yMap.forEach((value: unknown, key: string) => {
				copy.set(key, value);
			});
			snap.set(name, copy);
		}
		return snap;
	}

	private revertUnauthorizedPrivilegeMaps(
		peerId: string,
		before: Map<string, Map<string, unknown>>,
	): void {
		const effective = this.getEffectivePeerConfig(peerId);
		const isAdmin =
			this.isAuthorityPeer(peerId) ||
			effective.role === "admin" ||
			effective.isMaster;
		if (isAdmin) return;

		this.doc.transact(() => {
			for (const name of DatabaseSyncManager.PRIVILEGE_COLLECTIONS) {
				const yMap = this.doc.getMap(name);
				const prev = before.get(name) ?? new Map<string, unknown>();

				for (const key of Array.from(yMap.keys())) {
					const current = yMap.get(key);
					const previous = prev.get(key);
					const changed =
						previous === undefined ||
						JSON.stringify(previous) !== JSON.stringify(current);
					if (!changed) continue;

					if (name === "auditLogs") {
						const action =
							current &&
							typeof current === "object" &&
							typeof (current as { action?: unknown }).action === "string"
								? (current as { action: string }).action
								: "";
						if (!action.includes("PRIVILEGE")) continue;
					}

					if (previous === undefined) yMap.delete(key);
					else yMap.set(key, previous);
				}

				for (const [key, previous] of prev) {
					if (!yMap.has(key)) {
						// Deletions of privilege records by non-admins: restore
						if (name !== "auditLogs") yMap.set(key, previous);
					}
				}
			}
		}, DatabaseSyncManager.SECURITY_REVERT_ORIGIN);
	}

	/**
	 * True if peer is a known mesh participant (not a random inject source).
	 * Includes `connected` ephemeral peers so CRDT can flow during PQC handshake
	 * before status flips to `verified` (avoids multi-peer race drops).
	 */
	private isTrustedRemoteWriter(peerId: string): boolean {
		if (this.isAuthorityPeer(peerId)) return true;
		if (this.linkedNodes.has(peerId)) return true;
		if (this.ephemeralNodes.has(peerId)) return true;
		const effective = this.getEffectivePeerConfig(peerId);
		if (effective.role === "admin" || effective.isMaster) return true;
		return false;
	}

	/**
	 * Generates a state vector to synchronize with other peers.
	 */
	public getLocalUpdate(): Uint8Array {
		return Y.encodeStateAsUpdate(this.doc);
	}

	public getStateVector(): Uint8Array {
		return Y.encodeStateVector(this.doc);
	}

	public getDiff(remoteStateVector: Uint8Array): Uint8Array {
		return Y.encodeStateAsUpdate(this.doc, remoteStateVector);
	}

	/**
	 * Observes changes in the document and triggers a callback.
	 * Passes the origin so consumers can distinguish local vs remote updates.
	 */
	public onChange(callback: (update: Uint8Array, origin: unknown) => void) {
		this.doc.on("update", (update, origin) => {
			callback(update, origin);
		});
	}

	/**
	 * High-level observer for granular entity updates.
	 * Useful for reactive UI updates without full state reconstruction.
	 */
	public onObserve(
		callback: (
			collection: keyof AppState,
			items: EntityRecord[],
			deletedIds: string[],
		) => void,
	): () => void {
		const collections: (keyof AppState)[] = [
			"products",
			"sales",
			"clients",
			"suppliers",
			"purchaseOrders",
			"auditLogs",
			"arqueoSessions",
			"ocrResults",
			"teamMembers",
			"branches",
			"pendingEdits",
			"productChangeHistory",
		];

		const observers = collections.map((col) => {
			const yMap = this.getMapForCollection(col);
			if (!yMap) return null;

			const observer = (event: Y.YMapEvent<EntityRecord>) => {
				const items: EntityRecord[] = [];
				const deletedIds: string[] = [];

				event.changes.keys.forEach((change, key) => {
					if (change.action === "add" || change.action === "update") {
						const item = yMap.get(key);
						if (item) items.push(item);
					} else if (change.action === "delete") {
						deletedIds.push(key);
					}
				});

				if (items.length > 0 || deletedIds.length > 0) {
					callback(col, items, deletedIds);
				}
			};

			yMap.observe(observer);
			return { yMap, observer };
		});

		return () => {
			observers.forEach((obs) => {
				if (obs) obs.yMap.unobserve(obs.observer);
			});
		};
	}
}

export const dbSync = new DatabaseSyncManager();


