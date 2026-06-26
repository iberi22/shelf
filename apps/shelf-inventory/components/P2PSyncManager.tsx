import { Download, Info, Link2, MessageCircle, QrCode, RadioTower, RefreshCw, Settings, X } from 'lucide-react';
import {
  dbSync,
  type P2PRole,
  type PeerHealthInfo,
  type PeerPermissions,
  p2pManager,
  type SyncMessage,
} from 'p2p-mesh-core';
import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import { buildPeerInviteLink, buildPeerInviteMessage, buildPwaInstallLink } from '../lib/share-links';
import { isBiometricsSupported } from '../lib/webauthn';
import { useEdgeMeshWorkflowStatus } from './EdgeMeshWorkflowBridge';
import QRScannerModal from './QRScannerModal';

const permissionPresets: Record<'admin' | 'collaborator' | 'vendedor', PeerPermissions> = {
  admin: {
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
  },
  collaborator: {
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
  },
  vendedor: {
    canViewProducts: true,
    canEditProducts: false,
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
  },
};

const permissionOptions: { key: keyof PeerPermissions; label: string }[] = [
  { key: 'canViewProducts', label: 'Ver Productos' },
  { key: 'canEditProducts', label: 'Editar Productos' },
  { key: 'canViewSales', label: 'Ver Ventas' },
  { key: 'canEditSales', label: 'Editar Ventas' },
  { key: 'canViewClients', label: 'Ver Clientes' },
  { key: 'canEditClients', label: 'Editar Clientes' },
  { key: 'canViewSuppliers', label: 'Ver Proveedores' },
  { key: 'canEditSuppliers', label: 'Editar Proveedores' },
  { key: 'canViewPurchaseOrders', label: 'Ver Ordenes' },
  { key: 'canEditPurchaseOrders', label: 'Editar Ordenes' },
  { key: 'canViewReports', label: 'Ver Reportes' },
  { key: 'canViewArqueo', label: 'Ver Arqueo' },
  { key: 'canViewDashboard', label: 'Ver Dashboard' },
];

const modalOverlayClass =
  'fixed inset-0 z-50 flex h-[var(--app-height,100vh)] items-start justify-center overflow-y-auto bg-black/60 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-4';
const modalPanelClass =
  'flex max-h-[calc(var(--app-height,100vh)-1.5rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-[#F5F5DC]/30 bg-[#1a1a1a] shadow-2xl sm:max-h-[calc(var(--app-height,100vh)-2rem)] sm:rounded-lg';
const modalBodyClass = 'flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 text-sm text-[#F5F5DC]/80 sm:p-5';

