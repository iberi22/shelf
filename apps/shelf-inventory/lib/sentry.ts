import { makeBrowserOfflineTransport, makeFetchTransport } from '@sentry/browser';
import * as Sentry from '@sentry/react';

/**
 * Initialize Sentry for Error Monitoring with Offline Queue support.
 * The OfflineTransport ensures that any errors caught while the app
 * has no internet connection will be persisted to IndexedDB and
 * dispatched when connectivity is restored.
 */
export const initSentry = () => {
  if (import.meta.env.MODE === 'test') {
    return; // Don't init during unit tests
  }

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN || 'https://public@sentry.example.com/1',
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    // Tracing
    tracesSampleRate: 1.0,
    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Enable offline queuing via IndexedDB
    transport: makeBrowserOfflineTransport(makeFetchTransport),
  });
};
