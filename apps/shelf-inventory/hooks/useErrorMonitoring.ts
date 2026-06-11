import { useCallback, useEffect } from 'react';

/**
 * Hook to manage error monitoring and reporting.
 * In a production environment, this would integrate with Sentry or Firebase Crashlytics.
 */
export const useErrorMonitoring = () => {
  const reportError = useCallback((error: Error, context?: Record<string, any>) => {
    console.error('[Error Monitoring]:', error, context);

    // Future integration: Sentry.captureException(error, { extra: context });

    // For now, we can also store errors in a local log for debugging
    const errorLog = JSON.parse(localStorage.getItem('shelf_error_log') || '[]');
    errorLog.push({
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem('shelf_error_log', JSON.stringify(errorLog.slice(-50))); // Keep last 50 errors
  }, []);

  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      reportError(event.error || new Error(event.message), { type: 'global' });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)), {
        type: 'unhandled_rejection',
      });
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [reportError]);

  return { reportError };
};

export default useErrorMonitoring;