const P2PSyncManager: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showNotification } = useUI();
  const [manualPeerId, setManualPeerId] = useState('');
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showPermissions, setShowPermissions] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showMyQrModal, setShowMyQrModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showConfirmConnectModal, setShowConfirmConnectModal] = useState(false);
  const [pendingPeerId, setPendingPeerId] = useState('');
  const [showLogsForPeer, setShowLogsForPeer] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [isForcingSync, setIsForcingSync] = useState(false);
  const [selectedRole, setSelectedRole] = useState<P2PRole>('collaborator');
  const [selectedPermissions, setSelectedPermissions] = useState<PeerPermissions>(permissionPresets.collaborator);
  const [peerHealth, setPeerHealth] = useState<Record<string, PeerHealthInfo>>(() => {
    return Object.fromEntries(p2pManager.getPeerHealthList().map((health) => [health.peerId, health]));
  });
  const [pendingConfigs, setPendingConfigs] = useState<Record<string, { role: P2PRole; permissions: PeerPermissions }>>(
    {},
  );
  const edgeMeshStatus = useEdgeMeshWorkflowStatus();
  const { t } = useI18n();

  const stateRef = useRef(state);
  const copyStatusTimerRef = useRef<number | null>(null);
  const masterPeerId = dbSync.getMasterPeerId();
  const isLocalHostAuthority = Boolean(state.localPeerId && masterPeerId && state.localPeerId === masterPeerId);
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const pwaInstallLink = appOrigin ? buildPwaInstallLink(appOrigin) : '';
  const peerInviteLink = state.localPeerId && appOrigin ? buildPeerInviteLink(appOrigin, state.localPeerId) : '';
  const inviteMessage = state.localPeerId && appOrigin ? buildPeerInviteMessage(appOrigin, state.localPeerId) : '';
  stateRef.current = state;

  useEffect(() => {
    isBiometricsSupported().then(setIsBiometricAvailable);
    p2pManager.init();

    const isAuthorizedConfigSender = (fromPeerId: string) => {
      return dbSync.getMasterPeerId() === fromPeerId;
    };

    const applyLocalPeerConfig = (
      role: P2PRole,
      permissions?: PeerPermissions,
      authorityPeerId: string | null = dbSync.getMasterPeerId(),
    ) => {
      if (!p2pManager.localPeerId) return;
      const isLocalHost = dbSync.getMasterPeerId() === p2pManager.localPeerId;
      const effectiveRole = !isLocalHost && role === 'admin' ? 'collaborator' : role;
      const effectivePermissions = effectiveRole === role ? permissions : permissions || permissionPresets.collaborator;

      p2pManager.role = effectiveRole;
      dbSync.masterRole = effectiveRole;
      dbSync.updateLinkedNode(
        p2pManager.localPeerId,
        { role: effectiveRole, permissions: effectivePermissions },
        authorityPeerId,
      );
      dispatch({
        type: 'UPDATE_PEER_CONFIG',
        payload: { targetPeerId: p2pManager.localPeerId, role: effectiveRole, permissions: effectivePermissions },
      });
    };

    const handleMessage = async (message: SyncMessage, fromPeerId: string) => {
      switch (message.type) {
        case 'STATE_UPDATE':
          dispatch({ type: 'SYNC_STATE', payload: message.payload as Partial<typeof state> });
          break;
        case 'YJS_UPDATE': {
          // Update local React state when a Yjs update arrives
          const latestState = dbSync.getState();
          dispatch({ type: 'SYNC_STATE', payload: latestState });
          break;
        }
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
            teamMembers: current.teamMembers,
            inventoryConfig: current.inventoryConfig,
            pendingEdits: current.pendingEdits,
            productChangeHistory: current.productChangeHistory,
            role: current.role,
            permissions: current.permissions,
            peers: current.peers,
          };
          p2pManager.sendTo(fromPeerId, {
            type: 'STATE_UPDATE',
            payload: stateSnapshot,
          });
          break;
        }
        case 'CHANGE_ROLE': {
          if (isAuthorizedConfigSender(fromPeerId)) {
            if (message.payload.targetPeerId === p2pManager.localPeerId) {
              applyLocalPeerConfig(message.payload.role, message.payload.permissions, fromPeerId);
            }
            dbSync.updatePeerConfig(
              message.payload.targetPeerId,
              message.payload.role,
              message.payload.permissions,
              fromPeerId,
            );
          }
          break;
        }
        case 'UPDATE_PEER_PERMISSIONS': {
          if (isAuthorizedConfigSender(fromPeerId)) {
            if (message.payload.targetPeerId === p2pManager.localPeerId && message.payload.role) {
              applyLocalPeerConfig(message.payload.role, message.payload.permissions, fromPeerId);
            }
            if (message.payload.role) {
              dbSync.updatePeerConfig(
                message.payload.targetPeerId,
                message.payload.role,
                message.payload.permissions,
                fromPeerId,
              );
            }
            dispatch({ type: 'UPDATE_PEER_PERMISSIONS', payload: message.payload });
          }
          break;
        }
      }
    };

    p2pManager.onMessage(handleMessage);

    p2pManager.onConnectionChange((peers) => {
      if (peers.length > 0) {
        setShowSyncModal(true);
        setSyncProgress(100);
      }
    });

    const unsubscribePeerHealth = p2pManager.onPeerHealthChange((health) => {
      setPeerHealth((current) => ({ ...current, [health.peerId]: health }));
    });

    p2pManager.onConnectionError((issue) => {
      const peerLabel = issue.peerId ? ` (${issue.peerId})` : '';
      const unavailablePeer =
        issue.type === 'peer-unavailable' ||
        issue.type === 'unavailable' ||
        issue.message.toLowerCase().includes('could not connect to peer');

      if (unavailablePeer) {
        showNotification(
          `No se pudo conectar al peer${peerLabel}. Mantén la app abierta en ambos dispositivos y verifica que el otro nodo siga en línea.`,
          'error',
          12000,
        );
        return;
      }

      showNotification(
        `Error de conexión P2P${peerLabel}. Mantén la app abierta para conservar el enlace y vuelve a intentar.`,
        'error',
        12000,
      );
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
      if (copyStatusTimerRef.current) {
        window.clearTimeout(copyStatusTimerRef.current);
      }
      unsubscribePeerHealth();
      // NOTE: For a full fix, p2pManager should expose offMessage
    };
  }, [dispatch, showNotification]);

  useEffect(() => {
    if (syncProgress >= 100) {
      const timer = setTimeout(() => {
        setShowSyncModal(false);
        setTimeout(() => setSyncProgress(0), 400); // Reset after modal transition
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [syncProgress]);

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

  const prepareConfiguredConnect = (peerId: string) => {
    if (!peerId.trim()) return;

    if (isLocalHostAuthority) {
      setPendingPeerId(peerId.trim());
      setSelectedRole('collaborator');
      setSelectedPermissions(permissionPresets.collaborator);
      setShowConfirmConnectModal(true);
      return;
    }

    initiateHandshake(peerId.trim());
  };

  const handleManualConnect = () => {
    if (!manualPeerId.trim()) return;
    prepareConfiguredConnect(manualPeerId.trim());
  };

  const handleScanConnect = (scannedPeerId: string) => {
    setShowScannerModal(false);
    if (!scannedPeerId.trim()) return;
    prepareConfiguredConnect(scannedPeerId.trim());
  };

  const handleRoleChange = (role: P2PRole) => {
    setSelectedRole(role);
    if (role === 'admin' || role === 'collaborator' || role === 'vendedor') {
      setSelectedPermissions(permissionPresets[role]);
    }
  };

  const handleCustomPermissionToggle = (key: keyof PeerPermissions) => {
    setSelectedPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const confirmAndConnect = () => {
    if (!pendingPeerId) return;

    // Save to pending configuration
    const finalRole = selectedRole;
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

  const copyLocalPeerId = async () => {
    if (!state.localPeerId) return;

    try {
      await navigator.clipboard.writeText(state.localPeerId);
      setCopyStatus('copied');
    } catch (error) {
      console.error('Failed to copy Peer ID:', error);
      setCopyStatus('error');
    }

    if (copyStatusTimerRef.current) {
      window.clearTimeout(copyStatusTimerRef.current);
    }

    copyStatusTimerRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
      copyStatusTimerRef.current = null;
    }, 1400);
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
        if (peer.status !== 'verified') return;

        // Apply permissions
        if (isLocalHostAuthority) {
          // Refresh the host's authority marker before pushing the peer config
          if (state.localPeerId) {
            dbSync.setMasterPeerId(state.localPeerId);
            // Ensure host's own node is marked as master in linkedNodes
            dbSync.updateLinkedNode(state.localPeerId, { role: 'admin', isMaster: true }, state.localPeerId);
          }

          // Update the CRDT map first so the new role and permissions are replicated securely
          dbSync.updatePeerConfig(matchingPeerId, config.role, config.permissions, state.localPeerId);
          dispatch({
            type: 'UPDATE_PEER_CONFIG',
            payload: { targetPeerId: matchingPeerId, role: config.role, permissions: config.permissions },
          });

          p2pManager.sendTo(matchingPeerId, {
            type: 'CHANGE_ROLE',
            payload: { targetPeerId: matchingPeerId, role: config.role, permissions: config.permissions },
          });
          p2pManager.sendTo(matchingPeerId, {
            type: 'UPDATE_PEER_PERMISSIONS',
            payload: { targetPeerId: matchingPeerId, role: config.role, permissions: config.permissions },
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
  }, [state.peers, pendingConfigs, dispatch, isLocalHostAuthority, state.localPeerId]);

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
      productChangeHistory: state.productChangeHistory,
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
  const edgeMeshLastSync = edgeMeshStatus.lastRemoteSyncAt || edgeMeshStatus.lastLocalSyncAt;
  const edgeMeshLastSyncLabel = edgeMeshLastSync ? new Date(edgeMeshLastSync).toLocaleTimeString() : 'pendiente';

  const handleChangePeerRole = (peerId: string, newRole: string) => {
    if (isLocalHostAuthority) {
      const peer = state.peers.find((p) => p.id === peerId);
      const role = newRole as P2PRole;
      if (peer) {
        const permissions = permissionPresets[role as keyof typeof permissionPresets] || peer.permissions;
        dbSync.updatePeerConfig(peerId, role, permissions, state.localPeerId);
        dispatch({ type: 'UPDATE_PEER_CONFIG', payload: { targetPeerId: peerId, role, permissions } });
      }
      p2pManager.sendTo(peerId, { type: 'CHANGE_ROLE', payload: { targetPeerId: peerId, role } });
    }
  };

  const togglePermission = (peerId: string, perm: string, currentVal: boolean) => {
    if (!isLocalHostAuthority) return;

    const peer = state.peers.find((p) => p.id === peerId);
    if (!peer) return;

    const basePermissions =
      peer.permissions ||
      permissionPresets[peer.role as keyof typeof permissionPresets] ||
      permissionPresets.collaborator;
    const updatedPerms: PeerPermissions = {
      ...basePermissions,
      [perm]: !currentVal,
    };

    // Update CRDT to persist permissions
    dbSync.updatePeerConfig(peerId, peer.role, updatedPerms, state.localPeerId);

    p2pManager.sendTo(peerId, {
      type: 'UPDATE_PEER_PERMISSIONS',
      payload: { targetPeerId: peerId, role: peer.role, permissions: updatedPerms },
    });
    dispatch({
      type: 'UPDATE_PEER_PERMISSIONS',
      payload: { targetPeerId: peerId, permissions: updatedPerms },
    });
  };

  const handleForceSync = () => {
    const requestedPeers = p2pManager.requestFullSync();

    if (requestedPeers === 0) {
      showNotification('No hay nodos conectados para sincronizar.', 'error', 5000);
      return;
    }

    setIsForcingSync(true);
    setShowSyncModal(true);
    setSyncProgress((prev) => Math.max(prev, 15));
    showNotification(`Sincronizacion solicitada a ${requestedPeers} nodo(s).`, 'success', 5000);

    window.setTimeout(() => {
      dispatch({ type: 'SYNC_STATE', payload: dbSync.getState(state.localPeerId) });
      setSyncProgress(100);
      setIsForcingSync(false);
    }, 1200);
  };

  return (
    <div className="mt-6 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-[#F5F5DC]/30 bg-[#1a1a1a] p-4 md:p-6">
      <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <h3 className="min-w-0 text-xl font-bold text-[#F5F5DC]">Secure P2P Sync (Post-Quantum)</h3>
          <button
            onClick={() => setShowInfoModal(true)}
            className="shrink-0 text-[#F5F5DC]/60 transition-colors hover:text-[#F5F5DC]"
            title={t('p2pSync.infoTitle')}
          >
            <Info size={20} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex w-full min-w-0 flex-col justify-between gap-2 rounded-md bg-[#121212] p-3 sm:flex-row sm:items-center">
          <div className="flex flex-col min-w-0 w-full">
            <div className="text-xs sm:text-sm flex flex-wrap items-center gap-1.5 min-w-0 w-full">
              <span className="shrink-0">{t('p2pSync.peerId') || 'Peer ID'}:</span>
              <button
                type="button"
                onClick={copyLocalPeerId}
                onPointerUp={copyLocalPeerId}
                disabled={!state.localPeerId}
                className="group min-w-0 flex-1 text-left disabled:cursor-default"
                title={state.localPeerId ? 'Tocar o hacer click para copiar el Peer ID' : 'Inicializando Peer ID...'}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`font-mono text-yellow-400 break-all min-w-0 ${state.localPeerId ? 'group-hover:underline group-active:opacity-80' : 'opacity-60'}`}
                  >
                    {state.localPeerId || 'Initializing...'}
                  </span>
                  {state.localPeerId && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#F5F5DC]/20 text-[#F5F5DC]/60 group-hover:text-[#F5F5DC]/90 group-active:scale-95 transition">
                      Copiar
                    </span>
                  )}
                </span>
              </button>
              {state.localPeerId && (
                <button
                  onClick={() => setShowMyQrModal(true)}
                  className="text-[#F5F5DC]/60 hover:text-[#F5F5DC] transition-colors shrink-0"
                  title={t('p2pSync.myQrTitle')}
                >
                  <QrCode size={14} />
                </button>
              )}
            </div>
            <span className="text-[10px] text-[#F5F5DC]/50 mt-1">
              {t('p2pSync.encryptedTunnelActive') || 'Encrypted Tunnel: ACTIVE (ML-KEM-768 via P2PManager)'}
            </span>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[#F5F5DC]/65">
              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 ${
                  edgeMeshStatus.enabled
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                    : 'border-[#F5F5DC]/15 bg-[#F5F5DC]/5'
                }`}
                title="Runtime CRDT de colecciones Shelf sobre edge-mesh"
              >
                <RadioTower size={12} />
                Edge Mesh {edgeMeshStatus.enabled ? 'activo' : 'esperando'}
              </span>
              <span className="font-mono">
                {edgeMeshStatus.totalItems} entidades / sync {edgeMeshLastSyncLabel}
              </span>
            </div>
            {copyStatus !== 'idle' && state.localPeerId && (
              <span className={`mt-1 text-[10px] ${copyStatus === 'copied' ? 'text-green-400' : 'text-red-400'}`}>
                {copyStatus === 'copied' ? 'Peer ID copiado al portapapeles' : 'No se pudo copiar el Peer ID'}
              </span>
            )}
            {state.localPeerId && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="bg-white p-1 rounded-md inline-flex shrink-0">
                  <QRCodeCanvas value={state.localPeerId} size={48} level="M" includeMargin={false} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowMyQrModal(true)}
                    className="min-h-9 text-xs bg-[#F5F5DC]/10 hover:bg-[#F5F5DC]/20 text-[#F5F5DC] border border-[#F5F5DC]/30 px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    {t('p2pSync.shareQrButton') || 'Compartir QR'}
                  </button>
                  <button
                    onClick={() => {
                      window.open(`https://wa.me/?text=${encodeURIComponent(inviteMessage)}`, '_blank');
                    }}
                    className="flex min-h-9 items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/20"
                  >
                    <MessageCircle size={14} aria-hidden="true" />
                    WhatsApp
                  </button>
                  <a
                    href={pwaInstallLink || window.location.origin}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="p2p-pwa-link"
                    className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[#F5F5DC]/30 bg-[#F5F5DC]/10 px-3 py-1.5 text-xs font-medium text-[#F5F5DC] transition-colors hover:bg-[#F5F5DC]/20"
                    title="Abrir o instalar la PWA"
                  >
                    <Download size={14} />
                    PWA
                  </a>
                  <a
                    href={peerInviteLink || window.location.origin}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="p2p-invite-link"
                    className="flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
                    title="Abrir enlace de invitación del nodo"
                  >
                    <Link2 size={14} />
                    Nodo
                  </a>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
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

        <div className="mt-1 grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 max-[420px]:grid-cols-1">
          <input
            type="text"
            placeholder={t('p2pSync.placeholderManual') || 'O ingresa el Peer ID manualmente...'}
            value={manualPeerId}
            onChange={(e) => setManualPeerId(e.target.value)}
            className="w-full min-w-0 rounded-lg border border-[#F5F5DC]/30 bg-[#121212] px-3 py-2.5 text-sm text-[#F5F5DC] placeholder-[#F5F5DC]/30 transition-colors focus:outline-none focus:border-[#F5F5DC]/60"
          />
          <button
            type="button"
            onClick={handleManualConnect}
            disabled={!manualPeerId.trim()}
            className="min-h-[44px] rounded-lg bg-[#F5F5DC] px-4 py-2.5 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 max-[420px]:w-full"
          >
            {t('p2pSync.connect') || 'Conectar'}
          </button>
          <button
            type="button"
            onClick={() => setShowScannerModal(true)}
            className="min-h-[44px] rounded-lg border border-[#F5F5DC]/30 bg-[#121212] p-2.5 text-[#F5F5DC]/80 transition-colors hover:text-[#F5F5DC] hover:border-[#F5F5DC]/60 max-[420px]:w-full"
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
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="font-bold text-[#F5F5DC] text-sm">{t('p2pSync.linkedDevices') || 'Linked Devices'}</h4>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleForceSync}
                disabled={state.peers.length === 0 || isForcingSync}
                data-testid="p2p-force-sync-button"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                title="Solicitar resincronizacion CRDT con state vectors"
              >
                <RefreshCw size={14} className={isForcingSync ? 'animate-spin' : ''} />
                Forzar sync
              </button>
              {state.peers.length > 0 && (
                <button
                  onClick={() => setShowConfigModal(true)}
                  className="min-h-9 rounded-md border border-[#F5F5DC]/30 bg-[#121212] p-1.5 text-[#F5F5DC]/60 transition-colors hover:text-[#F5F5DC] hover:border-[#F5F5DC]/60"
                  title={t('p2pSync.configTitle')}
                >
                  <Settings size={16} />
                </button>
              )}
            </div>
          </div>
          {state.peers.length > 0 ? (
            <div className="space-y-2">
              {state.peers.map((peer) => {
                const masterId = dbSync.getMasterPeerId();
                const health = peerHealth[peer.id];
                const isOnline = p2pManager.isPeerConnected(peer.id) || peer.id === state.localPeerId;
                const canManagePeer = isLocalHostAuthority && peer.id !== state.localPeerId;
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

                if (!isLocal && health?.status === 'stale') {
                  statusText = 'En linea (sin respuesta reciente)';
                  statusColor = 'text-yellow-400';
                } else if (!isLocal && health?.status === 'offline') {
                  statusText = 'Sin respuesta';
                  statusColor = 'text-red-400';
                } else if (!isLocal && health?.status === 'healthy') {
                  statusText = 'En linea (saludable)';
                  statusColor = 'text-green-400';
                }

                const lastSeenText =
                  isLocal || isOnline ? 'Ahora' : peer.lastSeen ? new Date(peer.lastSeen).toLocaleString() : 'Nunca';
                const lastHealthText = health?.lastSeen ? new Date(health.lastSeen).toLocaleTimeString() : null;

                return (
                  <div
                    key={peer.id}
                    className="flex flex-col gap-3 p-3 rounded-md bg-background/50 text-sm border border-[#F5F5DC]/10 hover:border-[#F5F5DC]/20 transition-all animate-fadeIn"
                  >
                    <div className="flex flex-col w-full gap-2 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between w-full gap-3 min-w-0">
                        <div className="flex flex-col min-w-0 w-full">
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
                        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center w-full sm:w-auto">
                          <span className="capitalize px-2 py-0.5 rounded text-xs bg-foreground/10 font-bold border border-[#F5F5DC]/10">
                            {peer.role}
                          </span>
                          {lastHealthText && (
                            <span className={`px-2 py-0.5 rounded text-xs border border-[#F5F5DC]/10 ${statusColor}`}>
                              salud {health?.status}: {lastHealthText}
                            </span>
                          )}
                          {canManagePeer && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setShowPermissions(showPermissions === peer.id ? null : peer.id)}
                                className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 px-2 py-1 rounded cursor-pointer transition-colors"
                              >
                                {t('p2pSync.permissionsLink') || 'Permisos'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowLogsForPeer(peer.id)}
                                className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 px-2 py-1 rounded cursor-pointer transition-colors"
                              >
                                Actividad
                              </button>
                              {peer.role !== 'admin' ? (
                                <button
                                  type="button"
                                  onClick={() => handleChangePeerRole(peer.id, 'admin')}
                                  className="text-xs text-yellow-400 hover:text-yellow-300 font-bold hover:underline cursor-pointer transition-colors"
                                >
                                  {t('p2pSync.promoteLink') || 'Promover a Admin'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleChangePeerRole(peer.id, 'collaborator')}
                                  className="text-xs text-orange-400 hover:text-orange-300 font-bold hover:underline cursor-pointer transition-colors"
                                >
                                  {t('p2pSync.demoteLink') || 'Quitar Admin'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => p2pManager.disconnectPeer(peer.id)}
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
                                  onChange={() => togglePermission(peer.id, perm.key as keyof PeerPermissions, hasPerm)}
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

      {/* Confirm Connection Modal */}
      {showConfirmConnectModal && (
        <div className={modalOverlayClass}>
          <div className={`${modalPanelClass} h-[calc(var(--app-height,100vh)-1.5rem)] sm:max-w-xl sm:h-auto`}>
            <div className="flex items-start justify-between gap-3 border-b border-[#F5F5DC]/10 p-4 sm:p-5">
              <h3 className="min-w-0 flex-1 font-bold text-[#F5F5DC]">
                {t('p2pSync.confirmTitle') || 'Confirmar conexión P2P'}
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmConnectModal(false)}
                className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]"
              >
                <X size={20} />
              </button>
            </div>
            <div className={`${modalBodyClass} space-y-4`}>
              <div className="p-3 bg-[#121212] rounded border border-[#F5F5DC]/10">
                <p className="text-xs text-[#F5F5DC]/60 mb-1">Peer ID destino</p>
                <code className="font-mono text-yellow-400 break-all">{pendingPeerId}</code>
              </div>

              <div>
                <p className="mb-2 font-semibold text-[#F5F5DC]">
                  {t('p2pSync.configCollaboratorTitle') || 'Configuracion del Colaborador'}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 md:grid-cols-4">
                  {[
                    { role: 'admin' as P2PRole, label: t('p2pSync.roleAdmin') || 'Admin' },
                    { role: 'collaborator' as P2PRole, label: 'Usuario normal' },
                    { role: 'vendedor' as P2PRole, label: t('p2pSync.roleVendedor') || 'Vendedor' },
                    { role: 'custom' as P2PRole, label: t('p2pSync.roleCustom') || 'Personalizado' },
                  ].map((option) => (
                    <button
                      key={option.role}
                      type="button"
                      onClick={() => handleRoleChange(option.role)}
                      className={`min-h-11 rounded border px-3 py-2 text-xs font-bold transition-colors ${
                        selectedRole === option.role
                          ? 'bg-yellow-400 text-[#121212] border-yellow-300'
                          : 'bg-[#121212] text-[#F5F5DC] border-[#F5F5DC]/20 hover:border-[#F5F5DC]/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                {permissionOptions.map((perm) => (
                  <label key={perm.key} className="flex min-h-11 items-start gap-2 rounded bg-[#121212] p-2">
                    <input
                      type="checkbox"
                      checked={selectedPermissions[perm.key]}
                      disabled={selectedRole !== 'custom'}
                      onChange={() => handleCustomPermissionToggle(perm.key)}
                      className="accent-yellow-500 rounded-sm"
                    />
                    <span className={selectedRole === 'custom' ? 'text-[#F5F5DC]/80' : 'text-[#F5F5DC]/45'}>
                      {t(`p2pSync.permissions.${perm.key}`) || perm.label}
                    </span>
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 md:grid-cols-3">
                {Object.entries(counts).map(([key, value]) => (
                  <div key={key} className="p-2 rounded bg-[#121212] border border-[#F5F5DC]/10">
                    <span className="block text-[#F5F5DC]/50">{t(`p2pSync.${key}`) || key}</span>
                    <span className="font-mono text-[#F5F5DC]">{value}</span>
                  </div>
                ))}
                <div className="p-2 rounded bg-[#121212] border border-[#F5F5DC]/10">
                  <span className="block text-[#F5F5DC]/50">{t('p2pSync.confirmSize') || 'Peso Estimado'}</span>
                  <span className="font-mono text-[#F5F5DC]">{sizeStr}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t border-[#F5F5DC]/10 p-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowConfirmConnectModal(false)}
                className="w-full rounded bg-[#333] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#444] sm:w-auto"
              >
                {t('p2pSync.close') || 'Cerrar'}
              </button>
              <button
                type="button"
                onClick={confirmAndConnect}
                className="w-full rounded bg-[#F5F5DC] px-4 py-2 text-sm font-bold text-[#121212] transition-colors hover:bg-white sm:w-auto"
              >
                {t('p2pSync.confirmProceed') || 'Sincronizar y Conectar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      {showInfoModal && (
        <div className={modalOverlayClass}>
          <div className={`${modalPanelClass} h-[calc(var(--app-height,100vh)-1.5rem)] sm:max-w-lg sm:h-auto`}>
            <div className="flex items-start justify-between gap-3 border-b border-[#F5F5DC]/10 p-4 sm:p-5">
              <h3 className="flex min-w-0 flex-1 items-center gap-2 font-bold text-[#F5F5DC]">
                <Info size={18} className="text-yellow-400" />
                {t('p2pSync.infoTitle')}
              </h3>
              <button onClick={() => setShowInfoModal(false)} className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]">
                <X size={20} />
              </button>
            </div>
            <div className={`${modalBodyClass} space-y-4`}>
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
            <div className="flex shrink-0 justify-end border-t border-[#F5F5DC]/10 p-4">
              <button
                onClick={() => setShowInfoModal(false)}
                className="rounded bg-[#333] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#444]"
              >
                {t('p2pSync.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfigModal && (
        <div className={modalOverlayClass}>
          <div className={`${modalPanelClass} h-[calc(var(--app-height,100vh)-1.5rem)] sm:max-w-md sm:h-auto`}>
            <div className="flex items-start justify-between gap-3 border-b border-[#F5F5DC]/10 p-4 sm:p-5">
              <h3 className="flex min-w-0 flex-1 items-center gap-2 font-bold text-[#F5F5DC]">
                <Settings size={18} className="text-yellow-400" />
                {t('p2pSync.configTitle')}
              </h3>
              <button onClick={() => setShowConfigModal(false)} className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]">
                <X size={20} />
              </button>
            </div>
            <div className={`${modalBodyClass} space-y-4`}>
              <div className="p-3 bg-[#121212] rounded border border-[#F5F5DC]/10">
                <p className="mb-2 text-xs opacity-70">{t('p2pSync.localPeerIdLabel') || 'Peer ID local'}</p>
                <code className="font-mono text-yellow-400 break-all select-all">{state.localPeerId}</code>
              </div>
              <div className="p-3 bg-[#121212] rounded border border-[#F5F5DC]/10 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span>{t('p2pSync.yourCurrentRole') || 'Tu Rol Actual:'}</span>
                  <span className="font-bold text-green-400 capitalize">{state.role}</span>
                </div>
                <p className="text-xs text-[#F5F5DC]/55">
                  Solo el host original puede conceder permisos o promover nodos. Los nodos compartidos fuera del host
                  quedan en modo comprador/portafolio.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 justify-end border-t border-[#F5F5DC]/10 p-4">
              <button
                onClick={() => setShowConfigModal(false)}
                className="rounded bg-[#333] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#444]"
              >
                {t('p2pSync.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My QR Modal */}
      {showMyQrModal && (
        <div className={modalOverlayClass}>
          <div className={`${modalPanelClass} h-[calc(var(--app-height,100vh)-1.5rem)] sm:max-w-sm sm:h-auto`}>
            <div className="flex items-start justify-between gap-3 border-b border-[#F5F5DC]/10 p-4 sm:p-5">
              <h3 className="flex min-w-0 flex-1 items-center gap-2 font-bold text-[#F5F5DC]">
                <QrCode size={18} className="text-yellow-400" />
                {t('p2pSync.myQrTitle')}
              </h3>
              <button onClick={() => setShowMyQrModal(false)} className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]">
                <X size={20} />
              </button>
            </div>
            <div className={`${modalBodyClass} flex flex-col items-center gap-4 text-center`}>
              <div className="rounded-xl bg-white p-4">
                {state.localPeerId ? (
                  <QRCodeCanvas value={state.localPeerId} size={180} level="H" includeMargin={false} />
                ) : (
                  <div className="flex h-[180px] w-[180px] items-center justify-center bg-gray-200 text-gray-500 animate-pulse">
                    Loading...
                  </div>
                )}
              </div>
              <p className="text-sm text-[#F5F5DC]/80 mt-2">{t('p2pSync.qrInstructions')}</p>
            </div>
            <div className="flex shrink-0 justify-end border-t border-[#F5F5DC]/10 p-4">
              <button
                onClick={() => setShowMyQrModal(false)}
                className="rounded bg-[#333] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#444]"
              >
                {t('p2pSync.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showScannerModal && <QRScannerModal onScan={handleScanConnect} onClose={() => setShowScannerModal(false)} />}

      {/* Sync Progress Modal */}
      <div
        key="sync-modal"
        className={`fixed inset-0 z-[100] flex h-[var(--app-height,100vh)] items-end justify-center overflow-y-auto bg-black/60 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-sm transition-all duration-300 sm:items-center sm:p-4 pointer-events-none ${
          showSyncModal ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
      >
        <div
          className={`flex w-full max-w-[calc(100vw-1.5rem)] flex-col items-center gap-4 overflow-hidden rounded-t-2xl border border-green-500/30 bg-[#1a1a1a] p-5 text-center shadow-[0_0_30px_rgba(34,197,94,0.15)] sm:max-w-sm sm:max-h-[calc(var(--app-height,100vh)-2rem)] sm:rounded-lg sm:p-6 transition-transform duration-300 ${
            showSyncModal ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'
          }`}
        >
          <h3 className={`font-bold text-green-400 text-lg ${syncProgress < 100 ? 'animate-pulse' : ''}`}>
            {syncProgress < 100 ? 'Sincronizando Paridad...' : '¡Empalme Completado!'}
          </h3>
          
          <div className="w-full bg-[#121212] rounded-full h-3 border border-[#F5F5DC]/10 overflow-hidden relative">
            <div
              className="bg-green-500 h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(34,197,94,0.8)]"
              style={{ width: `${Math.min(syncProgress, 100)}%` }}
            />
          </div>
          
          <p className="text-[#F5F5DC]/70 text-sm font-mono font-bold">
            {syncProgress < 100 ? `${Math.round(syncProgress)}% Paridad` : '100% Paridad Lograda'}
          </p>
        </div>
      </div>

      {/* Activity Log Modal */}
      {showLogsForPeer && (
        <div className={modalOverlayClass}>
          <div className={`${modalPanelClass} h-[calc(var(--app-height,100vh)-1.5rem)] sm:max-w-2xl sm:h-auto`}>
            <div className="flex items-start justify-between gap-3 border-b border-[#F5F5DC]/10 p-4 sm:p-5">
              <h3 className="flex min-w-0 flex-1 items-center gap-2 font-bold text-[#F5F5DC]">
                📋 Registro de Actividad
              </h3>
              <button onClick={() => setShowLogsForPeer(null)} className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]">
                <X size={20} />
              </button>
            </div>
            <div className={`${modalBodyClass} space-y-2`}>
              <div className="mb-4">
                <span className="text-sm opacity-70">Peer ID:</span>{' '}
                <code className="text-yellow-400 text-sm font-mono break-all">{showLogsForPeer}</code>
              </div>
              {state.auditLogs && state.auditLogs.filter((log) => log.peerId === showLogsForPeer).length > 0 ? (
                [...state.auditLogs]
                  .filter((log) => log.peerId === showLogsForPeer)
                  .reverse()
                  .map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-[#121212] rounded border border-[#F5F5DC]/10 text-sm flex flex-col gap-1"
                    >
                      <div className="flex justify-between items-center text-xs opacity-70">
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                        <span className="capitalize px-2 py-0.5 bg-foreground/10 rounded">
                          {log.entityType || 'General'}
                        </span>
                      </div>
                      <div className="text-[#F5F5DC] mt-1">{log.action}</div>
                    </div>
                  ))
              ) : (
                <div className="text-center text-sm opacity-50 p-6">No hay actividad registrada para este nodo.</div>
              )}
            </div>
            <div className="flex shrink-0 justify-end border-t border-[#F5F5DC]/10 p-4">
              <button
                onClick={() => setShowLogsForPeer(null)}
                className="rounded bg-[#333] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#444]"
              >
                {t('p2pSync.close') || 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default P2PSyncManager;
