/**
 * Offline Intent Queue for PWA & P2P First-Connect Signaling.
 *
 * Enqueues P2P intents (such as initial peer connection requests or sync requests)
 * when offline or when signaling is unavailable, and processes/retries them
 * automatically when internet connectivity / signaling server connection is restored.
 */

export interface OfflineIntent {
  id: string;
  type: 'P2P_CONNECT' | 'SYNC_REQUEST' | 'CUSTOM';
  payload: Record<string, any>;
  timestamp: number;
  attempts: number;
}

const STORAGE_KEY = 'shelf_offline_intents_v1';
const MAX_ATTEMPTS = 5;

type Listener = (queue: OfflineIntent[]) => void;

class OfflineQueueManager {
  private queue: OfflineIntent[] = [];
  private listeners: Set<Listener> = new Set();
  private isProcessing = false;

  constructor() {
    this.loadQueue();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.processQueue();
      });
    }
  }

  private loadQueue(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.queue = JSON.parse(raw);
      }
    } catch {
      this.queue = [];
    }
  }

  private saveQueue(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (_e) {
      // Storage unavailable or quota exceeded
    }
    this.notify();
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('Secure random source unavailable');
  }

  public enqueue(type: OfflineIntent['type'], payload: Record<string, any>): OfflineIntent {
    const intent: OfflineIntent = {
      id: this.generateId(),
      type,
      payload,
      timestamp: Date.now(),
      attempts: 0,
    };

    // Avoid duplicate P2P_CONNECT requests for same peerId
    if (type === 'P2P_CONNECT' && payload.peerId) {
      const existing = this.queue.find((item) => item.type === 'P2P_CONNECT' && item.payload.peerId === payload.peerId);
      if (existing) {
        return existing;
      }
    }

    this.queue.push(intent);
    this.saveQueue();
    return intent;
  }

  public getQueue(): OfflineIntent[] {
    return [...this.queue];
  }

  public count(): number {
    return this.queue.length;
  }

  public remove(id: string): void {
    this.queue = this.queue.filter((item) => item.id !== id);
    this.saveQueue();
  }

  public clear(): void {
    this.queue = [];
    this.saveQueue();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getQueue());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const current = this.getQueue();
    this.listeners.forEach((fn) => {
      try {
        fn(current);
      } catch (_e) {
        // ignore subscriber errors
      }
    });
  }

  /**
   * Process queued intents using a custom processor or default P2P handler.
   */
  public async processQueue(
    processor?: (intent: OfflineIntent) => Promise<boolean>,
  ): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing || this.queue.length === 0) {
      return { processed: 0, failed: 0 };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { processed: 0, failed: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let failed = 0;

    const snapshot = [...this.queue];

    for (const intent of snapshot) {
      try {
        intent.attempts += 1;
        let success = false;

        if (processor) {
          success = await processor(intent);
        } else {
          // Default handler
          if (intent.type === 'P2P_CONNECT' && intent.payload.peerId) {
            const { p2pManager } = await import('p2p-mesh-core');
            p2pManager.connect(intent.payload.peerId);
            success = true;
          } else {
            success = true;
          }
        }

        if (success) {
          this.remove(intent.id);
          processed++;
        } else if (intent.attempts >= MAX_ATTEMPTS) {
          this.remove(intent.id);
          failed++;
        }
      } catch {
        if (intent.attempts >= MAX_ATTEMPTS) {
          this.remove(intent.id);
          failed++;
        }
      }
    }

    this.saveQueue();
    this.isProcessing = false;
    return { processed, failed };
  }
}

export const offlineQueue = new OfflineQueueManager();
