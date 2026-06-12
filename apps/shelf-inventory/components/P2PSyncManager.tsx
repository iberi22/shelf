import { Info, QrCode, Settings, X } from 'lucide-react';
import { dbSync, p2pManager, type SyncMessage } from 'p2p-mesh-core';
import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { isBiometricsSupported } from '../lib/webauthn';
import QRScannerModal from './QRScannerModal';

const P2PSyncManager: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [manualPeerId, setManualPeerId] = useState('');
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [showPermissions, setShowPermissions] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showMyQrModal, setShowMyQrModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showConfirmConnectModal, setShowConfirmConnectModal] = useState(false);
  const [pendingPeerId, setPendingPeerId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'vendedor' | 'custom'>('vendedor');
  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, boolean>>({
    canViewProducts: true,
    canEditProducts: true,
    canViewSales: true,
    canEditSales: true,
    canViewClients: true,
    canEditClients: true,
    canViewSuppliers: false,
    canEditSuppliers: false,
    canViewPurchaseOrders: false,
    canEditPurchaseOrders: false,
    canViewReports: false,
    canViewArqueo: false,
    canViewDashboard: false,
  });
  const [pendingConfigs, setPendingConfigs] = useState<
    Record<string, { role: 'admin' | 'collaborator'; permissions: any }>
  >({});
  const { t } = useI18n();

  const prevStateRef = useRef(state);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    isBiometricsSupported().then(setIsBiometricAvailable);
    p2pManager.init();

    const handleMessage = async (message: SyncMessage, fromPeerId: string) => {
      switch (message.type) {
        case 'STATE_UPDATE':
          setSyncProgress((prev) => Math.min(prev + 50, 100));
          dispatch({ type: 'SYNC_STATE', payload: message.payload as Partial<typeof state> });
          setTimeout(() => setSyncProgress(100), 500);
          break;
        case 'REQUEST_FULL_STATE': {
          const current = stateRef.current;
          const stateSnapshot = {
            products: current.products,
            sales: current.sales,
            clients: current.clients,
            suppliers: current.suppliers,
            purchaseOrders: current.purchaseOrders,
            auditLogs: current.auditLogs,
            arqueoSessions: current.arqueoSessions,
            ocrResults: current.ocrResults,
            permissions: current.permissions,
          };
          p2pManager.sendTo(fromPeerId, {
            type: 'STATE_UPDATE',
            payload: stateSnapshot,
          });
          break;
        }
        case 'PROMOTE_ADMIN': {
          const sender = stateRef.current.peers.find((p) => p.id === fromPeerId);
          if (sender?.role === 'admin' || sender?.isMaster) {
            if (message.payload.targetPeerId === p2pManager.localPeerId) {
              dispatch({ type: 'SET_ROLE', payload: 'admin' });
            }
          }
          break;
        }
        case 'UPDATE_PEER_PERMISSIONS': {
          const sender = stateRef.current.peers.find((p) => p.id === fromPeerId);
          if (sender?.role === 'admin' || sender?.isMaster) {
            dispatch({ type: 'UPDATE_PEER_PERMISSIONS', payload: message.payload });
          }
          break;
        }
      }
    };

    p2pManager.onMessage(handleMessage);

    p2pManager.onConnectionChange((peers) => {
      dispatch({ type: 'UPDATE_PEERS', payload: peers });
      if (peers.length > 0) setSyncProgress(100);
    });

    const interval = setInterval(() => {
      if (p2pManager.localPeerId) {
        dispatch({ type: 'SET_LOCAL_PEER_ID', payload: p2pManager.localPeerId });
        clearInterval(interval);
      }
    }, 1000);

    return () => {
      // Cleanup interval if component unmounts before it fires
      clearInterval(interval);
      // NOTE: For a full fix, p2pManager should expose offMessage
    };
  }, [dispatch]);

  // The manual STATE_UPDATE broadcast has been removed to allow the CRDT (Yjs) to handle
  // state synchronization properly without overwriting the state naively.

  const initiateHandshake = async (peerId: string) => {
    // Temporarily disabled biometric requirement for testing
    /*
    if (isBiometricAvailable) {
      try {
        const authenticated = await authenticateWithPasskey();
        if (!authenticated) {
          console.warn('Biometric verification skipped or failed. Proceeding with P2P link.');
        }
      } catch (e) {
        console.warn('Biometric error:', e);
      }
    }
    */

    p2pManager.connect(peerId);
  };

  const handleManualConnect = () => {
    if (!manualPeerId.trim()) return;
    setPendingPeerId(manualPeerId.trim());
    setShowConfirmConnectModal(true);
  };

  const handleScanConnect = (scannedPeerId: string) => {
    setShowScannerModal(false);
    if (!scannedPeerId.trim()) return;
    setPendingPeerId(scannedPeerId.trim());
    setShowConfirmConnectModal(true);
  };

  const handleRoleChange = (role: 'admin' | 'vendedor' | 'custom') => {
    setSelectedRole(role);
    if (role === 'admin') {
      setSelectedPermissions({
        canViewProducts: true,
        canEditProducts: true,
        canViewSales: true,
        canEditSales: true,
        canViewClients: true,
        canEditClients: true,
        canViewSuppliers: true,
        canEditSuppliers: true,
        canViewPurchaseOrders: true,
        canEditPurchaseOrders: true,
        canViewReports: true,
        canViewArqueo: true,
        canViewDashboard: true,
      });
    } else if (role === 'vendedor') {
      setSelectedPermissions({
        canViewProducts: true,
        canEditProducts: true,
        canViewSales: true,
        canEditSales: true,
        canViewClients: true,
        canEditClients: true,
        canViewSuppliers: false,
        canEditSuppliers: false,
        canViewPurchaseOrders: false,
        canEditPurchaseOrders: false,
        canViewReports: false,
        canViewArqueo: false,
        canViewDashboard: false,
      });
    }
  };

  const handleCustomPermissionToggle = (key: string) => {
    setSelectedPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const confirmAndConnect = () => {
    if (!pendingPeerId) return;

    // Save to pending configuration
    const finalRole = selectedRole === 'admin' ? 'admin' : 'collaborator';
    setPendingConfigs((prev) => ({
      ...prev,
      [pendingPeerId]: {
        role: finalRole,
        permissions: selectedPermissions,
      },
    }));

    initiateHandshake(pendingPeerId);
    setPendingPeerId('');
    setManualPeerId('');
    setShowConfirmConnectModal(false);
  };

  useEffect(() => {
    // Apply pending configs to newly connected peers
    const connectedPeerIds = state.peers.map((p) => p.id);
    const pendingPeerIds = Object.keys(pendingConfigs);

    const matchingPeerId = pendingPeerIds.find((id) => connectedPeerIds.includes(id));
    if (matchingPeerId) {
      const config = pendingConfigs[matchingPeerId];
      const peer = state.peers.find((p) => p.id === matchingPeerId);

      if (peer) {
        // Promote to admin if configured
        if (config.role === 'admin' && peer.role !== 'admin' && state.role === 'admin') {
          p2pManager.broadcast({ type: 'PROMOTE_ADMIN', payload: { targetPeerId: matchingPeerId } });
        }

        // Apply permissions
        if (state.role === 'admin') {
          // Update the CRDT map first so the new role and permissions are replicated securely
          dbSync.updatePeerConfig(matchingPeerId, config.role, config.permissions);

          p2pManager.broadcast({
            type: 'UPDATE_PEER_PERMISSIONS',
            payload: { targetPeerId: matchingPeerId, permissions: config.permissions },
          });
          dispatch({
            type: 'UPDATE_PEER_PERMISSIONS',
            payload: { targetPeerId: matchingPeerId, permissions: config.permissions },
          });
        }

        // Remove from pending configs
        setPendingConfigs((prev) => {
          const updated = { ...prev };
          delete updated[matchingPeerId];
          return updated;
        });
      }
    }
  }, [state.peers, pendingConfigs, state.role, dispatch]);

  const getDbStats = () => {
    const counts = {
      products: state.products?.length || 0,
      sales: state.sales?.length || 0,
      clients: state.clients?.length || 0,
      suppliers: state.suppliers?.length || 0,
      orders: state.purchaseOrders?.length || 0,
      logs: state.auditLogs?.length || 0,
    };
    const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);

    const rawData = {
      products: state.products,
      sales: state.sales,
      clients: state.clients,
      suppliers: state.suppliers,
      purchaseOrders: state.purchaseOrders,
      auditLogs: state.auditLogs,
    };
    let sizeStr = '0 KB';
    try {
      const bytes = new Blob([JSON.stringify(rawData)]).size;
      if (bytes < 1024) sizeStr = `${bytes} B`;
      else if (bytes < 1048576) sizeStr = `${(bytes / 1024).toFixed(2)} KB`;
      else sizeStr = `${(bytes / 1048576).toFixed(2)} MB`;
    } catch (e) {
      console.error(e);
    }

    return { counts, totalItems, sizeStr };
  };

  const { counts, sizeStr } = getDbStats();

  const handlePromote = (peerId: string) => {
    if (state.role === 'admin') {
      p2pManager.broadcast({ type: 'PROMOTE_ADMIN', payload: { targetPeerId: peerId } });
    }
  };

  const togglePermission = (peerId: string, perm: string, currentVal: boolean) => {
    const updatedPerms = {
      ...(state.peers.find((p) => p.id === peerId)?.permissions || {}),
      [perm]: !currentVal,
    };
    p2pManager.broadcast({
      type: 'UPDATE_PEER_PERMISSIONS',
      payload: { targetPeerId: peerId, permissions: updatedPerms },
    });
    dispatch({
      type: 'UPDATE_PEER_PERMISSIONS',
      payload: { targetPeerId: peerId, permissions: updatedPerms },
    });
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold text-[#F5F5DC]">Secure P2P Sync (Post-Quantum)</h3>
          <button
            onClick={() => setShowInfoModal(true)}
            className="text-[#F5F5DC]/60 hover:text-[#F5F5DC] transition-colors"
            title={t('p2pSync.infoTitle')}
          >
            <Info size={20} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#121212] rounded-md min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="text-xs sm:text-sm break-all flex items-center gap-1.5">
              {t('p2pSync.peerId') || 'Peer ID'}:{' '}
              <span className="font-mono text-yellow-400">{state.localPeerId || 'Initializing...'}</span>
              {state.localPeerId && (
                <button
                  onClick={() => setShowMyQrModal(true)}
                  className="text-[#F5F5DC]/60 hover:text-[#F5F5DC] transition-colors"
                  title={t('p2pSync.myQrTitle')}
                >
                  <QrCode size={14} />
                </button>
              )}
            </span>
            <span className="text-[10px] text-[#F5F5DC]/50 mt-1">
              {t('p2pSync.encryptedTunnelActive') || 'Encrypted Tunnel: ACTIVE (ML-KEM-768 via P2PManager)'}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs sm:text-sm font-semibold capitalize px-2 py-0.5 rounded-full bg-foreground/10 w-fit">
              {t('p2pSync.roleLabel') || 'Role'}: {state.role}
            </span>
            {state.peers.length > 0 && (
              <span className="text-xs text-green-400">
                {t('p2pSync.syncLabel') || 'Sync'}: {syncProgress}%
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1">
          <input
            type="text"
            placeholder={t('p2pSync.placeholderManual') || 'O ingresa el Peer ID manualmente...'}
            value={manualPeerId}
            onChange={(e) => setManualPeerId(e.target.value)}
            className="flex-1 bg-[#121212] border border-[#F5F5DC]/30 rounded-lg px-3 py-2.5 text-sm text-[#F5F5DC] placeholder-[#F5F5DC]/30 focus:outline-none focus:border-[#F5F5DC]/60 transition-colors"
          />
          <button
            type="button"
            onClick={handleManualConnect}
            disabled={!manualPeerId.trim()}
            className="bg-[#F5F5DC] text-[#1a1a1a] px-4 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors active:scale-95"
          >
            {t('p2pSync.connect') || 'Conectar'}
          </button>
          <button
            type="button"
            onClick={() => setShowScannerModal(true)}
            className="p-2.5 bg-[#121212] border border-[#F5F5DC]/30 rounded-lg text-[#F5F5DC]/80 hover:text-[#F5F5DC] hover:border-[#F5F5DC]/60 transition-colors"
            title={t('p2pSync.scanQrTitle')}
          >
            <QrCode size={20} />
          </button>
        </div>

        {isBiometricAvailable && (
          <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[10px] text-green-400 text-center">
            🛡️ Biometric hardware detected (WebAuthn/TPM)
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-[#F5F5DC] text-sm">{t('p2pSync.linkedDevices') || 'Linked Devices'}</h4>
            {state.peers.length > 0 && (
              <button
                onClick={() => setShowConfigModal(true)}
                className="p-1.5 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-[#F5F5DC]/60 hover:text-[#F5F5DC] hover:border-[#F5F5DC]/60 transition-colors"
                title={t('p2pSync.configTitle')}
              >
                <Settings size={16} />
              </button>
            )}
          </div>
          {state.peers.length > 0 ? (
            <div className="space-y-2">
              {state.peers.map((peer) => {
                const masterId = dbSync.getMasterPeerId();
                const isOnline = p2pManager.isPeerConnected(peer.id) || peer.id === state.localPeerId;
                const canManagePeer =
                  state.localPeerId === masterId && peer.id !== masterId && peer.id !== state.localPeerId;
                const isLocal = peer.id === state.localPeerId;
                const isPeerMaster = peer.id === masterId || peer.isMaster;

                let statusText = 'Desconectado';
                let statusColor = 'text-gray-500';

                if (isLocal) {
                  statusText = 'Este Dispositivo (En línea)';
                  statusColor = 'text-green-400';
                } else if (isOnline) {
                  if (peer.status === 'verified') {
                    statusText = 'En línea (Sincronizado)';
                    statusColor = 'text-green-400';
                  } else {
                    statusText = 'En línea (Sincronizando...)';
                    statusColor = 'text-yellow-400 animate-pulse';
                  }
                }

                const lastSeenText =
                  isLocal || isOnline ? 'Ahora' : peer.lastSeen ? new Date(peer.lastSeen).toLocaleString() : 'Nunca';

                return (
                  <div
                    key={peer.id}
                    className="flex justify-between items-center p-3 rounded-md bg-background/50 text-sm border border-[#F5F5DC]/10 hover:border-[#F5F5DC]/20 transition-all animate-fadeIn"
                  >
                    <div className="flex flex-col w-full gap-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-2">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs break-all text-yellow-400">{peer.id}</span>
                            {isPeerMaster && (
                              <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-full font-bold">
                                👑 Host Original
                              </span>
                            )}
                            {isLocal && (
                              <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-full font-bold">
                                Este Dispositivo
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-[11px] text-[#F5F5DC]/60">
                            <span className="flex items-center gap-1">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${isOnline || isLocal ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-gray-500'}`}
                              />
                              <span className={statusColor}>{statusText}</span>
                            </span>
                            <span>
                              Última conexión: <span className="font-mono">{lastSeenText}</span>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 self-end sm:self-center">
                          <span className="capitalize px-2 py-0.5 rounded text-xs bg-foreground/10 font-bold border border-[#F5F5DC]/10">
                            {peer.role}
                          </span>
                          {canManagePeer && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setShowPermissions(showPermissions === peer.id ? null : peer.id)}
                                className="text-xs text-blue-400 hover:underline cursor-pointer"
                              >
                                {t('p2pSync.permissionsLink') || 'Permisos'}
                              </button>
                              {peer.role !== 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => handlePromote(peer.id)}
                                  className="text-xs text-yellow-400 hover:underline cursor-pointer"
                                >
                                  {t('p2pSync.promoteLink') || 'Promote'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => p2pManager.kick(peer.id)}
                                className="text-xs text-red-400 hover:text-red-300 font-bold hover:underline cursor-pointer"
                              >
                                Expulsar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {showPermissions === peer.id && canManagePeer && (
                        <div className="mt-2 p-2 bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-md grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {[
                            { key: 'canViewProducts', label: 'Ver Productos' },
                            { key: 'canEditProducts', label: 'Editar Productos' },
                            { key: 'canViewSales', label: 'Ver Ventas' },
                            { key: 'canEditSales', label: 'Editar Ventas' },
                            { key: 'canViewClients', label: 'Ver Clientes' },
                            { key: 'canEditClients', label: 'Editar Clientes' },
                            { key: 'canViewSuppliers', label: 'Ver Proveedores' },
                            { key: 'canEditSuppliers', label: 'Editar Proveedores' },
                            { key: 'canViewPurchaseOrders', label: 'Ver Órdenes' },
                            { key: 'canEditPurchaseOrders', label: 'Editar Órdenes' },
                            { key: 'canViewReports', label: 'Ver Reportes' },
                            { key: 'canViewArqueo', label: 'Ver Arqueo' },
                            { key: 'canViewDashboard', label: 'Ver Dashboard' },
                          ].map((perm) => {
                            const hasPerm = peer.permissions ? (peer.permissions as any)[perm.key] !== false : true;
                            return (
                              <label
                                key={perm.key}
                                className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={hasPerm}
                                  onChange={() => togglePermission(peer.id, perm.key, hasPerm)}
                                  className="accent-yellow-500 rounded-sm"
                                />
                                <span className="text-[#F5F5DC]/80">
                                  {t(`p2pSync.permissions.${perm.key}`) || perm.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#F5F5DC]/50">{t('p2pSync.noDevices') || 'No secure devices linked.'}</p>
          )}
        </div>
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg max-w-lg w-full shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-[#F5F5DC]/10">
              <h3 className="font-bold text-[#F5F5DC] flex items-center gap-2">
                <Info size={18} className="text-yellow-400" />
                {t('p2pSync.infoTitle')}
              </h3>
              <button onClick={() => setShowInfoModal(false)} className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm text-[#F5F5DC]/80 max-h-[70vh] overflow-y-auto">
              <p>
                <strong>{t('p2pSync.infoDistributedDb').split(':')[0]}:</strong>{' '}
                {t('p2pSync.infoDistributedDb').split(':')[1]}
              </p>
              <p>
                <strong>{t('p2pSync.infoPermissions').split(':')[0]}:</strong>{' '}
                {t('p2pSync.infoPermissions').split(':')[1]}
              </p>
              <p>
                <strong>{t('p2pSync.infoSync').split(':')[0]}:</strong> {t('p2pSync.infoSync').split(':')[1]}
              </p>
              <p>
                <strong>{t('p2pSync.infoConfig').split(':')[0]}:</strong> {t('p2pSync.infoConfig').split(':')[1]}
              </p>
              <p>
                <strong>{t('p2pSync.infoRoles').split(':')[0]}:</strong> {t('p2pSync.infoRoles').split(':')[1]}
              </p>
              <p>
                <strong>{t('p2pSync.infoProtection').split(':')[0]}:</strong>{' '}
                {t('p2pSync.infoProtection').split(':')[1]}
              </p>
            </div>
            <div className="p-4 border-t border-[#F5F5DC]/10 flex justify-end">
              <button
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2 bg-[#333] hover:bg-[#444] rounded text-white text-sm font-medium transition-colors"
              >
                {t('p2pSync.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg max-w-md w-full shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-[#F5F5DC]/10">
              <h3 className="font-bold text-[#F5F5DC] flex items-center gap-2">
                <Settings size={18} className="text-yellow-400" />
                {t('p2pSync.configTitle')}
              </h3>
              <button onClick={() => setShowConfigModal(false)} className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm text-[#F5F5DC]/80">
              <div className="p-3 bg-[#121212] rounded border border-[#F5F5DC]/10">
                <p className="mb-2 text-xs opacity-70">{t('p2pSync.localPeerIdLabel') || 'Peer ID local'}</p>
                <code className="font-mono text-yellow-400 break-all select-all">{state.localPeerId}</code>
              </div>
              <div className="p-3 bg-[#121212] rounded border border-[#F5F5DC]/10 flex justify-between items-center">
                <span>{t('p2pSync.yourCurrentRole') || 'Tu Rol Actual:'}</span>
                <span className="font-bold text-green-400 capitalize">{state.role}</span>
              </div>
            </div>
            <div className="p-4 border-t border-[#F5F5DC]/10 flex justify-end">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-[#333] hover:bg-[#444] rounded text-white text-sm font-medium transition-colors"
              >
                {t('p2pSync.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My QR Modal */}
      {showMyQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg max-w-sm w-full shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-[#F5F5DC]/10">
              <h3 className="font-bold text-[#F5F5DC] flex items-center gap-2">
                <QrCode size={18} className="text-yellow-400" />
                {t('p2pSync.myQrTitle')}
              </h3>
              <button onClick={() => setShowMyQrModal(false)} className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center gap-4 text-center">
              <div className="bg-white p-4 rounded-xl">
                {state.localPeerId ? (
                  <QRCodeCanvas value={state.localPeerId} size={200} level="H" includeMargin={false} />
                ) : (
                  <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-200 animate-pulse text-gray-500">
                    Loading...
                  </div>
                )}
              </div>
              <p className="text-sm text-[#F5F5DC]/80 mt-2">{t('p2pSync.qrInstructions')}</p>
            </div>
            <div className="p-4 border-t border-[#F5F5DC]/10 flex justify-end">
              <button
                onClick={() => setShowMyQrModal(false)}
                className="px-4 py-2 bg-[#333] hover:bg-[#444] rounded text-white text-sm font-medium transition-colors"
              >
                {t('p2pSync.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showScannerModal && <QRScannerModal onScan={handleScanConnect} onClose={() => setShowScannerModal(false)} />}

      {/* Confirm Connection Modal */}
      {showConfirmConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg max-w-md w-full shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-[#F5F5DC]/10">
              <h3 className="font-bold text-red-400 flex items-center gap-2">🛡️ {t('p2pSync.confirmTitle')}</h3>
              <button
                onClick={() => setShowConfirmConnectModal(false)}
                className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm text-[#F5F5DC]/80">
              <p className="leading-relaxed bg-yellow-500/10 border border-yellow-500/20 p-3 rounded text-yellow-400">
                {t('p2pSync.confirmWarning')}
              </p>

              <div className="space-y-2">
                <h4 className="font-bold text-[#F5F5DC] border-b border-[#F5F5DC]/10 pb-1">
                  {t('p2pSync.confirmStatsTitle')}
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between p-1 bg-[#121212] rounded">
                    <span className="opacity-70">{t('p2pSync.products')}:</span>
                    <span className="font-bold text-yellow-400">{counts.products}</span>
                  </div>
                  <div className="flex justify-between p-1 bg-[#121212] rounded">
                    <span className="opacity-70">{t('p2pSync.sales')}:</span>
                    <span className="font-bold text-yellow-400">{counts.sales}</span>
                  </div>
                  <div className="flex justify-between p-1 bg-[#121212] rounded">
                    <span className="opacity-70">{t('p2pSync.clients')}:</span>
                    <span className="font-bold text-yellow-400">{counts.clients}</span>
                  </div>
                  <div className="flex justify-between p-1 bg-[#121212] rounded">
                    <span className="opacity-70">{t('p2pSync.suppliers')}:</span>
                    <span className="font-bold text-yellow-400">{counts.suppliers}</span>
                  </div>
                  <div className="flex justify-between p-1 bg-[#121212] rounded">
                    <span className="opacity-70">{t('p2pSync.orders')}:</span>
                    <span className="font-bold text-yellow-400">{counts.orders}</span>
                  </div>
                  <div className="flex justify-between p-1 bg-[#121212] rounded">
                    <span className="opacity-70">{t('p2pSync.logs')}:</span>
                    <span className="font-bold text-yellow-400">{counts.logs}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[#121212] rounded flex justify-between items-center border border-[#F5F5DC]/10">
                <span className="font-bold">{t('p2pSync.confirmSize')}:</span>
                <span className="text-green-400 font-bold font-mono">{sizeStr}</span>
              </div>

              {/* Role and Permissions Configuration */}
              <div className="space-y-3 border-t border-[#F5F5DC]/10 pt-3">
                <h4 className="font-bold text-[#F5F5DC]">
                  {t('p2pSync.configCollaboratorTitle') || 'Configuración del Colaborador'}
                </h4>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'admin', label: t('p2pSync.roleAdmin') || 'Admin' },
                    { id: 'vendedor', label: t('p2pSync.roleVendedor') || 'Vendedor' },
                    { id: 'custom', label: t('p2pSync.roleCustom') || 'Personalizado' },
                  ].map((roleOpt) => (
                    <button
                      key={roleOpt.id}
                      type="button"
                      onClick={() => handleRoleChange(roleOpt.id as any)}
                      className={`py-1.5 px-2 rounded text-xs font-bold border transition-colors ${
                        selectedRole === roleOpt.id
                          ? 'bg-yellow-500 border-yellow-500 text-[#1a1a1a]'
                          : 'bg-[#121212] border-[#F5F5DC]/20 text-[#F5F5DC]/80 hover:border-[#F5F5DC]/40'
                      }`}
                    >
                      {roleOpt.label}
                    </button>
                  ))}
                </div>

                {selectedRole === 'custom' && (
                  <div className="mt-2 p-2 bg-[#121212] border border-[#F5F5DC]/15 rounded max-h-[150px] overflow-y-auto grid grid-cols-2 gap-2 text-xs">
                    {[
                      { key: 'canViewProducts', label: 'Ver Productos' },
                      { key: 'canEditProducts', label: 'Editar Productos' },
                      { key: 'canViewSales', label: 'Ver Ventas' },
                      { key: 'canEditSales', label: 'Editar Ventas' },
                      { key: 'canViewClients', label: 'Ver Clientes' },
                      { key: 'canEditClients', label: 'Editar Clientes' },
                      { key: 'canViewSuppliers', label: 'Ver Proveedores' },
                      { key: 'canEditSuppliers', label: 'Editar Proveedores' },
                      { key: 'canViewPurchaseOrders', label: 'Ver Órdenes' },
                      { key: 'canEditPurchaseOrders', label: 'Editar Órdenes' },
                      { key: 'canViewReports', label: 'Ver Reportes' },
                      { key: 'canViewArqueo', label: 'Ver Arqueo' },
                      { key: 'canViewDashboard', label: 'Ver Dashboard' },
                    ].map((perm) => (
                      <label key={perm.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPermissions[perm.key] !== false}
                          onChange={() => handleCustomPermissionToggle(perm.key)}
                          className="accent-yellow-500 rounded-sm"
                        />
                        <span className="text-[#F5F5DC]/80 truncate">
                          {t(`p2pSync.permissions.${perm.key}`) || perm.label}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-[#F5F5DC]/10 flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmConnectModal(false)}
                className="px-4 py-2 bg-[#333] hover:bg-[#444] rounded text-white text-sm font-medium transition-colors"
              >
                {t('p2pSync.close')}
              </button>
              <button
                onClick={confirmAndConnect}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-[#1a1a1a] rounded text-sm font-bold transition-colors"
              >
                {t('p2pSync.confirmProceed')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default P2PSyncManager;
