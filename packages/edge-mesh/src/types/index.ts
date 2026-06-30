export interface PeerDescriptor {
	id: string;
	role?: string;
	lastSeen?: number;
	[key: string]: any;
}

export interface MeshMessageEnvelope {
	id: string;
	version: string;
	sourcePeerId: string;
	targetPeerId?: string;
	timestamp: number;
	type: string;
	payload: any;
	signature?: Uint8Array;
	capability?: string;
}

export interface MeshTransportEvents {
	'peer:connected': (peerId: string) => void;
	'peer:disconnected': (peerId: string) => void;
	message: (envelope: MeshMessageEnvelope) => void;
	error: (error: Error) => void;
}

export interface MeshTransport {
	start(peerId: string): Promise<void>;
	stop(): Promise<void>;
	connect(peerId: string): Promise<void>;
	disconnect(peerId: string): Promise<void>;
	send(targetPeerId: string, envelope: MeshMessageEnvelope): Promise<void>;
	broadcast(envelope: MeshMessageEnvelope): Promise<void>;
	on<K extends keyof MeshTransportEvents>(
		event: K,
		listener: MeshTransportEvents[K],
	): void;
	off<K extends keyof MeshTransportEvents>(
		event: K,
		listener: MeshTransportEvents[K],
	): void;
}

export interface MeshStorage {
	get(key: string): Promise<any>;
	set(key: string, value: any): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
}

export interface EdgeMeshNodeEvents {
	'peer:connected': (peerId: string) => void;
	'peer:disconnected': (peerId: string) => void;
	message: (message: {
		type: string;
		payload: any;
		sourcePeerId: string;
	}) => void;
	error: (error: Error) => void;
	started: () => void;
	stopped: () => void;
}

export interface EdgeMeshNode {
	readonly peerId: string;
	start(): Promise<void>;
	stop(): Promise<void>;
	connect(remotePeerId: string): Promise<void>;
	broadcast(message: { type: string; payload: any }): Promise<void>;
	send(
		targetPeerId: string,
		message: { type: string; payload: any },
	): Promise<void>;
	on<K extends keyof EdgeMeshNodeEvents>(
		event: K,
		listener: EdgeMeshNodeEvents[K],
	): void;
	off<K extends keyof EdgeMeshNodeEvents>(
		event: K,
		listener: EdgeMeshNodeEvents[K],
	): void;
}

export interface Transport {
	send(to: string, data: Uint8Array): void;
	broadcast(data: Uint8Array): void;
	onMessage(callback: (from: string, data: Uint8Array) => void): void;
	onPeerConnect(callback: (peerId: string) => void): void;
	onPeerDisconnect(callback: (peerId: string) => void): void;
}

export interface CrdtAdapter {
	applyUpdate(update: Uint8Array, origin?: any): void;
	getUpdate(): Uint8Array;
	getStateVector?(): Uint8Array;
	getDiff?(remoteStateVector: Uint8Array): Uint8Array;
	onChange(callback: (update: Uint8Array, origin: any) => void): void;
	doc: import('yjs').Doc;
}

export interface EdgeMeshRemoteOrigin {
	type: 'remote';
	peerId: string;
}

export const isEdgeMeshRemoteOrigin = (
	origin: unknown,
): origin is EdgeMeshRemoteOrigin => {
	return (
		Boolean(origin) &&
		typeof origin === 'object' &&
		(origin as { type?: unknown }).type === 'remote' &&
		typeof (origin as { peerId?: unknown }).peerId === 'string'
	);
};

export interface EdgeMeshConfig {
	transport: Transport;
	localPeerId: string;
}

export type NamespaceAction = 'read' | 'write' | 'admin' | 'gc' | string;

export interface NamespaceCapabilityGrant {
	subject: string;
	namespace: string;
	action: NamespaceAction | '*';
	expiresAt?: number;
}

export interface NamespaceAuthorizer {
	grant(grant: NamespaceCapabilityGrant): void;
	can(subject: string, namespace: string, action: NamespaceAction): boolean;
	require(subject: string, namespace: string, action: NamespaceAction): void;
}

export type PeerPresenceStatus =
	| 'connected'
	| 'verified'
	| 'offline'
	| 'disconnected'
	| 'reconnected'
	| 'stale';

export interface PeerPresenceEvent {
	id: string;
	peerId: string;
	status: PeerPresenceStatus;
	timestamp: number;
	metadata?: Record<string, unknown>;
}

export interface FailoverCandidate {
	peerId: string;
	score: number;
	reason: string;
}

export type GovernanceVoteValue = 'approve' | 'reject';
export type GovernanceStatus = 'active' | 'approved' | 'rejected' | 'expired';

export interface GovernanceVote {
	peerId: string;
	value: GovernanceVoteValue;
	reason?: string;
	timestamp: number;
}

export interface GovernanceProposal {
	id: string;
	targetPeerId: string;
	proposedRole: string;
	createdBy: string;
	createdAt: number;
	expiresAt: number;
	status: GovernanceStatus;
	votes: Record<string, GovernanceVote>;
	metadata?: Record<string, unknown>;
}

export interface CrdtSyncEnvelope {
	id: string;
	opId: string;
	type: 'sync:request' | 'sync:update' | 'sync:snapshot' | 'sync:ack';
	namespace: string;
	sourcePeerId: string;
	targetPeerId?: string;
	ackId?: string;
	timestamp: number;
	stateVector?: Uint8Array;
	update?: Uint8Array;
	capability?: string;
	signature?: Uint8Array;
}

export interface NamespacePartition {
	id: string;
	namespace: string;
	label: string;
	parentId?: string;
	kind?: string;
	metadata?: Record<string, unknown>;
}
