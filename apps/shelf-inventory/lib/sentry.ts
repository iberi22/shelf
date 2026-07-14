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

  const dsn = import.meta.env.VITE_SENTRY_DSN;

  // No inicializar si no hay DSN o si es el de ejemplo para evitar spam en consola
  if (!dsn || dsn.includes('sentry.example.com')) {
    console.log('[Sentry] Disabled (No valid DSN configured)');
    return;
  }

  Sentry.init({
    dsn,
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
