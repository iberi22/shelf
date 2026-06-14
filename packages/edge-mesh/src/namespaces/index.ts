import type { NamespacePartition } from '../types';

export class NamespacePartitionManager {
	private partitions = new Map<string, NamespacePartition>();

	upsert(partition: NamespacePartition): NamespacePartition {
		const key = this.key(partition.namespace, partition.id);
		this.partitions.set(key, partition);
		return partition;
	}

	remove(namespace: string, id: string): void {
		this.partitions.delete(this.key(namespace, id));
	}

	get(namespace: string, id: string): NamespacePartition | undefined {
		return this.partitions.get(this.key(namespace, id));
	}

	list(namespace?: string): NamespacePartition[] {
		return Array.from(this.partitions.values())
			.filter((partition) => !namespace || partition.namespace === namespace)
			.sort((left, right) => left.label.localeCompare(right.label));
	}

	resolveScopedNamespace(namespace: string, partitionId?: string): string {
		return partitionId ? `${namespace}/${partitionId}` : namespace;
	}

	private key(namespace: string, id: string): string {
		return `${namespace}:${id}`;
	}
}

export const createNamespacePartitionManager = () =>
	new NamespacePartitionManager();
