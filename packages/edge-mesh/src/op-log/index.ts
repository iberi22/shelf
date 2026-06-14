import type { CrdtSyncEnvelope } from '../types';

export interface OpLogEntry {
	id: string;
	opId: string;
	namespace: string;
	sourcePeerId: string;
	timestamp: number;
	envelopeType: CrdtSyncEnvelope['type'];
}

export class OpLog {
	private entries = new Map<string, OpLogEntry>();

	append(envelope: CrdtSyncEnvelope): OpLogEntry | null {
		if (this.entries.has(envelope.opId)) return null;
		const entry: OpLogEntry = {
			id: envelope.id,
			opId: envelope.opId,
			namespace: envelope.namespace,
			sourcePeerId: envelope.sourcePeerId,
			timestamp: envelope.timestamp,
			envelopeType: envelope.type,
		};
		this.entries.set(entry.opId, entry);
		return entry;
	}

	has(opId: string): boolean {
		return this.entries.has(opId);
	}

	list(namespace?: string): OpLogEntry[] {
		return Array.from(this.entries.values())
			.filter((entry) => !namespace || entry.namespace === namespace)
			.sort((left, right) => left.timestamp - right.timestamp);
	}

	compactBefore(timestamp: number): number {
		let removed = 0;
		for (const [opId, entry] of this.entries.entries()) {
			if (entry.timestamp < timestamp) {
				this.entries.delete(opId);
				removed += 1;
			}
		}
		return removed;
	}
}

export const createOpLog = () => new OpLog();
