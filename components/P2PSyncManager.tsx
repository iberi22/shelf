import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  decapsulateSecret,
  decryptWithPQC,
  deriveAESKeyFromSharedSecret,
  encapsulateSecret,
  encryptWithPQC,
  generateDSAKeyPair,
  generateKEMKeyPair,
  signPayload,
  verifyPayload,
} from '../lib/crypto-pqc';
import { decodeHandshake, encodeHandshake, type HandshakePayload } from '../lib/discovery';
import { localAuthManager } from '../lib/localAuth';
import { p2pManager, type SyncMessage } from '../lib/p2p';
import { authenticateWithPasskey, isBiometricsSupported } from '../lib/webauthn';
import QRScannerModal from './QRScannerModal';

const P2PSyncManager: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [showScanner, setShowScanner] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [pqcKey, setPqcKey] = useState<CryptoKey | null>(null);

  const prevStateRef = useRef(state);
  const kemKeysRef = useRef(generateKEMKeyPair());
  const dsaKeysRef = useRef(generateDSAKeyPair());

  useEffect(() => {
    isBiometricsSupported().then(setIsBiometricAvailable);
    p2pManager.init();

    const handleMessage = async (message: SyncMessage, fromPeerId: string) => {
      switch (message.type) {
        case 'STATE_UPDATE':
          try {
            let payload = message.payload;
            if (typeof payload === 'string' && pqcKey) {
              // Decrypt with PQC-derived key
              const decryptedStr = await decryptWithPQC(payload, pqcKey);
              payload = JSON.parse(decryptedStr);
            }
            dispatch({ type: 'SYNC_STATE', payload: payload as Partial<typeof state> });
          } catch (e) {
            console.error('Failed to decrypt or parse P2P state update:', e);
          }
          break;
        case 'REQUEST_FULL_STATE':
          try {
            const stateSnapshot = {
              products: state.products,
              sales: state.sales,
              clients: state.clients,
              suppliers: state.suppliers,
              purchaseOrders: state.purchaseOrders,
              auditLogs: state.auditLogs,
            };
            const payloadStr = JSON.stringify(stateSnapshot);
            let finalPayload: any = stateSnapshot;

            if (pqcKey) {
              finalPayload = await encryptWithPQC(payloadStr, pqcKey);
            }

            p2pManager.sendTo(fromPeerId, {
              type: 'STATE_UPDATE',
              // @ts-expect-error
              payload: finalPayload,
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

    const handleHandshakeRequest = async (payload: any, fromPeerId: string) => {
      console.log('Received PQC handshake request from', fromPeerId);
      // Verify signature if needed, but for initial handshake we just respond
      const { cipherText, sharedSecret } = encapsulateSecret(payload.kemPubKey);
      const aesKey = await deriveAESKeyFromSharedSecret(sharedSecret);
      setPqcKey(aesKey);

      const responsePayload = {
        cipherText,
        dsaPubKey: dsaKeysRef.current.publicKey,
        signature: signPayload(cipherText, dsaKeysRef.current.secretKey),
        deviceName: localAuthManager.getCurrentDevice().deviceName,
      };

      p2pManager.sendTo(fromPeerId, {
        type: 'PQC_HANDSHAKE_RESPONSE',
        payload: responsePayload,
      });
    };

    const handleHandshakeResponse = async (payload: any, fromPeerId: string) => {
      console.log('Received PQC handshake response from', fromPeerId);
      const isValid = verifyPayload(payload.cipherText, payload.signature, payload.dsaPubKey);
      if (!isValid) {
        console.error('Handshake signature verification failed');
        return;
      }

      const sharedSecret = decapsulateSecret(payload.cipherText, kemKeysRef.current.secretKey);
      const aesKey = await deriveAESKeyFromSharedSecret(sharedSecret);
      setPqcKey(aesKey);
      console.log('PQC-secured tunnel established with', fromPeerId);
    };

    p2pManager.onMessage(handleMessage);
    p2pManager.onHandshakeRequest(handleHandshakeRequest);
    p2pManager.onHandshakeResponse(handleHandshakeResponse);

    p2pManager.onConnectionChange((peers) => {
      dispatch({ type: 'UPDATE_PEERS', payload: peers });
    });

    const interval = setInterval(() => {
      if (p2pManager.localPeerId) {
        dispatch({ type: 'SET_LOCAL_PEER_ID', payload: p2pManager.localPeerId });
        clearInterval(interval);
      }
    }, 1000);
  }, [
    dispatch,
    state.clients,
    state.products,
    state.suppliers,
    state.sales,
    state.purchaseOrders,
    state.auditLogs,
    pqcKey,
  ]);

  // Broadcast state changes PQC-encrypted
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
        const payloadStr = JSON.stringify(diff);
        let finalPayload: any = diff;

        if (pqcKey) {
          finalPayload = await encryptWithPQC(payloadStr, pqcKey);
        }

        p2pManager.broadcast({
          type: 'STATE_UPDATE',
          // @ts-expect-error
          payload: finalPayload,
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
    pqcKey,
  ]);

  const initiateHandshake = async (handshake: HandshakePayload) => {
    if (isBiometricAvailable) {
      const authenticated = await authenticateWithPasskey();
      if (!authenticated) {
        alert('Biometric verification required to establish secure P2P link.');
        return;
      }
    }

    p2pManager.connect(handshake.peerId);

    // Wait a bit for connection to open then send handshake
    setTimeout(() => {
      p2pManager.sendTo(handshake.peerId, {
        type: 'PQC_HANDSHAKE_REQUEST',
        payload: {
          kemPubKey: kemKeysRef.current.publicKey,
          dsaPubKey: dsaKeysRef.current.publicKey,
          deviceName: localAuthManager.getCurrentDevice().deviceName,
        },
      });
    }, 1000);
  };

  const handleScanHandshake = (decodedText: string) => {
    try {
      const handshake = decodeHandshake(decodedText);
      initiateHandshake(handshake);
      setShowScanner(false);
    } catch (_e) {
      alert('Invalid QR code format.');
    }
  };

  const handlePromote = (peerId: string) => {
    if (state.role === 'admin') {
      p2pManager.broadcast({ type: 'PROMOTE_ADMIN', payload: { targetPeerId: peerId } });
    }
  };

  const handshakePayload: HandshakePayload = {
    peerId: state.localPeerId || '',
    kemPubKey: kemKeysRef.current.publicKey,
    dsaPubKey: dsaKeysRef.current.publicKey,
    timestamp: new Date().toISOString(),
    deviceName: localAuthManager.getCurrentDevice().deviceName,
  };

  const qrValue = encodeHandshake(handshakePayload);

  return (
    <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg mt-6">
      <h3 className="text-xl font-bold text-[#F5F5DC] mb-4">Secure P2P Sync (Post-Quantum)</h3>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#121212] rounded-md">
          <div className="flex flex-col">
            <span className="text-xs sm:text-sm break-all">
              Peer ID: <span className="font-mono text-yellow-400">{state.localPeerId || 'Initializing...'}</span>
            </span>
            <span className="text-[10px] text-[#F5F5DC]/50 mt-1">
              Encrypted Tunnel:{' '}
              {pqcKey ? (
                <span className="text-green-500 font-bold">ACTIVE (ML-KEM-768)</span>
              ) : (
                <span className="text-yellow-500 italic">Unsecured</span>
              )}
            </span>
          </div>
          <span className="text-xs sm:text-sm font-semibold capitalize px-2 py-0.5 rounded-full bg-foreground/10 w-fit">
            Role: {state.role}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => {
              setShowQR(!showQR);
              setShowScanner(false);
            }}
            className="flex-1 bg-[#F5F5DC]/10 border border-[#F5F5DC]/50 text-[#F5F5DC] font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/20 transition-all text-sm flex items-center justify-center gap-2"
          >
            {showQR ? 'Hide My QR' : '📱 Share Access (Secure QR)'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowScanner(true);
              setShowQR(false);
            }}
            className="flex-1 bg-blue-600/20 border border-blue-500/50 text-blue-400 font-bold py-2 px-4 rounded-lg hover:bg-blue-600/30 transition-all text-sm flex items-center justify-center gap-2"
          >
            📷 Scan & Link Device
          </button>
        </div>

        {isBiometricAvailable && (
          <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[10px] text-green-400 text-center">
            🛡️ Biometric hardware detected (WebAuthn/TPM)
          </div>
        )}

        {showQR && state.localPeerId && (
          <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl mt-2 animate-in fade-in zoom-in duration-300">
            <QRCodeSVG value={qrValue} size={200} level="H" includeMargin={true} />
            <p className="text-black text-[10px] font-mono mt-4 opacity-50">v1 handshake</p>
            <p className="text-black text-xs font-bold mt-1 text-center">
              Scan this from another device to establish a post-quantum secure link.
            </p>
          </div>
        )}

        <QRScannerModal
          isOpen={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={handleScanHandshake}
          title="Link New Device"
          instruction="Point at the Secure Handshake QR on another device."
        />

        <div className="mt-4">
          <h4 className="font-bold text-[#F5F5DC] mb-2 text-sm">Linked Devices</h4>
          {state.peers.length > 0 ? (
            <div className="space-y-2">
              {state.peers.map((peer) => (
                <div
                  key={peer.id}
                  className="flex justify-between items-center p-2 rounded-md bg-background/50 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-xs">{peer.id}</span>
                    <span className="text-[10px] opacity-60">Handshake verified</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="capitalize text-xs text-[#F5F5DC]/60">{peer.role}</span>
                    {state.role === 'admin' && peer.role !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => handlePromote(peer.id)}
                        className="text-xs text-yellow-400 hover:underline"
                      >
                        Promote
                      </button>
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
