import { beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineQueue } from './offlineQueue';

describe('OfflineQueueManager', () => {
  beforeEach(() => {
    localStorage.clear();
    offlineQueue.clear();
    vi.restoreAllMocks();
  });

  it('enqueues intent and persists in localStorage', () => {
    const intent = offlineQueue.enqueue('P2P_CONNECT', { peerId: 'peer-123' });
    expect(intent.id).toBeDefined();
    expect(intent.type).toBe('P2P_CONNECT');
    expect(intent.payload).toEqual({ peerId: 'peer-123' });

    expect(offlineQueue.count()).toBe(1);

    const saved = localStorage.getItem('shelf_offline_intents_v1');
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved || '[]')).toHaveLength(1);
  });

  it('deduplicates P2P_CONNECT intents with the same peerId', () => {
    const intent1 = offlineQueue.enqueue('P2P_CONNECT', { peerId: 'peer-abc' });
    const intent2 = offlineQueue.enqueue('P2P_CONNECT', { peerId: 'peer-abc' });

    expect(intent1.id).toBe(intent2.id);
    expect(offlineQueue.count()).toBe(1);
  });

  it('removes intent by id and clears queue', () => {
    const intent = offlineQueue.enqueue('SYNC_REQUEST', { collection: 'products' });
    expect(offlineQueue.count()).toBe(1);

    offlineQueue.remove(intent.id);
    expect(offlineQueue.count()).toBe(0);

    offlineQueue.enqueue('SYNC_REQUEST', { collection: 'sales' });
    offlineQueue.clear();
    expect(offlineQueue.count()).toBe(0);
  });

  it('notifies subscribers when queue changes', () => {
    const subscriber = vi.fn();
    const unsub = offlineQueue.subscribe(subscriber);

    expect(subscriber).toHaveBeenCalledWith([]);

    offlineQueue.enqueue('CUSTOM', { test: 1 });
    expect(subscriber).toHaveBeenCalledTimes(2);

    unsub();
    offlineQueue.enqueue('CUSTOM', { test: 2 });
    expect(subscriber).toHaveBeenCalledTimes(2);
  });

  it('processes queued intents with custom processor', async () => {
    offlineQueue.enqueue('P2P_CONNECT', { peerId: 'node-1' });
    offlineQueue.enqueue('SYNC_REQUEST', { collection: 'products' });

    const processor = vi.fn().mockResolvedValue(true);
    const result = await offlineQueue.processQueue(processor);

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
    expect(processor).toHaveBeenCalledTimes(2);
    expect(offlineQueue.count()).toBe(0);
  });
});
