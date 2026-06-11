import { useState } from 'react';
import { localAuthManager } from '../lib/localAuth';
import { p2pManager } from 'p2p-mesh-core';

interface RecoveryRequest {
  requestId: string;
  email: string;
  deviceName: string;
  fromPeerId: string;
}

interface RecoveryApprovalModalProps {
  request: RecoveryRequest;
  onClose: () => void;
}

const RecoveryApprovalModal: React.FC<RecoveryApprovalModalProps> = ({ request, onClose }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<'approved' | 'denied' | null>(null);

  const handleApprove = async () => {
    setError('');
    if (!password || password.length < 6) {
      setError('Enter your account password to authorize this request');
      return;
    }

    setLoading(true);
    try {
      // Get the recovery seed using the master device's password
      const seedWords = await localAuthManager.getRecoverySeed(password);
      const seedString = seedWords.join(' ');

      // Send the encrypted seed — we use the password as the temp key so the
      // receiving device can decrypt it after the user sets a new password.
      // The seed is already encrypted in localAuth; here we send the raw seed
      // string encrypted with the master password as the shared secret.
      const { encryptDataLegacy } = await import('p2p-mesh-core');
      const encryptedSeed = await encryptDataLegacy(seedString, password, request.email);

      p2pManager.approveRecovery(request.fromPeerId, request.requestId, encryptedSeed, password);
      setDone('approved');
    } catch (_err) {
      setError('Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = () => {
    p2pManager.denyRecovery(request.fromPeerId, request.requestId, 'Request denied by account owner');
    setDone('denied');
  };

  if (done === 'approved') {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] animate-fade-in">
        <div className="bg-[#1a1a1a] p-6 rounded-lg max-w-sm w-full m-4 animate-modal-enter text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="text-lg font-bold text-[#F5F5DC] mb-2">Recovery Approved</h3>
          <p className="text-[#F5F5DC]/60 text-sm mb-4">
            The recovery data has been sent to <strong>{request.deviceName}</strong>.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (done === 'denied') {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] animate-fade-in">
        <div className="bg-[#1a1a1a] p-6 rounded-lg max-w-sm w-full m-4 animate-modal-enter text-center">
          <div className="text-4xl mb-3">🚫</div>
          <h3 className="text-lg font-bold text-[#F5F5DC] mb-2">Request Denied</h3>
          <p className="text-[#F5F5DC]/60 text-sm mb-4">The recovery request has been rejected.</p>
          <button
            onClick={onClose}
            className="w-full bg-[#F5F5DC]/10 border border-[#F5F5DC]/30 text-[#F5F5DC] font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/20 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] animate-fade-in">
      <div
        className="bg-[#1a1a1a] p-6 rounded-lg max-w-sm w-full m-4 animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">🔔</div>
          <h3 className="text-lg font-bold text-[#F5F5DC]">Account Recovery Request</h3>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 mb-4">
          <p className="text-yellow-200 text-sm">
            <strong>{request.deviceName}</strong> is requesting access to:
          </p>
          <p className="text-yellow-300 font-mono text-sm mt-1">{request.email}</p>
        </div>

        <p className="text-[#F5F5DC]/60 text-xs mb-4">
          If this is you on another device, enter your password to authorize. If you don't recognize this request, deny
          it.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1 text-[#F5F5DC]">Your Account Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-[#F5F5DC]"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3 mb-4">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleDeny}
            className="flex-1 bg-red-900/30 border border-red-600/50 text-red-300 font-bold py-2 px-4 rounded-lg hover:bg-red-900/50 transition-colors"
          >
            Deny
          </button>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors disabled:opacity-50"
          >
            {loading ? 'Approving...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecoveryApprovalModal;
