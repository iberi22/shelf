import { useState } from 'react';
import { createPortal } from 'react-dom';
import { localAuthManager } from '../lib/localAuth';
import { stringToSeed, validateSeed } from '../lib/seedGenerator';

interface AccountRecoveryModalProps {
  onClose: () => void;
  onRecovered: () => void;
  onSwitchToLogin: () => void;
}

type Step = 'method' | 'seed-input' | 'new-password' | 'success';

const AccountRecoveryModal: React.FC<AccountRecoveryModalProps> = ({ onClose, onRecovered, onSwitchToLogin }) => {
  const [step, setStep] = useState<Step>('method');
  const [email, setEmail] = useState('');
  const [seedInput, setSeedInput] = useState('');
  const [seedWords, setSeedWords] = useState<string[]>(Array(12).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputMode, setInputMode] = useState<'words' | 'paste'>('words');

  const handleSeedWordChange = (index: number, value: string) => {
    const updated = [...seedWords];
    updated[index] = value.trim().toLowerCase();
    setSeedWords(updated);
  };

  const handlePasteInput = (value: string) => {
    setSeedInput(value);
    // Auto-split pasted text into words
    const words = value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (words.length <= 12) {
      const padded = [...words, ...Array(12 - words.length).fill('')];
      setSeedWords(padded);
    }
  };

  const getActiveSeed = (): string[] => {
    if (inputMode === 'paste') {
      return stringToSeed(seedInput);
    }
    return seedWords.map((w) => w.trim().toLowerCase());
  };

  const handleValidateSeed = () => {
    setError('');
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    const seed = getActiveSeed();
    if (!validateSeed(seed)) {
      setError('Invalid recovery seed. Please check all 12 words are correct.');
      return;
    }
    setStep('new-password');
  };

  const handleRecover = async () => {
    setError('');
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const seed = getActiveSeed();
      await localAuthManager.recoverFromSeed(seed, newPassword, email);
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Recovery failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderMethodStep = () => (
    <>
      <h2 className="text-2xl font-bold mb-2 text-foreground">🔑 Recover Account</h2>
      <p className="text-foreground/60 text-sm mb-6">
        Enter your email and recovery seed to restore access to your account on this device.
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1 text-foreground">Account Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 bg-surface border border-foreground/30 rounded-md text-foreground"
          placeholder="your@email.com"
        />
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setInputMode('words')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            inputMode === 'words'
              ? 'bg-foreground text-surface'
              : 'bg-foreground/10 text-foreground/70 hover:bg-foreground/20'
          }`}
        >
          Word by Word
        </button>
        <button
          onClick={() => setInputMode('paste')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            inputMode === 'paste'
              ? 'bg-foreground text-surface'
              : 'bg-foreground/10 text-foreground/70 hover:bg-foreground/20'
          }`}
        >
          Paste All Words
        </button>
      </div>

      {inputMode === 'words' ? (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {seedWords.map((word, index) => (
            <div key={index} className="flex items-center gap-1">
              <span className="text-foreground/40 text-xs font-mono w-5 shrink-0">{index + 1}.</span>
              <input
                type="text"
                value={word}
                onChange={(e) => handleSeedWordChange(index, e.target.value)}
                className="w-full p-1.5 bg-surface border border-foreground/20 rounded text-foreground text-sm font-mono"
                placeholder={`word ${index + 1}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <textarea
            value={seedInput}
            onChange={(e) => handlePasteInput(e.target.value)}
            className="w-full p-3 bg-surface border border-foreground/30 rounded-md text-foreground font-mono text-sm h-24 resize-none"
            placeholder="Paste your 12 recovery words separated by spaces..."
          />
          {seedInput && (
            <p className="text-xs text-foreground/50 mt-1">{stringToSeed(seedInput).length} / 12 words detected</p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3 mb-4">
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleValidateSeed}
        className="w-full bg-foreground text-surface font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors"
      >
        Verify Seed →
      </button>
    </>
  );

  const renderNewPasswordStep = () => (
    <>
      <button
        onClick={() => setStep('method')}
        className="text-foreground/50 hover:text-foreground text-sm mb-4 flex items-center gap-1"
      >
        ← Back
      </button>
      <h2 className="text-2xl font-bold mb-2 text-foreground">✅ Seed Verified</h2>
      <p className="text-foreground/60 text-sm mb-6">Your seed is valid. Set a new password for this device.</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full p-2 bg-surface border border-foreground/30 rounded-md text-foreground"
            placeholder="••••••••"
          />
          <p className="text-xs text-foreground/50 mt-1">Minimum 6 characters</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full p-2 bg-surface border border-foreground/30 rounded-md text-foreground"
            placeholder="••••••••"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3 mt-4">
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleRecover}
        disabled={loading}
        className="w-full mt-6 bg-foreground text-surface font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Recovering...' : 'Recover Account'}
      </button>
    </>
  );

  const renderSuccessStep = () => (
    <div className="text-center py-4">
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold mb-2 text-foreground">Account Recovered!</h2>
      <p className="text-foreground/60 text-sm mb-6">Your account has been successfully restored on this device.</p>
      <button
        onClick={onRecovered}
        className="w-full bg-foreground text-surface font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors"
      >
        Continue to App
      </button>
    </div>
  );

  const content = (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="bg-surface-alt p-6 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto m-4 animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'method' && renderMethodStep()}
        {step === 'new-password' && renderNewPasswordStep()}
        {step === 'success' && renderSuccessStep()}

        {step !== 'success' && (
          <div className="mt-4 text-center">
            <button onClick={onSwitchToLogin} className="text-foreground/50 hover:text-foreground text-xs">
              Back to login
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default AccountRecoveryModal;
