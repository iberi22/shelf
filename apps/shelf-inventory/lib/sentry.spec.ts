import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sentryMock, browserMock } = vi.hoisted(() => ({
  sentryMock: {
    init: vi.fn(),
    browserTracingIntegration: vi.fn(() => ({ name: 'browserTracing' })),
    replayIntegration: vi.fn(() => ({ name: 'replay' })),
  },
  browserMock: {
    makeBrowserOfflineTransport: vi.fn(() => 'offline-transport'),
    makeFetchTransport: vi.fn(() => 'fetch-transport'),
  },
}));

vi.mock('@sentry/react', () => sentryMock);
vi.mock('@sentry/browser', () => browserMock);

import { initSentry } from './sentry';

describe('initSentry', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  it('does nothing at all while running under MODE=test', () => {
    vi.stubEnv('MODE', 'test');
    vi.stubEnv('VITE_SENTRY_DSN', 'https://real@ingest.us.sentry.io/1');
    initSentry();
    expect(sentryMock.init).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs and skips initialization when no DSN is configured', () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_SENTRY_DSN', '');
    initSentry();
    expect(sentryMock.init).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No valid DSN'));
  });

  it('skips initialization for the example placeholder DSN', () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@sentry.example.com/1');
    initSentry();
    expect(sentryMock.init).not.toHaveBeenCalled();
  });

  it('initialises Sentry with tracing, replay and the offline transport', () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc123@ingest.us.sentry.io/1234567');
    initSentry();
    expect(sentryMock.init).toHaveBeenCalledTimes(1);
    expect(sentryMock.browserTracingIntegration).toHaveBeenCalled();
    expect(sentryMock.replayIntegration).toHaveBeenCalled();
    expect(browserMock.makeBrowserOfflineTransport).toHaveBeenCalledWith(
      browserMock.makeFetchTransport,
    );
    const [options] = sentryMock.init.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(options.dsn).toBe('https://abc123@ingest.us.sentry.io/1234567');
    expect(options.tracesSampleRate).toBe(1.0);
  });
});