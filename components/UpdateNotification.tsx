import { useRegisterSW } from 'virtual:pwa-register/react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';

const UpdateNotification: React.FC = () => {
  const { t } = useI18n();
  const [showReload, setShowReload] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('Service Worker registrado correctamente');
      // Verificar actualizaciones cada hora
      r &&
        setInterval(
          () => {
            r.update();
          },
          60 * 60 * 1000,
        ); // 1 hora
    },
    onRegisterError(error) {
      console.log('Error al registrar Service Worker', error);
    },
  });

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
  };

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  if (!showReload) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-md animate-slide-up">
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

        <div className="flex gap-2">
          <button
            onClick={handleUpdate}
            className="flex-1 bg-yellow-400 text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-yellow-300 transition-all active:scale-95"
          >
            {t('update.reload')}
          </button>
          <button onClick={close} className="px-4 py-2 text-[#F5F5DC]/80 hover:text-[#F5F5DC] transition-colors">
            {t('update.later')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;
