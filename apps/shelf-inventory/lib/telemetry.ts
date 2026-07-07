type TelemetryEvent = {
  name: string;
  params?: Record<string, any>;
  timestamp: number;
};

const QUEUE_KEY = 'shelf_telemetry_queue';

export class TelemetryService {
  private queue: TelemetryEvent[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadQueue();
      window.addEventListener('online', () => this.flushQueue());
      // Try to flush after a short delay to ensure gtag is initialized
      setTimeout(() => {
        if (navigator.onLine) {
          this.flushQueue();
        }
      }, 3000);
    }
  }

  private loadQueue() {
    try {
      const saved = localStorage.getItem(QUEUE_KEY);
      if (saved) {
        this.queue = JSON.parse(saved);
      }
    } catch (e) {
      console.error('[Telemetry] Failed to load queue:', e);
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue.slice(-100))); // Keep last 100 events
    } catch (e) {
      console.error('[Telemetry] Failed to save queue:', e);
    }
  }

  /**
   * Tracks an event. Enqueues if offline or gtag is not available.
   */
  trackEvent(name: string, params?: Record<string, any>) {
    const event: TelemetryEvent = {
      name,
      params,
      timestamp: Date.now(),
    };

    if (this.canSendNow()) {
      this.sendToGA(event);
    } else {
      console.log(`[Telemetry] Offline or gtag missing, enqueuing event: ${name}`);
      this.queue.push(event);
      this.saveQueue();
    }
  }

  private canSendNow(): boolean {
    return typeof window !== 'undefined' && navigator.onLine && typeof (window as any).gtag === 'function';
  }

  private sendToGA(event: TelemetryEvent) {
    if (typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', event.name, {
        ...event.params,
        original_timestamp: event.timestamp,
        was_offline: event.timestamp !== Date.now() ? 'true' : 'false',
      });
    }
  }

  /**
   * Flushes the offline queue.
   */
  flushQueue() {
    if (!this.canSendNow() || this.queue.length === 0) return;

    console.log(`[Telemetry] Flushing ${this.queue.length} events...`);
    const eventsToFlush = [...this.queue];
    this.queue = [];
    this.saveQueue();

    for (const event of eventsToFlush) {
      this.sendToGA(event);
    }
  }

  /**
   * Internal method for testing
   */
  __reset() {
    this.queue = [];
    this.loadQueue();
  }
}

export const telemetry = new TelemetryService();
export default telemetry;
