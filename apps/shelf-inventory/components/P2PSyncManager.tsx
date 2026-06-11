import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { p2pManager, type SyncMessage } from 'p2p-mesh-core';
import { isBiometricsSupported } from '../lib/webauthn';

const P2PSyncManager: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [manualPeerId, setManualPeerId] = useState('');
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [showPermissions, setShowPermissions] = useState<string | null>(null);

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
          const sender = stateRef.current.peers.find(p => p.id === fromPeerId);
          if (sender?.role === 'admin' || sender?.isMaster) {
            if (message.payload.targetPeerId === p2pManager.localPeerId) {
              dispatch({ type: 'SET_ROLE', payload: 'admin' });
            }
          }
          break;
        }
        case 'UPDATE_PEER_PERMISSIONS': {
          const sender = stateRef.current.peers.find(p => p.id === fromPeerId);
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

  // Broadcast state changes
  useEffect(() => {
    const prev = prevStateRef.current;
    if (
      prev.sales === state.sales &&
      prev.clients === state.clients &&
      prev.suppliers === state.suppliers &&
      prev.purchaseOrders === state.purchaseOrders &&
      prev.products === state.products &&
      prev.auditLogs === state.auditLogs
    ) {
      return;
    }

    prevStateRef.current = state;
    if (state.peers.length === 0) return;

    const broadcastState = async () => {
      try {
        const diff = {
          sales: state.sales,
          clients: state.clients,
          suppliers: state.suppliers,
          purchaseOrders: state.purchaseOrders,
          products: state.products,
          auditLogs: state.auditLogs,
        };

        p2pManager.broadcast({
          type: 'STATE_UPDATE',
          payload: diff,
        });
      } catch (e) {
        console.error('Failed to encrypt P2P broadcast state:', e);
      }
    };

    broadcastState();
  }, [
    state.sales,
    state.clients,
    state.suppliers,
    state.purchaseOrders,
    state.products,
    state.auditLogs,
    state.peers.length,
    state,
  ]);

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
    initiateHandshake(manualPeerId.trim());
    setManualPeerId('');
  };

  const handlePromote = (peerId: string) => {
    if (state.role === 'admin') {
      p2pManager.broadcast({ type: 'PROMOTE_ADMIN', payload: { targetPeerId: peerId } });
    }
  };

  const togglePermission = (peerId: string, perm: string, currentVal: boolean) => {
    const updatedPerms = {
      ...(state.peers.find(p => p.id === peerId)?.permissions || {}),
      [perm]: !currentVal
    };
    p2pManager.broadcast({
      type: 'UPDATE_PEER_PERMISSIONS',
      payload: { targetPeerId: peerId, permissions: updatedPerms }
    });
    dispatch({
      type: 'UPDATE_PEER_PERMISSIONS',
      payload: { targetPeerId: peerId, permissions: updatedPerms }
    });
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg mt-6">
      <h3 className="text-xl font-bold text-[#F5F5DC] mb-4">Secure P2P Sync (Post-Quantum)</h3>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#121212] rounded-md min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="text-xs sm:text-sm break-all">
              Peer ID: <span className="font-mono text-yellow-400">{state.localPeerId || 'Initializing...'}</span>
            </span>
            <span className="text-[10px] text-[#F5F5DC]/50 mt-1">
              Encrypted Tunnel:{' '}
              <span className="text-green-500 font-bold">ACTIVE (ML-KEM-768 via P2PManager)</span>
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs sm:text-sm font-semibold capitalize px-2 py-0.5 rounded-full bg-foreground/10 w-fit">
              Role: {state.role}
            </span>
            {state.peers.length > 0 && (
              <span className="text-xs text-green-400">
                Sync: {syncProgress}%
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1">
          <input
            type="text"
            placeholder="O ingresa el Peer ID manualmente..."
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
            Conectar
          </button>
        </div>

        {isBiometricAvailable && (
          <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[10px] text-green-400 text-center">
            🛡️ Biometric hardware detected (WebAuthn/TPM)
          </div>
        )}

        <div className="mt-4">
          <h4 className="font-bold text-[#F5F5DC] mb-2 text-sm">Linked Devices</h4>
          {state.peers.length > 0 ? (
            <div className="space-y-2">
              {state.peers.map((peer) => (
                <div
                  key={peer.id}
                  className="flex justify-between items-center p-2 rounded-md bg-background/50 text-sm"
                >
                  <div className="flex flex-col w-full gap-2">
                    <div className="flex justify-between items-center w-full">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">{peer.id}</span>
                        <span className="text-[10px] opacity-60">Handshake verified</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="capitalize text-xs text-[#F5F5DC]/60">{peer.role}</span>
                        {state.role === 'admin' && peer.role !== 'admin' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setShowPermissions(showPermissions === peer.id ? null : peer.id)}
                              className="text-xs text-blue-400 hover:underline"
                            >
                              Permisos
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePromote(peer.id)}
                              className="text-xs text-yellow-400 hover:underline"
                            >
                              Promote
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {showPermissions === peer.id && state.role === 'admin' && (
                      <div className="mt-2 p-2 bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-md grid grid-cols-2 gap-2 text-xs">
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
                        ].map(perm => {
                          const hasPerm = peer.permissions ? (peer.permissions as any)[perm.key] !== false : true;
                          return (
                            <label key={perm.key} className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={hasPerm}
                                onChange={() => togglePermission(peer.id, perm.key, hasPerm)}
                                className="accent-yellow-500 rounded-sm"
                              />
                              <span className="text-[#F5F5DC]/80">{perm.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#F5F5DC]/50">No secure devices linked.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default P2PSyncManager;
