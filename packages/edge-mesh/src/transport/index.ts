import { EventEmitter } from 'events';
import type {
	MeshMessageEnvelope,
	MeshTransport,
	MeshTransportEvents,
} from '../types';

export abstract class BaseTransport
	extends EventEmitter
	implements MeshTransport
{
	abstract start(peerId: string): Promise<void>;
	abstract stop(): Promise<void>;
	abstract connect(peerId: string): Promise<void>;
	abstract disconnect(peerId: string): Promise<void>;
	abstract send(
		targetPeerId: string,
		envelope: MeshMessageEnvelope,
	): Promise<void>;
	abstract broadcast(envelope: MeshMessageEnvelope): Promise<void>;

	on<K extends keyof MeshTransportEvents>(
		event: K,
		listener: MeshTransportEvents[K],
	): this {
		return super.on(event, listener);
	}

	off<K extends keyof MeshTransportEvents>(
		event: K,
		listener: MeshTransportEvents[K],
	): this {
		return super.off(event, listener);
	}

	emit<K extends keyof MeshTransportEvents>(
		event: K,
		...args: Parameters<MeshTransportEvents[K]>
	): boolean {
		return super.emit(event, ...args);
	}
}
