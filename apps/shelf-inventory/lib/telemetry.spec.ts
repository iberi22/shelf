import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal browser mocks for environment-independent testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = localStorageMock;
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = {};
}

// Ensure onLine is defined for spyOn
Object.defineProperty(navigator, 'onLine', {
  get: () => true,
  configurable: true,
});

import { telemetry } from './telemetry';

describe('TelemetryService', () => {
  const QUEUE_KEY = 'shelf_telemetry_queue';

  beforeEach(() => {
    localStorage.clear();
    telemetry.__reset();
    vi.useFakeTimers();
    // Mock gtag
    (window as any).gtag = vi.fn();
    // Mock navigator.onLine
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should track an event immediately when online and gtag is available', () => {
    telemetry.trackEvent('test_event', { foo: 'bar' });

    expect((window as any).gtag).toHaveBeenCalledWith(
      'event',
      'test_event',
      expect.objectContaining({
        foo: 'bar',
        was_offline: 'false',
      }),
    );
  });

  it('should enqueue event when offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    telemetry.trackEvent('offline_event', { foo: 'bar' });

    expect((window as any).gtag).not.toHaveBeenCalled();

    const savedQueue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    expect(savedQueue).toHaveLength(1);
    expect(savedQueue[0].name).toBe('offline_event');
  });

  it('should flush queue manually', async () => {
    // Start offline
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const now = Date.now();
    vi.setSystemTime(now);
    telemetry.trackEvent('event_1');

    vi.setSystemTime(now + 1000);
    telemetry.trackEvent('event_2');

    expect((window as any).gtag).not.toHaveBeenCalled();

    // Go online
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    // Also ensure gtag is present
    (window as any).gtag = vi.fn();

    vi.setSystemTime(now + 2000);
    telemetry.flushQueue();

    expect((window as any).gtag).toHaveBeenCalledTimes(2);
    expect((window as any).gtag).toHaveBeenCalledWith(
      'event',
      'event_1',
      expect.objectContaining({ was_offline: 'true' }),
    );
    expect((window as any).gtag).toHaveBeenCalledWith(
      'event',
      'event_2',
      expect.objectContaining({ was_offline: 'true' }),
    );

    expect(localStorage.getItem(QUEUE_KEY)).toBe('[]');
  });

  it('should enqueue if gtag is missing even if online', () => {
    delete (window as any).gtag;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    telemetry.trackEvent('no_gtag_event');

    const savedQueue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    expect(savedQueue).toHaveLength(1);
  });
});
