import type {
	FailoverCandidate,
	PeerPresenceEvent,
	PeerPresenceStatus,
} from '../types';

export interface PresenceTimelineOptions {
	idFactory?: () => string;
	now?: () => number;
}

export class PresenceTimeline {
	private events: PeerPresenceEvent[] = [];
	private now: () => number;
	private idFactory: () => string;

	constructor(options: PresenceTimelineOptions = {}) {
		this.now = options.now || (() => Date.now());
		this.idFactory =
			options.idFactory ||
			(() => {
				if (globalThis.crypto?.randomUUID)
					return globalThis.crypto.randomUUID();
				return `presence-${this.now()}-${Math.random().toString(36).slice(2)}`;
			});
	}

	record(
		peerId: string,
		status: PeerPresenceStatus,
		metadata?: Record<string, unknown>,
	): PeerPresenceEvent {
		const event: PeerPresenceEvent = {
			id: this.idFactory(),
			peerId,
			status,
			timestamp: this.now(),
			metadata,
		};
		this.events.push(event);
		return event;
	}

	import(events: PeerPresenceEvent[]): void {
		const byId = new Map(this.events.map((event) => [event.id, event]));
		for (const event of events) byId.set(event.id, event);
		this.events = Array.from(byId.values()).sort(
			(left, right) => left.timestamp - right.timestamp,
		);
	}

	getEvents(peerId?: string): PeerPresenceEvent[] {
		const events = peerId
			? this.events.filter((event) => event.peerId === peerId)
			: this.events;
		return [...events].sort((left, right) => left.timestamp - right.timestamp);
	}

	getLatest(peerId: string): PeerPresenceEvent | undefined {
		return this.getEvents(peerId).at(-1);
	}

	proposeFailover(options: {
		authorityPeerId: string;
		staleAfterMs: number;
		eligiblePeerIds?: string[];
		verifiedOnly?: boolean;
	}): FailoverCandidate | null {
		const now = this.now();
		const authority = this.getLatest(options.authorityPeerId);
		const authorityIsStale =
			!authority ||
			authority.status === 'offline' ||
			authority.status === 'disconnected' ||
			now - authority.timestamp > options.staleAfterMs;

		if (!authorityIsStale) return null;

		const eligible = new Set(options.eligiblePeerIds || []);
		const peerIds = Array.from(
			new Set(this.events.map((event) => event.peerId)),
		)
			.filter((peerId) => peerId !== options.authorityPeerId)
			.filter((peerId) => eligible.size === 0 || eligible.has(peerId));

		const candidates = peerIds
			.map((peerId): FailoverCandidate | null => {
				const latest = this.getLatest(peerId);
				if (!latest) return null;
				if (options.verifiedOnly && latest.status !== 'verified') return null;
				if (latest.status === 'offline' || latest.status === 'disconnected') {
					return null;
				}
				const firstSeen =
					this.getEvents(peerId)[0]?.timestamp || latest.timestamp;
				const verifiedBonus = latest.status === 'verified' ? 1_000_000 : 0;
				return {
					peerId,
					score: verifiedBonus - firstSeen,
					reason: `authority ${options.authorityPeerId} stale; ${peerId} is ${latest.status}`,
				};
			})
			.filter((candidate): candidate is FailoverCandidate => Boolean(candidate))
			.sort(
				(left, right) =>
					right.score - left.score || left.peerId.localeCompare(right.peerId),
			);

		return candidates[0] || null;
	}
}

export const createPresenceTimeline = (options: PresenceTimelineOptions = {}) =>
	new PresenceTimeline(options);
