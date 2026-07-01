export interface OpLogEntry {
	opId: string;
	namespace: string;
	timestamp: number;
	data: unknown;
}

export class OpLog {
	private entries = new Map<string, OpLogEntry>();

	append(entry: OpLogEntry): boolean {
		if (this.entries.has(entry.opId)) {
			return false;
		}
		this.entries.set(entry.opId, entry);
		return true;
	}

	has(opId: string): boolean {
		return this.entries.has(opId);
	}

	getEntries(namespace?: string, since?: number): OpLogEntry[] {
		return Array.from(this.entries.values())
			.filter((entry) => {
				const nsMatch = !namespace || entry.namespace === namespace;
				const sinceMatch = !since || entry.timestamp >= since;
				return nsMatch && sinceMatch;
			})
			.sort((left, right) => left.timestamp - right.timestamp);
	}

	compact(before: number): number {
		let removed = 0;
		for (const [opId, entry] of this.entries.entries()) {
			if (entry.timestamp < before) {
				this.entries.delete(opId);
				removed += 1;
			}
		}
		return removed;
	}
}

export const createOpLog = () => new OpLog();
