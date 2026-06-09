import { Html5QrcodeScanner } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { decryptData, encryptData, getSessionKey } from '../lib/crypto';
import { p2pManager, type SyncMessage } from '../lib/p2p';

const P2PSyncManager: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [targetId, setTargetId] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const prevStateRef = useRef(state);

  useEffect(() => {
    p2pManager.init();

    const handleMessage = async (message: SyncMessage, fromPeerId: string) => {
      switch (message.type) {
        case 'STATE_UPDATE':
          try {
            let payload = message.payload;
            if (typeof payload === 'string') {
              // Encrypted payload
              const key = await getSessionKey();
              const decryptedStr = await decryptData(payload, key);
              payload = JSON.parse(decryptedStr);
            }
            dispatch({ type: 'SYNC_STATE', payload: payload as Partial<typeof state> });
          } catch (e) {
            console.error('Failed to decrypt or parse P2P state update:', e);
          }
          break;
        case 'REQUEST_FULL_STATE':
          try {
            const key = await getSessionKey();
            const stateSnapshot = {
              products: state.products,
              sales: state.sales,
              clients: state.clients,
              suppliers: state.suppliers,
              purchaseOrders: state.purchaseOrders,
              auditLogs: state.auditLogs,
            };
            const encryptedPayload = await encryptData(JSON.stringify(stateSnapshot), key);
            p2pManager.sendTo(fromPeerId, {
              type: 'STATE_UPDATE',
              // @ts-expect-error (payload type allows string when encrypted)
              payload: encryptedPayload,
            });
          } catch (e) {
            console.error('Failed to encrypt P2P full state:', e);
          }
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

    // No disconnect to keep connections alive across unmounts in this implementation
  }, [dispatch, state.clients, state.products, state.suppliers, state.sales, state.purchaseOrders, state.auditLogs]); // Run once on mount

  // Broadcast state changes encrypted
  useEffect(() => {
    // Basic diffing to avoid infinite broadcast loops
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
        const key = await getSessionKey();
        const diff = {
          sales: state.sales,
          clients: state.clients,
          suppliers: state.suppliers,
          purchaseOrders: state.purchaseOrders,
          products: state.products,
          auditLogs: state.auditLogs,
        };
        const encryptedPayload = await encryptData(JSON.stringify(diff), key);
        p2pManager.broadcast({
          type: 'STATE_UPDATE',
          // @ts-expect-error
          payload: encryptedPayload,
        });
      } catch (e) {
        console.error('Failed to encrypt broadcast state:', e);
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

  const handleConnect = () => {
    if (targetId) {
      p2pManager.connect(targetId);
      setTargetId('');
      setShowScanner(false);
    }
  };

  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner('p2p-qr-reader', { fps: 10, qrbox: 250 }, false);
      scanner.render(
        (decodedText) => {
          setTargetId(decodedText);
          scanner.clear();
        },
        () => {
          // ignore scan errors
        },
      );
      return () => {
        scanner.clear();
      };
    }
  }, [showScanner]);

  const handlePromote = (peerId: string) => {
    if (state.role === 'admin') {
      p2pManager.broadcast({ type: 'PROMOTE_ADMIN', payload: { targetPeerId: peerId } });
    }
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg mt-6">
      <h3 className="text-xl font-bold text-[#F5F5DC] mb-4">P2P Synchronization</h3>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#121212] rounded-md">
          <span className="text-xs sm:text-sm break-all">
            Local Peer ID: <span className="font-mono text-yellow-400">{state.localPeerId || 'Initializing...'}</span>
          </span>
          <span className="text-xs sm:text-sm font-semibold capitalize px-2 py-0.5 rounded-full bg-foreground/10 w-fit">
            Role: {state.role}
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter Remote Peer ID"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="flex-1 min-w-0 p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm"
          />
          <button
            onClick={handleConnect}
            className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors text-sm"
          >
            Connect
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              setShowQR(!showQR);
              setShowScanner(false);
            }}
            className="flex-1 bg-[#F5F5DC]/10 border border-[#F5F5DC]/50 text-[#F5F5DC] font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/20 transition-all text-sm flex items-center justify-center gap-2"
          >
            {showQR ? 'Hide My QR' : '📱 Share My Access (QR)'}
          </button>
          <button
            onClick={() => {
              setShowScanner(!showScanner);
              setShowQR(false);
            }}
            className="flex-1 bg-blue-600/20 border border-blue-500/50 text-blue-400 font-bold py-2 px-4 rounded-lg hover:bg-blue-600/30 transition-all text-sm flex items-center justify-center gap-2"
          >
            {showScanner ? 'Stop Scanning' : '📷 Scan Colleague QR'}
          </button>
        </div>

        {showQR && state.localPeerId && (
          <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl mt-2 animate-in fade-in zoom-in duration-300">
            <QRCodeSVG value={state.localPeerId} size={200} level="H" includeMargin={true} />
            <p className="text-black text-[10px] font-mono mt-4 opacity-50">{state.localPeerId}</p>
            <p className="text-black text-xs font-bold mt-1 text-center">
              Scan this from another device to link as a collaborator.
            </p>
          </div>
        )}

        {showScanner && (
          <div className="mt-2 rounded-lg overflow-hidden border border-blue-500/30 bg-black/40">
            <div id="p2p-qr-reader" className="w-full"></div>
            <p className="p-3 text-center text-xs text-blue-300 italic">Point your camera at a colleague's QR code.</p>
          </div>
        )}

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
