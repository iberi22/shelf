import type { MeshMessageEnvelope } from '../types';

export const PROTOCOL_VERSION = '1.0.0';

export function createEnvelope(
  sourcePeerId: string,
  type: string,
  payload: any,
  targetPeerId?: string
): MeshMessageEnvelope {
  const id = (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID)
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

  return {
    id,
    version: PROTOCOL_VERSION,
    sourcePeerId,
    targetPeerId,
    timestamp: Date.now(),
    type,
    payload,
  };
}

export class MessageDeduplicator {
  private seenIds: Set<string> = new Set();
  private maxItems: number;

  constructor(maxItems = 1000) {
    this.maxItems = maxItems;
  }

  isDuplicate(id: string): boolean {
    if (this.seenIds.has(id)) {
      return true;
    }
    this.seenIds.add(id);

    if (this.seenIds.size > this.maxItems) {
      // Basic cleanup: remove oldest items if set gets too large
      const iterator = this.seenIds.values();
      for (let i = 0; i < Math.ceil(this.maxItems / 10); i++) {
        const value = iterator.next().value;
        if (value) this.seenIds.delete(value);
      }
    }

    return false;
  }
}
