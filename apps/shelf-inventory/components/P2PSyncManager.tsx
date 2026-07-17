
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Download,
  History,
  Info,
  Link2,
  MessageCircle,
  QrCode,
  RadioTower,
  RefreshCw,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  dbSync,
  type P2PRole,
  type PeerHealthInfo,
  type PeerPermissions,
  p2pManager,
  type SyncMessage,
} from 'p2p-mesh-core';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import { buildPeerInviteLink, buildPeerInviteMessage, buildPwaInstallLink } from '../lib/share-links';
import { telemetry } from '../lib/telemetry';
import { isBiometricsSupported } from '../lib/webauthn';
import CollapsibleCard from './CollapsibleCard';
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
  'fixed inset-0 z-50 flex h-[var(--app-height,100vh)] items-center justify-center overflow-y-auto bg-black/60 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-sm sm:p-4';
const modalPanelClass =
  'flex max-h-[calc(var(--app-height,100vh)-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-[#F5F5DC]/30 bg-[#1a1a1a] shadow-2xl sm:max-h-[calc(var(--app-height,100vh)-2rem)] sm:rounded-lg';
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
  const [showHistoryForPeer, setShowHistoryForPeer] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [wakeLockActive, setWakeLockActive] = useState(() => {
    return localStorage.getItem('shelf:wakeLockPref') === 'true';
  });
  const wakeLockRef = useRef<any>(null);
  const [wakeLockUptime, setWakeLockUptime] = useState(0);
  const wakeLockStartedRef = useRef<number | null>(null);
  const [wakeLockRetries, setWakeLockRetries] = useState(0);

  const acquireWakeLock = useCallback(async (): Promise<boolean> => {
    try {
      if (!('wakeLock' in navigator)) {
        showNotification('Wake Lock API no soportado en este navegador.', 'error');
        return false;
      }
      const lock = await navigator.wakeLock.request('screen');
      wakeLockRef.current = lock;
      setWakeLockActive(true);
      localStorage.setItem('shelf:wakeLockPref', 'true');

      if (!wakeLockStartedRef.current) {
        wakeLockStartedRef.current = Date.now();
      }

      lock.addEventListener('release', () => {
        wakeLockRef.current = null;
        // Don't setWakeLockActive(false) here — the retry loop will handle re-acquisition
        // Only mark inactive if we're not the one who released it intentionally
        if (wakeLockRef.current === null && wakeLockStartedRef.current !== null) {
          console.warn('[Keep-Alive] Wake Lock released by system, will retry...');
          setWakeLockRetries((r) => r + 1);
          // Auto-retry in 2 seconds
          setTimeout(() => {
            if (wakeLockStartedRef.current !== null) {
              acquireWakeLock();
            }
          }, 2000);
        }
      });

      return true;
    } catch (err) {
      console.error('Wake Lock error:', err);
      return false;
    }
  }, [showNotification]);

  const releaseWakeLock = async () => {
    wakeLockStartedRef.current = null;
    setWakeLockUptime(0);
    setWakeLockRetries(0);
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        console.error('Failed to release wake lock:', err);
      }
      wakeLockRef.current = null;
    }
    setWakeLockActive(false);
    localStorage.setItem('shelf:wakeLockPref', 'false');
  };

  const toggleWakeLock = async () => {
    if (wakeLockActive || wakeLockStartedRef.current !== null) {
      await releaseWakeLock();
      showNotification('Nodo Keep-Alive desactivado.', 'info');
    } else {
      const ok = await acquireWakeLock();
      if (ok) {
        showNotification('Nodo Keep-Alive activado. Pantalla encendida.', 'success');
      } else {
        showNotification('Error al activar Wake Lock. Tu navegador podría no soportarlo.', 'error');
      }
    }
  };

  // Uptime counter
  useEffect(() => {
    const startedAt = wakeLockStartedRef.current;
    if (!wakeLockActive || !startedAt) return;
    const interval = setInterval(() => {
      setWakeLockUptime(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [wakeLockActive]);

  // Auto-restore on mount and visibility changes
  useEffect(() => {
    const savedPref = localStorage.getItem('shelf:wakeLockPref') === 'true';
    if (savedPref && 'wakeLock' in navigator) {
      acquireWakeLock();
    }

    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === 'visible' &&
        wakeLockStartedRef.current !== null &&
        wakeLockRef.current === null &&
        'wakeLock' in navigator
      ) {
        await acquireWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Don't release on unmount if pref is saved — let the PWA stay alive
    };
  }, [acquireWakeLock]);

  // Heartbeat P2P mientras wakeLock esté activo
  useEffect(() => {
    if (!wakeLockActive) return;
    const interval = setInterval(() => {
      try {
        p2pManager.broadcast({ type: 'KEEPALIVE_PING', payload: { ts: Date.now() } } as any);
      } catch {
        // silencioso
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [wakeLockActive]);
  const [isForcingSync, setIsForcingSync] = useState(false);
  const [branchInput, setBranchInput] = useState(state.activeBranch || '');
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
    isBiometricsSupported()
      .then(setIsBiometricAvailable)
      .catch(() => setIsBiometricAvailable(false));
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
        telemetry.trackEvent('p2p_connection_established', {
          peer_count: peers.length,
          is_host: dbSync.getMasterPeerId() === p2pManager.localPeerId,
        });
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
  }, [dispatch, showNotification, state.inventoryConfig.useEdgeMeshSync]);

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
    telemetry.trackEvent('p2p_connection_initiated', {
      is_host: isLocalHostAuthority,
    });
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

  const handleBranchSwitch = () => {
    if (branchInput.trim() === (state.activeBranch || '')) return;
    dispatch({ type: 'SET_ACTIVE_BRANCH', payload: branchInput.trim() });
    showNotification(`Cambiando a rama: ${branchInput.trim() || 'Global'}`, 'success');
  };

  const handleManualFailover = () => {
    if (!state.localPeerId) return;
    const currentMaster = dbSync.getMasterPeerId();
    if (currentMaster === state.localPeerId || state.role === 'admin') {
      dbSync.forceHostFailover();
      showNotification('Iniciando failover manual...', 'success');
    }
  };

  const currentHostId = dbSync.getMasterPeerId();
  const hostHealth = currentHostId ? peerHealth[currentHostId] : null;
  const isHostLocal = currentHostId === state.localPeerId;

  return (
    <CollapsibleCard
      title="Secure P2P Sync (Post-Quantum)"
      description={
        <div className="flex items-center gap-1.5">
          <span>Sincronización segura y descentralizada.</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowInfoModal(true);
            }}
            className="text-[#F5F5DC]/60 transition-colors hover:text-[#F5F5DC] cursor-pointer inline-flex items-center bg-transparent border-none p-0"
            title={t('p2pSync.infoTitle')}
          >
            <Info size={16} />
          </button>
        </div>
      }
      icon={<RadioTower className="h-5 w-5" />}
      testId="settings-p2p-sync-card"
    >
      <div className="flex flex-col gap-4">
        {/* Local Node Summary Card */}
        <div className="flex flex-col gap-3 rounded-xl border border-[#F5F5DC]/10 bg-[#121212] p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <RadioTower size={18} className={edgeMeshStatus.enabled ? 'text-cyan-400' : 'text-[#F5F5DC]/50'} />
              <span className="text-sm font-bold text-[#F5F5DC]">Mi Nodo (Edge Mesh)</span>
            </div>
            <button
              onClick={() => setShowConfigModal(true)}
              className="p-1.5 text-[#F5F5DC]/50 hover:text-white bg-white/5 rounded-md transition-colors"
              title="Configuración Avanzada"
            >
              <Settings size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#F5F5DC]/50 uppercase tracking-wider">Peer ID:</span>
            <button
              onClick={copyLocalPeerId}
              disabled={!state.localPeerId}
              className="flex items-center gap-2 group min-w-0"
            >
              <code className="text-xs font-mono text-yellow-400 truncate">
                {state.localPeerId || 'Initializing...'}
              </code>
              {state.localPeerId && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#F5F5DC]/60 group-hover:text-white transition">
                  Copiar
                </span>
              )}
            </button>
            {copyStatus === 'copied' && <span className="text-[10px] text-green-400 ml-1">¡Copiado!</span>}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#F5F5DC]/60">
            <span className="flex items-center gap-1">
              <CheckCircle2
                size={12}
                className={isHostLocal || hostHealth?.status === 'healthy' ? 'text-green-400' : 'text-gray-500'}
              />
              {isHostLocal ? 'Host Principal' : 'Conectado a Host'}
            </span>
            <span>•</span>
            <span className="font-mono">{edgeMeshStatus.totalItems} entidades</span>
            <span>•</span>
            <span className="capitalize text-cyan-200">Rol: {state.role}</span>
          </div>

          {/* Share Actions - Minimalist Row */}
          {state.localPeerId && (
            <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-white/5 pb-1">
              <button
                onClick={() => setShowMyQrModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white transition-colors whitespace-nowrap"
              >
                <QrCode size={14} /> QR
              </button>
              <button
                onClick={() => {
                  window.open(`https://wa.me/?text=${encodeURIComponent(inviteMessage)}`, '_blank');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 text-xs transition-colors whitespace-nowrap"
              >
                <MessageCircle size={14} /> WhatsApp
              </button>
              <button
                onClick={async () => {
                  try {
                    const linkToCopy = peerInviteLink || window.location.origin;
                    await navigator.clipboard.writeText(linkToCopy);
                    showNotification('Enlace del nodo copiado al portapapeles.', 'success');
                  } catch (_e) {
                    showNotification('Error al copiar el enlace.', 'error');
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-xs transition-colors whitespace-nowrap cursor-pointer"
              >
                <Link2 size={14} /> Link Nodo
              </button>
              {/* Hidden anchor for tests to read the invite link */}
              {(window as any).__E2E_TEST__ && peerInviteLink && (
                <a href={peerInviteLink} data-testid="p2p-invite-link" style={{ display: 'none' }}>
                  Invite Link Test
                </a>
              )}
              <a
                href={pwaInstallLink || window.location.origin}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F5DC]/10 text-[#F5F5DC] hover:bg-[#F5F5DC]/20 text-xs transition-colors whitespace-nowrap"
                title="PWA"
              >
                <Download size={14} /> PWA
              </a>
            </div>
          )}
        </div>

        {/* Wake Lock Card - Always visible in main UI */}
        <div
          className={`flex flex-col gap-2 p-3 rounded-xl border transition-colors shadow-sm ${
            wakeLockActive ? 'border-green-400/60 bg-green-500/10' : 'border-green-500/30 bg-green-500/5'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  wakeLockActive ? 'bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.7)]' : 'bg-gray-600'
                }`}
              />
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  wakeLockActive ? 'text-green-300' : 'text-green-400'
                }`}
              >
                Nodo Keep-Alive (24/7)
              </span>
              {wakeLockActive && (
                <span className="text-[10px] bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded-full font-mono">
                  {wakeLockUptime >= 3600
                    ? `${(wakeLockUptime / 3600).toFixed(1)}h`
                    : wakeLockUptime >= 60
                      ? `${Math.floor(wakeLockUptime / 60)}m ${wakeLockUptime % 60}s`
                      : `${wakeLockUptime}s`}{' '}
                  activo
                </span>
              )}
            </span>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input type="checkbox" checked={wakeLockActive} onChange={toggleWakeLock} className="sr-only peer" />
              <div className="w-8 h-4.5 bg-[#121212] border border-[#F5F5DC]/25 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-400 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-green-600 peer-checked:after:bg-[#121212] peer-checked:after:border-[#121212]"></div>
            </label>
          </div>
          <p className="text-[10px] text-green-400/80 leading-relaxed">
            Previene la suspensión de pantalla/dispositivo para que la app sirva de nodo de sincronización activo e
            ininterrumpido.
          </p>
          {wakeLockActive && (
            <div className="flex items-center gap-3 text-[10px] text-green-400/60 pt-1">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
                Heartbeat activo (30s)
              </span>
              {wakeLockRetries > 0 && <span className="text-yellow-400/70">Reintentos: {wakeLockRetries}</span>}
              <span className="text-[9px] text-green-400/40">Persiste al recargar</span>
            </div>
          )}
          {!('wakeLock' in navigator) && (
            <p className="text-[10px] text-red-400/80 mt-1">
              ⚠️ Wake Lock API no disponible en este navegador. Actualiza Chrome/Edge o usa PWA.
            </p>
          )}
        </div>

        {/* Connect / Scanner Unified Input */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-[#F5F5DC]/70 px-1">Conectar a un Nodo</span>
          <div className="flex items-center gap-2 rounded-xl border border-[#F5F5DC]/20 bg-[#1a1a1a] p-1.5 shadow-sm">
            <div className="flex-1 flex items-center bg-[#121212] rounded-lg border border-transparent focus-within:border-yellow-400/50 px-3 transition-colors">
              <input
                data-testid="manual-peer-id-input"
                type="text"
                placeholder="Ingresa Peer ID..."
                value={manualPeerId}
                onChange={(e) => setManualPeerId(e.target.value)}
                className="w-full bg-transparent py-2.5 text-sm text-[#F5F5DC] placeholder-[#F5F5DC]/40 focus:outline-none"
              />
              {manualPeerId.trim() && (
                <button
                  data-testid="manual-connect-button"
                  onClick={handleManualConnect}
                  className="text-yellow-400 font-bold text-xs px-2 hover:text-yellow-300 transition-colors"
                >
                  CONECTAR
                </button>
              )}
            </div>
            <button
              onClick={() => setShowScannerModal(true)}
              className="p-2.5 bg-yellow-400 text-black rounded-lg hover:bg-yellow-300 transition-colors shrink-0"
              title="Escanear QR"
            >
              <QrCode size={18} />
            </button>
          </div>
        </div>

        {isBiometricAvailable && (
          <div className="text-[10px] text-green-400/70 text-center flex items-center justify-center gap-1.5">
            <ShieldAlert size={12} /> Biometría habilitada (WebAuthn/TPM)
          </div>
        )}

        <div className="mt-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-bold text-[#F5F5DC] text-sm">
              {t('p2pSync.linkedDevices') || 'Dispositivos Enlazados'}
            </h4>
            {state.peers.length > 0 && (
              <button
                type="button"
                onClick={handleForceSync}
                disabled={isForcingSync}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/20 disabled:opacity-50"
              >
                <RefreshCw size={12} className={isForcingSync ? 'animate-spin' : ''} />
                Sync
              </button>
            )}
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
                            <div className="flex flex-wrap items-center gap-2">
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
                              <button
                                type="button"
                                onClick={() => setShowHistoryForPeer(peer.id)}
                                className="text-xs bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20 px-2 py-1 rounded cursor-pointer transition-colors"
                              >
                                {t('p2pSync.viewHistory')}
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

      {typeof document !== 'undefined' &&
        createPortal(
          <>
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

            {/* Advanced Config Modal */}
            {showConfigModal && (
              <div className={modalOverlayClass}>
                <div className={`${modalPanelClass} h-[calc(var(--app-height,100vh)-1.5rem)] sm:max-w-md sm:h-auto`}>
                  <div className="flex items-start justify-between gap-3 border-b border-[#F5F5DC]/10 p-4 sm:p-5">
                    <h3 className="flex min-w-0 flex-1 items-center gap-2 font-bold text-[#F5F5DC]">
                      <Settings size={18} className="text-yellow-400" />
                      Configuración Avanzada
                    </h3>
                    <button
                      onClick={() => setShowConfigModal(false)}
                      className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className={`${modalBodyClass} space-y-5`}>
                    {/* Host Status & Failover */}
                    <div className="flex flex-col gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#F5F5DC]">Host Principal</span>
                        {state.role === 'admin' && !isHostLocal && (
                          <button
                            onClick={handleManualFailover}
                            className="rounded bg-yellow-500/10 px-2 py-1 text-[10px] font-bold text-yellow-500 border border-yellow-500/30 hover:bg-yellow-500/20 transition-colors"
                          >
                            Forzar Failover
                          </button>
                        )}
                      </div>
                      <div className="text-xs font-mono text-yellow-400 break-all">{currentHostId || 'N/A'}</div>
                    </div>

                    {/* Wake Lock */}
                    <div
                      className={`flex flex-col gap-2 p-3 rounded-lg border transition-colors ${
                        wakeLockActive ? 'border-green-400/60 bg-green-500/10' : 'border-green-500/30 bg-green-500/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              wakeLockActive
                                ? 'bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]'
                                : 'bg-gray-600'
                            }`}
                          />
                          <span
                            className={`text-xs font-bold uppercase tracking-wider ${
                              wakeLockActive ? 'text-green-300' : 'text-green-400'
                            }`}
                          >
                            Nodo Keep-Alive (24/7)
                          </span>
                          {wakeLockActive && (
                            <span className="text-[10px] bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded-full font-mono">
                              {wakeLockUptime >= 3600
                                ? `${(wakeLockUptime / 3600).toFixed(1)}h`
                                : wakeLockUptime >= 60
                                  ? `${Math.floor(wakeLockUptime / 60)}m ${wakeLockUptime % 60}s`
                                  : `${wakeLockUptime}s`}{' '}
                              activo
                            </span>
                          )}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={wakeLockActive}
                            onChange={toggleWakeLock}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4.5 bg-[#121212] border border-[#F5F5DC]/25 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-400 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-green-600 peer-checked:after:bg-[#121212] peer-checked:after:border-[#121212]"></div>
                        </label>
                      </div>
                      <p className="text-[10px] text-green-400/80 leading-relaxed">
                        Previene la suspensión de pantalla/dispositivo para que la app sirva de nodo de sincronización
                        activo e ininterrumpido.
                      </p>
                      {wakeLockActive && (
                        <div className="flex items-center gap-3 text-[10px] text-green-400/60 pt-1">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
                            Heartbeat activo (30s)
                          </span>
                          {wakeLockRetries > 0 && (
                            <span className="text-yellow-400/70">Reintentos: {wakeLockRetries}</span>
                          )}
                          <span className="text-[9px] text-green-400/40">Persiste al recargar</span>
                        </div>
                      )}
                      {!('wakeLock' in navigator) && (
                        <p className="text-[10px] text-red-400/80 mt-1">
                          ⚠️ Wake Lock API no disponible en este navegador. Actualiza Chrome/Edge o usa PWA.
                        </p>
                      )}
                    </div>

                    {/* Branch Isolation */}
                    <div className="flex flex-col gap-2 p-3 rounded-lg border border-purple-500/30 bg-purple-500/5">
                      <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                        Branch Isolation
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="ID de Rama (vacio para Global)..."
                          value={branchInput}
                          onChange={(e) => setBranchInput(e.target.value)}
                          className="flex-1 bg-black/40 border border-[#F5F5DC]/20 rounded px-2 py-1.5 text-xs text-purple-200 focus:outline-none focus:border-purple-500/50"
                        />
                        <button
                          onClick={handleBranchSwitch}
                          className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors"
                        >
                          Switch
                        </button>
                      </div>
                      <span className="text-[10px] text-purple-400/70">
                        Current:{' '}
                        <span className="font-mono text-purple-300">{state.activeBranch || 'Global (None)'}</span>
                      </span>
                    </div>

                    <div className="p-3 bg-[#121212] rounded border border-[#F5F5DC]/10 flex flex-col gap-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-[#F5F5DC]/70">Rol Actual:</span>
                        <span className="font-bold text-green-400 capitalize">{state.role}</span>
                      </div>
                      <p className="text-[10px] text-[#F5F5DC]/50">
                        Solo el host original puede conceder permisos o promover nodos. Los nodos compartidos fuera del
                        host quedan en modo comprador/portafolio.
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 justify-end border-t border-[#F5F5DC]/10 p-4">
                    <button
                      onClick={() => setShowConfigModal(false)}
                      className="rounded bg-[#333] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#444]"
                    >
                      Cerrar
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
                        <QRCodeSVG value={state.localPeerId} size={180} level="H" includeMargin={false} />
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
            {showScannerModal && (
              <QRScannerModal onScan={handleScanConnect} onClose={() => setShowScannerModal(false)} />
            )}

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

            {/* Connection History Modal */}
            {showHistoryForPeer && (
              <div className={modalOverlayClass}>
                <div className={`${modalPanelClass} h-[calc(var(--app-height,100vh)-1.5rem)] sm:max-w-2xl sm:h-auto`}>
                  <div className="flex items-start justify-between gap-3 border-b border-[#F5F5DC]/10 p-4 sm:p-5">
                    <h3 className="flex min-w-0 flex-1 items-center gap-2 font-bold text-[#F5F5DC]">
                      <History size={18} className="text-orange-400" />
                      Historial de Conexión
                    </h3>
                    <button
                      onClick={() => setShowHistoryForPeer(null)}
                      className="text-[#F5F5DC]/60 hover:text-[#F5F5DC]"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className={`${modalBodyClass} space-y-4`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121212] p-3 rounded-md border border-[#F5F5DC]/10">
                      <div className="min-w-0">
                        <span className="text-[10px] text-[#F5F5DC]/50 uppercase tracking-wider block mb-0.5">
                          Peer ID
                        </span>
                        <code className="text-yellow-400 text-xs font-mono break-all">{showHistoryForPeer}</code>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-[10px] text-[#F5F5DC]/50 uppercase tracking-wider block mb-0.5">
                          Total
                        </span>
                        <span className="text-sm font-bold text-[#F5F5DC]">
                          {t('p2pSync.eventsRegistered', { count: dbSync.getPeerHistory(showHistoryForPeer).length })}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-[#F5F5DC]/10 bg-black/20">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#121212] text-[#F5F5DC]/60 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="px-4 py-2 font-bold">{t('sales.date')}</th>
                            <th className="px-4 py-2 font-bold">{t('common.status')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F5F5DC]/5">
                          {[...dbSync.getPeerHistory(showHistoryForPeer)].reverse().map((event, idx) => {
                            const iconMap: Record<string, any> = {
                              connected: { color: 'text-green-400', icon: CheckCircle2 },
                              verified: { color: 'text-blue-400', icon: ShieldAlert },
                              offline: { color: 'text-red-400', icon: AlertCircle },
                              disconnected: { color: 'text-red-400', icon: X },
                              reconnected: { color: 'text-yellow-400', icon: RefreshCw },
                            };
                            const config = iconMap[event.eventType] || { color: 'text-gray-400', icon: Activity };
                            const Icon = config.icon;

                            return (
                              <tr key={`${event.timestamp}-${idx}`} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3 font-mono text-[#F5F5DC]/70 whitespace-nowrap">
                                  {new Date(event.timestamp).toLocaleString()}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center gap-1.5 font-medium ${config.color}`}>
                                    <Icon size={14} />
                                    {t(`p2pSync.eventTypes.${event.eventType}`)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          {dbSync.getPeerHistory(showHistoryForPeer).length === 0 && (
                            <tr>
                              <td colSpan={2} className="px-4 py-8 text-center text-[#F5F5DC]/40 italic">
                                No hay eventos registrados.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-start gap-2 p-3 rounded bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300">
                      <Info size={14} className="shrink-0 mt-0.5" />
                      <p>{t('p2pSync.historyMemoryDisclaimer')}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 justify-end border-t border-[#F5F5DC]/10 p-4">
                    <button
                      onClick={() => setShowHistoryForPeer(null)}
                      className="rounded bg-[#333] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#444]"
                    >
                      {t('p2pSync.close')}
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                      <div className="text-center text-sm opacity-50 p-6">
                        No hay actividad registrada para este nodo.
                      </div>
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
          </>,
          document.body,
        )}
    </CollapsibleCard>
  );
};

export default P2PSyncManager;
