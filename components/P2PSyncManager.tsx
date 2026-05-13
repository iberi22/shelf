import type React from 'react';
import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { p2pManager, type SyncMessage } from '../lib/p2p';

const P2PSyncManager: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [targetId, setTargetId] = useState('');

  useEffect(() => {
    p2pManager.init();

    const handleMessage = (message: SyncMessage, fromPeerId: string) => {
      switch (message.type) {
        case 'STATE_UPDATE':
          dispatch({ type: 'SYNC_STATE', payload: message.payload });
          break;
        case 'REQUEST_FULL_STATE':
          p2pManager.sendTo(fromPeerId, {
            type: 'STATE_UPDATE',
            payload: {
              products: state.products,
              sales: state.sales,
              clients: state.clients,
              suppliers: state.suppliers,
              purchaseOrders: state.purchaseOrders,
              auditLogs: state.auditLogs,
            },
          });
          break;
        case 'PROMOTE_ADMIN':
          if (message.payload.targetPeerId === p2pManager.localPeerId) {
            dispatch({ type: 'SET_ROLE', payload: 'admin' });
          }
          break;
      }
    };

    p2pManager.onMessage(handleMessage);
    p2pManager.onConnectionChange((peers) => {
      dispatch({ type: 'UPDATE_PEERS', payload: peers });
    });

    const interval = setInterval(() => {
      if (p2pManager.localPeerId) {
        dispatch({ type: 'SET_LOCAL_PEER_ID', payload: p2pManager.localPeerId });
        clearInterval(interval);
      }
    }, 1000);

    return () => {
      // p2pManager.disconnect();
    };
  }, [dispatch, state.sales, state.clients, state.suppliers, state.purchaseOrders, state.products, state.auditLogs]);

  const handleConnect = () => {
    if (targetId) {
      p2pManager.connect(targetId);
      setTargetId('');
    }
  };

  const handlePromote = (peerId: string) => {
    if (state.role === 'admin') {
      p2pManager.broadcast({ type: 'PROMOTE_ADMIN', payload: { targetPeerId: peerId } });
    }
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg mt-6">
      <h3 className="text-xl font-bold text-[#F5F5DC] mb-4">P2P Synchronization</h3>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between p-3 bg-[#121212] rounded-md">
          <span>
            Local Peer ID: <span className="font-mono text-yellow-400">{state.localPeerId || 'Initializing...'}</span>
          </span>
          <span className="text-sm font-semibold capitalize px-2 py-0.5 rounded-full bg-foreground/10">
            Role: {state.role}
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter Remote Peer ID"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="flex-grow p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md"
          />
          <button
            onClick={handleConnect}
            className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors text-sm"
          >
            Connect
          </button>
        </div>

        <div className="mt-4">
          <h4 className="font-bold text-[#F5F5DC] mb-2 text-sm">Connected Peers</h4>
          {state.peers.length > 0 ? (
            <div className="space-y-2">
              {state.peers.map((peer) => (
                <div
                  key={peer.id}
                  className="flex justify-between items-center p-2 rounded-md bg-background/50 text-sm"
                >
                  <span className="font-mono">{peer.id}</span>
                  <div className="flex items-center gap-3">
                    <span className="capitalize text-xs text-[#F5F5DC]/60">{peer.role}</span>
                    {state.role === 'admin' && peer.role !== 'admin' && (
                      <button
                        onClick={() => handlePromote(peer.id)}
                        className="text-xs text-yellow-400 hover:underline"
                      >
                        Promote to Admin
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#F5F5DC]/50">No peers connected.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default P2PSyncManager;
