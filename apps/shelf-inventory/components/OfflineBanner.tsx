import { AlertCircle, Clock, Info, RefreshCw, WifiOff, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { type OfflineIntent, offlineQueue } from '../lib/offlineQueue';

export const OfflineBanner: React.FC = () => {
  const { t } = useI18n();
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [queuedIntents, setQueuedIntents] = useState<OfflineIntent[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsDismissed(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsDismissed(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = offlineQueue.subscribe((queue) => {
      setQueuedIntents(queue);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    await offlineQueue.processQueue();
    setIsRetrying(false);
  };

  // Only render if offline or if there are pending queued intents
  if ((isOnline && queuedIntents.length === 0) || isDismissed) {
    return null;
  }

  return (
    <aside
      aria-label={t('common.offlineBanner') || 'Estado de conexión e intents offline'}
      role="status"
      aria-live="polite"
      className="w-full bg-amber-950/90 border-b border-amber-500/40 text-amber-100 px-4 py-3 shadow-md backdrop-blur-md transition-all duration-300 z-40"
      data-testid="offline-banner"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5 flex-1">
          <div className="p-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 shrink-0 text-amber-400">
            <WifiOff size={18} aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 font-semibold text-amber-200">
              <span>{!isOnline ? 'Modo Offline-First Activo' : 'Acciones P2P Encoladas'}</span>
              {queuedIntents.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[11px] text-amber-300">
                  <Clock size={11} aria-hidden="true" />
                  {queuedIntents.length} pendiente{queuedIntents.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="text-[12px] text-amber-200/80 mt-0.5 leading-snug">
              {!isOnline
                ? 'Puedes seguir registrando ventas e inventario localmente. La primera conexión P2P requiere señalización online inicial por diseño y reintentará automáticamente al reconectar.'
                : 'Hay solicitudes de conexión o sincronización P2P encoladas pendientes de confirmación.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium text-xs transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Info size={13} aria-hidden="true" />
            <span>{showDetails ? 'Ocultar info' : 'Más detalles'}</span>
          </button>

          {isOnline && queuedIntents.length > 0 && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={isRetrying ? 'animate-spin' : ''} aria-hidden="true" />
              <span>Reintentar</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            aria-label="Cerrar banner offline"
            className="p-1 rounded-lg hover:bg-amber-500/20 text-amber-300/80 hover:text-amber-100 transition-colors cursor-pointer"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-amber-500/20 text-[11px] sm:text-xs text-amber-200/90 space-y-2 animate-fadeIn">
          <div className="flex items-start gap-2 bg-amber-900/40 p-2.5 rounded-lg border border-amber-500/30">
            <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="block text-amber-300">¿Por qué la primera conexión P2P requiere internet?</strong>
              WebRTC requiere un servidor de señalización inicial (PeerJS STUN/TURN) para intercambiar candidatos ICE y
              claves de handshake. Una vez establecida la malla P2P, la sincronización de inventario continuará vía LAN
              o WebRTC directo sin necesidad de servidor central.
            </div>
          </div>

          {queuedIntents.length > 0 && (
            <div className="mt-2">
              <span className="font-semibold text-amber-300">Cola de Intents Offline:</span>
              <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                {queuedIntents.map((intent) => (
                  <li
                    key={intent.id}
                    className="flex items-center justify-between bg-stone-900/60 px-2.5 py-1 rounded border border-amber-500/20 font-mono text-[10px]"
                  >
                    <span>
                      [{intent.type}] {intent.payload.peerId ? `Node: ${intent.payload.peerId}` : 'Sync intent'}
                    </span>
                    <span className="text-amber-400/80">Reintentos: {intent.attempts}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

export default OfflineBanner;
