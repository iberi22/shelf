import { Html5QrcodeScanner } from 'html5-qrcode';
import { useEffect, useRef, useState } from 'react';
import { decryptDataLegacy as decryptData, generateUUID } from '../lib/crypto';
import { localAuthManager } from '../lib/localAuth';
import { p2pManager } from '../lib/p2p';

interface P2PRecoveryModalProps {
  onClose: () => void;
  onRecovered: () => void;
  onSwitchToSeedRecovery: () => void;
}

type Step = 'connect' | 'waiting' | 'enter-password' | 'success' | 'denied';

interface PendingRecovery {
  requestId: string;
  encryptedSeed: string;
  tempKey: string;
}

const P2PRecoveryModal: React.FC<P2PRecoveryModalProps> = ({ onClose, onRecovered, onSwitchToSeedRecovery }) => {
  const [step, setStep] = useState<Step>('connect');
  const [email, setEmail] = useState('');
  const [targetPeerId, setTargetPeerId] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deniedReason, setDeniedReason] = useState('');
  const [decryptPassword, setDecryptPassword] = useState('');
  const pendingRecovery = useRef<PendingRecovery | null>(null);
  const requestId = useRef<string>(generateUUID());

  // Initialize P2P and listen for recovery responses
  useEffect(() => {
    p2pManager.init();

    const interval = setInterval(() => {
      if (p2pManager.localPeerId) {
        setLocalPeerId(p2pManager.localPeerId);
        clearInterval(interval);
      }
    }, 500);

    // Listen for recovery responses
    const handleMessage = (message: any) => {
      if (message.type === 'RECOVERY_APPROVED' && message.payload.requestId === requestId.current) {
        pendingRecovery.current = {
          requestId: message.payload.requestId,
          encryptedSeed: message.payload.encryptedSeed,
          tempKey: message.payload.tempKey,
        };
        setStep('enter-password');
      }
      if (message.type === 'RECOVERY_DENIED' && message.payload.requestId === requestId.current) {
        setDeniedReason(message.payload.reason || 'Request was denied.');
        setStep('denied');
      }
    };

    p2pManager.onMessage(handleMessage);

    return () => clearInterval(interval);
  }, []);

  // QR scanner
  useEffect(() => {
    if (!showScanner) return;
    const scanner = new Html5QrcodeScanner('p2p-recovery-qr-reader', { fps: 10, qrbox: 250 }, false);
    scanner.render(
      (decodedText) => {
        setTargetPeerId(decodedText);
        setShowScanner(false);
        scanner.clear();
      },
      () => {},
    );
    return () => {
      scanner.clear().catch(() => {});
    };
  }, [showScanner]);

  const handleConnect = () => {
    setError('');
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!targetPeerId.trim()) {
      setError('Please enter or scan the master device Peer ID');
      return;
    }

    const device = localAuthManager.getCurrentDevice();
    p2pManager.connect(targetPeerId);

    // Give connection a moment to establish, then send request
    setTimeout(() => {
      p2pManager.sendRecoveryRequest(
        targetPeerId,
        requestId.current,
        email.trim().toLowerCase(),
        device.deviceName,
        device.deviceId,
      );
      setStep('waiting');
    }, 1500);
  };

  const handleDecryptAndRecover = async () => {
    setError('');
    if (!decryptPassword || decryptPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!pendingRecovery.current) return;

    setLoading(true);
    try {
      // Decrypt the seed using the temp key (which is the user's original password)
      const seedString = await decryptData(
        pendingRecovery.current.encryptedSeed,
        pendingRecovery.current.tempKey,
        email.trim().toLowerCase(),
      );

      // Recover account with the decrypted seed and new password
      const seedWords = seedString.trim().split(/\s+/);
      await localAuthManager.recoverFromSeed(seedWords, decryptPassword, email.trim().toLowerCase());
      setStep('success');
    } catch (_err) {
      setError('Failed to decrypt recovery data. The master device password may be incorrect.');
    } finally {
      setLoading(false);
    }
  };

  const renderConnectStep = () => (
    <>
      <h2 className="text-2xl font-bold mb-2 text-[#F5F5DC]">📡 P2P Account Recovery</h2>
      <p className="text-[#F5F5DC]/60 text-sm mb-4">
        Connect to a device that already has your account to recover access.
      </p>

      <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 mb-4">
        <p className="text-blue-200 text-xs">
          <strong>How it works:</strong> Open Shelf on your other device → Settings → P2P Sync → copy the Peer ID, then
          paste it below.
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1 text-[#F5F5DC]">Your Account Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-[#F5F5DC]"
          placeholder="your@email.com"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1 text-[#F5F5DC]">Master Device Peer ID</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={targetPeerId}
            onChange={(e) => setTargetPeerId(e.target.value)}
            className="flex-1 p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-[#F5F5DC] font-mono text-sm"
            placeholder="Peer ID from master device..."
          />
          <button
            onClick={() => setShowScanner(!showScanner)}
            className="bg-blue-600/20 border border-blue-500/50 text-blue-400 px-3 rounded-lg hover:bg-blue-600/30 transition-all text-sm"
          >
            📷
          </button>
        </div>
      </div>

      {showScanner && (
        <div className="mb-4 rounded-lg overflow-hidden border border-blue-500/30 bg-black/40">
          <div id="p2p-recovery-qr-reader" className="w-full" />
          <p className="p-2 text-center text-xs text-blue-300 italic">Scan the QR code from your master device.</p>
        </div>
      )}

      {localPeerId && (
        <div className="mb-4 bg-[#121212] rounded-lg p-3">
          <p className="text-xs text-[#F5F5DC]/50 mb-1">Your current Peer ID (share with master device if needed):</p>
          <p className="font-mono text-xs text-yellow-400 break-all">{localPeerId}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3 mb-4">
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleConnect}
        className="w-full bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors"
      >
        Send Recovery Request
      </button>
    </>
  );

  const renderWaitingStep = () => (
    <div className="text-center py-6">
      <div className="text-5xl mb-4 animate-pulse">⏳</div>
      <h2 className="text-xl font-bold mb-2 text-[#F5F5DC]">Waiting for Approval</h2>
      <p className="text-[#F5F5DC]/60 text-sm mb-6">
        A notification has been sent to your master device. Please approve the request there.
      </p>
      <div className="bg-[#121212] rounded-lg p-4 text-left mb-6">
        <p className="text-xs text-[#F5F5DC]/50 mb-1">Recovery request sent for:</p>
        <p className="text-[#F5F5DC] font-mono text-sm">{email}</p>
      </div>
      <button onClick={() => setStep('connect')} className="text-[#F5F5DC]/50 hover:text-[#F5F5DC] text-sm underline">
        Cancel and go back
      </button>
    </div>
  );

  const renderEnterPasswordStep = () => (
    <>
      <div className="text-center mb-4">
        <div className="text-4xl mb-2">🔓</div>
        <h2 className="text-xl font-bold text-[#F5F5DC]">Recovery Approved!</h2>
        <p className="text-[#F5F5DC]/60 text-sm mt-1">Set a new password for this device.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-[#F5F5DC]">New Password for This Device</label>
          <input
            type="password"
            value={decryptPassword}
            onChange={(e) => setDecryptPassword(e.target.value)}
            className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-[#F5F5DC]"
            placeholder="••••••••"
          />
          <p className="text-xs text-[#F5F5DC]/50 mt-1">Minimum 6 characters</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3 mt-4">
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleDecryptAndRecover}
        disabled={loading}
        className="w-full mt-6 bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors disabled:opacity-50"
      >
        {loading ? 'Recovering...' : 'Complete Recovery'}
      </button>
    </>
  );

  const renderDeniedStep = () => (
    <div className="text-center py-6">
      <div className="text-5xl mb-4">❌</div>
      <h2 className="text-xl font-bold mb-2 text-[#F5F5DC]">Request Denied</h2>
      <p className="text-[#F5F5DC]/60 text-sm mb-2">{deniedReason}</p>
      <div className="flex flex-col gap-3 mt-6">
        <button
          onClick={() => setStep('connect')}
          className="w-full bg-[#F5F5DC]/10 border border-[#F5F5DC]/30 text-[#F5F5DC] font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/20 transition-colors"
        >
          Try Again
        </button>
        <button
          onClick={onSwitchToSeedRecovery}
          className="w-full bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors"
        >
          Use Recovery Seed Instead
        </button>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="text-center py-6">
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold mb-2 text-[#F5F5DC]">Account Recovered!</h2>
      <p className="text-[#F5F5DC]/60 text-sm mb-6">Your account has been restored on this device via P2P.</p>
      <button
        onClick={onRecovered}
        className="w-full bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors"
      >
        Continue to App
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] p-6 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto m-4 animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'connect' && renderConnectStep()}
        {step === 'waiting' && renderWaitingStep()}
        {step === 'enter-password' && renderEnterPasswordStep()}
        {step === 'denied' && renderDeniedStep()}
        {step === 'success' && renderSuccessStep()}

        {step === 'connect' && (
          <div className="mt-4 pt-4 border-t border-[#F5F5DC]/10 text-center">
            <button onClick={onSwitchToSeedRecovery} className="text-[#F5F5DC]/50 hover:text-[#F5F5DC] text-xs">
              Use recovery seed instead →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default P2PRecoveryModal;
