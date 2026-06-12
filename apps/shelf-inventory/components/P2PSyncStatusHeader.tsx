import { Check, Copy, Layers, Sparkles, Wifi, WifiOff } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import ProductConflictResolver, { detectProductConflicts } from './ProductConflictResolver';

const P2PSyncStatusHeader: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();

  const [copied, setCopied] = useState(false);
  const [isResolverOpen, setIsResolverOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'disconnected'>('disconnected');
  const [isExpanded, setIsExpanded] = useState(false);

  const verifiedPeers = useMemo(() => {
    return state.peers.filter((p) => p.status === 'verified');
  }, [state.peers]);

  // Compute product conflicts
  const conflicts = useMemo(() => detectProductConflicts(state.products), [state.products]);

  // Determine sync status based on verified peers
  useEffect(() => {
    if (verifiedPeers.length === 0) {
      setSyncStatus('disconnected');
    } else {
      // Simulate brief syncing when state updates, then transition to synced
      setSyncStatus('syncing');
      const timer = setTimeout(() => {
        setSyncStatus('synced');
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [verifiedPeers.length]);

  const handleCopyPeerId = () => {
    if (!state.localPeerId) return;
    navigator.clipboard.writeText(state.localPeerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAutoMergeAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    conflicts.forEach((group) => {
      // Default survivor: latest updatedAt product
      const survivor = group.products.reduce((latest, current) => {
        const latestTime = new Date(latest.updatedAt || 0).getTime();
        const currentTime = new Date(current.updatedAt || 0).getTime();
        return currentTime > latestTime ? current : latest;
      }, group.products[0]);

      const totalQuantity = group.products.reduce((acc, p) => acc + (p.quantity || 0), 0);

      dispatch({
        type: 'UPDATE_PRODUCT',
        payload: {
          ...survivor,
          quantity: totalQuantity,
          updatedAt: new Date().toISOString(),
          updatedBy: state.localPeerId || 'local',
        },
      });

      group.products.forEach((p) => {
        if (p.id !== survivor.id) {
          dispatch({ type: 'DELETE_PRODUCT', payload: p.id });
        }
      });
    });
  };

  return (
    <div className="w-full mb-6 flex flex-col items-end gap-3">
      {/* Compact Status Indicator Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 shadow-md border focus:outline-none active:scale-95 cursor-pointer ${
          syncStatus === 'synced'
            ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
            : syncStatus === 'syncing'
              ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 shadow-[0_0_12px_rgba(234,179,8,0.15)] animate-pulse'
              : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
        }`}
        title={`${t('p2pSync.topBar.status') || 'Estado'}: ${
          syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Disconnected'
        }`}
      >
        {syncStatus === 'disconnected' ? (
          <WifiOff size={18} />
        ) : (
          <Wifi size={18} className={syncStatus === 'syncing' ? 'animate-pulse' : ''} />
        )}

        {/* Pulsing indicator dot */}
        <span
          className={`absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-[#1a1a1a] ${
            syncStatus === 'synced'
              ? 'bg-green-500 animate-pulse'
              : syncStatus === 'syncing'
                ? 'bg-blue-400 animate-ping'
                : 'bg-red-400'
          }`}
        />

        {/* Conflict Badge for Admin */}
        {state.role === 'admin' && conflicts.length > 0 && (
          <span className="absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-[9px] font-bold text-black ring-1 ring-black animate-bounce">
            {conflicts.length}
          </span>
        )}
      </button>

      {/* Expanded Stats & Details Panel */}
      {isExpanded && (
        <div className="w-full mt-1 animate-fadeIn transition-all duration-300 space-y-3">
          {/* Premium Glassmorphism Status Bar */}
          <div className="relative overflow-hidden rounded-xl border border-[#F5F5DC]/25 bg-[#1a1a1a]/85 backdrop-blur-md px-4 py-3 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
            {/* Connection status section */}
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                {syncStatus === 'disconnected' ? (
                  <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-500">
                    <WifiOff size={18} />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/25 flex items-center justify-center text-green-400">
                    <Wifi size={18} className={syncStatus === 'syncing' ? 'animate-pulse' : ''} />
                  </div>
                )}
                {/* Status pulsing dot */}
                <span
                  className={`absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-[#1a1a1a] ${
                    syncStatus === 'synced'
                      ? 'bg-green-500 animate-pulse'
                      : syncStatus === 'syncing'
                        ? 'bg-blue-400 animate-ping'
                        : 'bg-red-400'
                  }`}
                />
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#F5F5DC]/55 font-semibold uppercase tracking-wider">
                    {t('p2pSync.topBar.status') || 'Estado'}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      syncStatus === 'synced'
                        ? 'text-green-400'
                        : syncStatus === 'syncing'
                          ? 'text-blue-400'
                          : 'text-red-400'
                    }`}
                  >
                    {syncStatus === 'synced'
                      ? t('p2pSync.topBar.synced') || 'Sincronizado'
                      : syncStatus === 'syncing'
                        ? t('p2pSync.topBar.syncing') || 'Sincronizando...'
                        : t('p2pSync.topBar.disconnected') || 'Desconectado'}
                  </span>
                </div>
                {state.localPeerId ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-[#F5F5DC]/50 font-mono select-all truncate max-w-[200px] sm:max-w-xs">
                      {t('p2pSync.topBar.localNode') || 'Nodo Local'}: {state.localPeerId}
                    </span>
                    <button
                      onClick={handleCopyPeerId}
                      className="p-1 text-[#F5F5DC]/60 hover:text-[#F5F5DC] hover:bg-white/5 rounded transition-colors"
                      title={t('p2pSync.topBar.copyId') || 'Copiar ID'}
                    >
                      {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-[#F5F5DC]/30 mt-0.5 animate-pulse">Initializing P2P node...</span>
                )}
              </div>
            </div>

            {/* Stats indicators */}
            <div className="flex items-center flex-wrap justify-center gap-4 sm:gap-6 text-xs text-[#F5F5DC]/80">
              <div className="px-3 py-1.5 bg-[#121212] rounded-lg border border-[#F5F5DC]/10 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <span>
                  {t('p2pSync.topBar.connectedNodes') || 'Dispositivos Conectados'}:{' '}
                  <strong className="text-yellow-400">{verifiedPeers.length}</strong>
                </span>
              </div>

              <div className="px-3 py-1.5 bg-[#121212] rounded-lg border border-[#F5F5DC]/10 capitalize">
                <span>
                  {t('p2pSync.roleLabel') || 'Rol'}: <strong className="text-yellow-400">{state.role}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Admin duplicate conflict alert */}
          {state.role === 'admin' && conflicts.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-yellow-500/10 border border-yellow-500/35 rounded-xl text-yellow-400 shadow-md">
              <div className="flex items-center gap-2.5 text-center sm:text-left">
                <Layers className="animate-bounce shrink-0" size={18} />
                <span className="text-xs sm:text-sm font-semibold">
                  {t('p2pSync.topBar.conflictsFound', { count: conflicts.length }) ||
                    `⚠️ Se detectaron ${conflicts.length} conflictos de productos duplicados.`}
                </span>
              </div>
              <div className="flex gap-2 w-full sm:w-auto shrink-0">
                <button
                  onClick={handleAutoMergeAll}
                  className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-yellow-500/20 border border-yellow-500/40 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 active:scale-95"
                >
                  <Sparkles size={13} />
                  {t('p2pSync.topBar.autoMerge') || 'Auto-fusionar'}
                </button>
                <button
                  onClick={() => setIsResolverOpen(true)}
                  className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-[#1a1a1a] rounded-lg text-xs font-bold transition-colors active:scale-95"
                >
                  {t('p2pSync.topBar.resolve') || 'Resolver'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Conflict Resolver Modal */}
      <ProductConflictResolver isOpen={isResolverOpen} onClose={() => setIsResolverOpen(false)} />
    </div>
  );
};

export default P2PSyncStatusHeader;
