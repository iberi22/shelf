import { EventEmitter } from 'events';

export interface ReconnectBackoffOptions {
	initialDelayMs?: number;
	maxDelayMs?: number;
	jitterRatio?: number;
	random?: () => number;
}

export interface PeerHealthMonitorOptions {
	now?: () => number;
	staleAfterMs?: number;
	offlineAfterMs?: number;
}

export interface PeerHealthState {
	peerId: string;
	status: 'healthy' | 'stale' | 'offline';
	lastSeen: number;
	lastPingAt?: number;
	lastPongAt?: number;
}

export interface PeerHealthEvents {
	'peer:healthy': (state: PeerHealthState) => void;
	'peer:stale': (state: PeerHealthState) => void;
	'peer:offline': (state: PeerHealthState) => void;
	'sync:error': (event: { peerId?: string; error: Error }) => void;
}

export const getReconnectDelay = (
	attempt: number,
	options: ReconnectBackoffOptions = {},
): number => {
	const initialDelayMs = options.initialDelayMs ?? 1000;
	const maxDelayMs = options.maxDelayMs ?? 30000;
	const jitterRatio = options.jitterRatio ?? 0;
	const baseDelay = Math.min(
		initialDelayMs * 2 ** Math.max(0, attempt),
		maxDelayMs,
	);
	if (jitterRatio <= 0) return baseDelay;

	const random = options.random ?? Math.random;
	const jitter = baseDelay * jitterRatio * random();
	return Math.min(Math.round(baseDelay + jitter), maxDelayMs);
};

export class PeerHealthMonitor extends EventEmitter {
	private peers = new Map<string, PeerHealthState>();
	private now: () => number;
	private staleAfterMs: number;
	private offlineAfterMs: number;

	constructor(options: PeerHealthMonitorOptions = {}) {
		super();
		this.now = options.now || (() => Date.now());
		this.staleAfterMs = options.staleAfterMs ?? 30000;
		this.offlineAfterMs = options.offlineAfterMs ?? 60000;
	}

	on<K extends keyof PeerHealthEvents>(
		eventName: K,
		listener: PeerHealthEvents[K],
	): this {
		return super.on(eventName, listener as (...args: unknown[]) => void);
	}

	off<K extends keyof PeerHealthEvents>(
		eventName: K,
		listener: PeerHealthEvents[K],
	): this {
		return super.off(eventName, listener as (...args: unknown[]) => void);
	}

	markConnected(peerId: string): PeerHealthState {
		return this.setStatus(peerId, 'healthy', {
			lastSeen: this.now(),
		});
	}

	markPing(peerId: string): PeerHealthState {
		const current = this.getOrCreate(peerId);
		return this.setStatus(peerId, current.status, {
			lastPingAt: this.now(),
		});
	}

	markPong(peerId: string): PeerHealthState {
		return this.setStatus(peerId, 'healthy', {
			lastSeen: this.now(),
			lastPongAt: this.now(),
		});
	}

	markOffline(peerId: string): PeerHealthState {
		return this.setStatus(peerId, 'offline', {
			lastSeen: this.getOrCreate(peerId).lastSeen,
		});
	}

	reportSyncError(peerId: string | undefined, error: Error): void {
		this.emit('sync:error', { peerId, error });
	}

	sweep(): PeerHealthState[] {
		const now = this.now();
		const changed: PeerHealthState[] = [];

		for (const state of this.peers.values()) {
			if (state.status === 'offline') continue;
			const age = now - state.lastSeen;
			if (age >= this.offlineAfterMs) {
				changed.push(this.setStatus(state.peerId, 'offline'));
			} else if (age >= this.staleAfterMs && state.status !== 'stale') {
				changed.push(this.setStatus(state.peerId, 'stale'));
			}
		}

		return changed;
	}

	get(peerId: string): PeerHealthState | undefined {
		const state = this.peers.get(peerId);
		return state ? { ...state } : undefined;
	}

	list(): PeerHealthState[] {
		return Array.from(this.peers.values()).map((state) => ({ ...state }));
	}

	private getOrCreate(peerId: string): PeerHealthState {
		const existing = this.peers.get(peerId);
		if (existing) return existing;
		const state: PeerHealthState = {
			peerId,
			status: 'healthy',
			lastSeen: this.now(),
		};
		this.peers.set(peerId, state);
		return state;
	}

	private setStatus(
		peerId: string,
		status: PeerHealthState['status'],
		patch: Partial<PeerHealthState> = {},
	): PeerHealthState {
		const previous = this.getOrCreate(peerId);
		const next: PeerHealthState = {
			...previous,
			...patch,
			peerId,
			status,
		};
		this.peers.set(peerId, next);

		if (previous.status !== next.status || status === 'healthy') {
			this.emit(`peer:${status}`, { ...next });
		}

		return { ...next };
	}
}

export const createPeerHealthMonitor = (
	options: PeerHealthMonitorOptions = {},
) => new PeerHealthMonitor(options);
