import { useRegisterSW } from 'virtual:pwa-register/react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';

const CURRENT_BUILD_ID = `${__APP_VERSION__}@${__COMMIT_HASH__}`;
const VERSION_ENDPOINT = '/version.json';

const UpdateNotification: React.FC = () => {
  const { t } = useI18n();
  const [showReload, setShowReload] = useState(false);
  const updateInProgressRef = useRef(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('Service Worker registrado correctamente');
      if (r) {
        window.setTimeout(() => r.update(), 3000);
        const intervalId = window.setInterval(() => r.update(), 60 * 60 * 1000); // Check for updates every 60 minutes
        window.addEventListener(
          'beforeunload',
          () => {
            window.clearInterval(intervalId);
          },
          { once: true },
        );
      }
    },
    onRegisterError(error) {
      console.log('Error al registrar Service Worker', error);
    },
    onNeedRefresh() {
      console.log('Nueva versión de Shelf disponible');
    },
  });

  useEffect(() => {
    const verifyRuntimeVersion = async () => {
      if (typeof window === 'undefined') return;

      try {
        const response = await fetch(`${VERSION_ENDPOINT}?t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });

        if (!response.ok) return;

        const payload = (await response.json()) as { buildId?: string };
        const remoteBuildId = payload?.buildId;

        if (!remoteBuildId) return;

        if (remoteBuildId === CURRENT_BUILD_ID) {
          updateInProgressRef.current = false;
          window.localStorage.setItem('shelf.lastSeenBuildId', remoteBuildId);
          return;
        }

        if (updateInProgressRef.current) return;
        updateInProgressRef.current = true;
        window.localStorage.setItem('shelf.lastSeenBuildId', remoteBuildId);
        setShowReload(true);
        setNeedRefresh(true);

        // Ask the browser to fetch the newest service worker immediately.
        void navigator.serviceWorker?.getRegistration?.().then((registration) => registration?.update());
      } catch (error) {
        console.warn('No se pudo verificar la version runtime', error);
      }
    };

    void verifyRuntimeVersion();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void verifyRuntimeVersion();
      }
    };

    const onFocus = () => void verifyRuntimeVersion();
    const onOnline = () => void verifyRuntimeVersion();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [setNeedRefresh]);

  useEffect(() => {
    if (offlineReady) {
      console.log('App lista para funcionar offline');
      setShowReload(false);
    }
    if (needRefresh) {
      setShowReload(true);
    }
  }, [offlineReady, needRefresh]);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setShowReload(false);
    updateInProgressRef.current = false;
  };

  const handleUpdate = () => {
    updateInProgressRef.current = true;
    updateServiceWorker(true);
  };

  if (!showReload) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[9999] max-w-md animate-slide-up">
      <div className="bg-[#1a1a1a] border-2 border-yellow-400 rounded-lg shadow-2xl p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="text-3xl">🔄</div>
          <div className="flex-1">
            <h4 className="font-bold text-[#F5F5DC] mb-1">{t('update.title')}</h4>
            <p className="text-sm text-[#F5F5DC]/80">{t('update.message')}</p>
          </div>
          <button
            onClick={close}
            className="text-[#F5F5DC]/60 hover:text-[#F5F5DC] transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleUpdate}
            className="w-full sm:flex-1 bg-yellow-400 text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-yellow-300 transition-all active:scale-95 text-sm"
          >
            {t('update.reload')}
          </button>
          <button
            onClick={close}
            className="w-full sm:w-auto px-4 py-2 text-[#F5F5DC]/80 hover:text-[#F5F5DC] transition-colors text-sm"
          >
            {t('update.later')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;
