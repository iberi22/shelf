import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

interface LocalSignupModalProps {
  onClose: () => void;
  onSwitchToLogin: () => void;
}

const LocalSignupModal: React.FC<LocalSignupModalProps> = ({ onClose, onSwitchToLogin }) => {
  const { createLocalAccount } = useAuth();
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Seed display state
  const [seed, setSeed] = useState<string[] | null>(null);
  const [seedConfirmed, setSeedConfirmed] = useState(false);
  const [showSeed, setShowSeed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!email || !password) {
      setError(t('auth.fillAllFields'));
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const result = await createLocalAccount(email, password);
      setSeed(result.seed);
      setShowSeed(true);
    } catch (err: any) {
      setError(err.message || t('auth.signupError'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSeed = () => {
    if (seedConfirmed) {
      onClose();
    }
  };

  const copySeedToClipboard = () => {
    if (seed) {
      navigator.clipboard.writeText(seed.join(' '));
      alert('Recovery seed copied to clipboard!');
    }
  };

  if (showSeed && seed) {
    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in"
        onClick={onClose}
      >
        <div
          className="bg-[#1a1a1a] p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4 animate-modal-enter"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-2xl font-bold mb-4 text-[#F5F5DC]">🔑 Your Recovery Seed</h2>

          <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4 mb-4">
            <p className="text-yellow-200 text-sm mb-2">
              ⚠️ <strong>IMPORTANT:</strong> Write down these 12 words and keep them safe!
            </p>
            <p className="text-yellow-200/80 text-xs">
              This is the ONLY way to recover your account if you lose access to this device. We cannot recover it for
              you.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6 bg-[#121212] p-4 rounded-lg">
            {seed.map((word, index) => (
              <div key={index} className="flex items-center gap-2 bg-[#1a1a1a] p-2 rounded">
                <span className="text-[#F5F5DC]/50 text-xs font-mono">{index + 1}.</span>
                <span className="text-[#F5F5DC] font-mono font-bold">{word}</span>
              </div>
            ))}
          </div>

          <button
            onClick={copySeedToClipboard}
            className="w-full bg-blue-600/20 border border-blue-500/50 text-blue-400 font-bold py-2 px-4 rounded-lg hover:bg-blue-600/30 transition-all mb-4"
          >
            📋 Copy to Clipboard
          </button>

          <div className="flex items-start gap-3 mb-6 bg-[#121212] p-4 rounded-lg">
            <input
              type="checkbox"
              id="seed-confirm"
              checked={seedConfirmed}
              onChange={(e) => setSeedConfirmed(e.target.checked)}
              className="mt-1"
            />
            <label htmlFor="seed-confirm" className="text-[#F5F5DC] text-sm cursor-pointer">
              I have written down my recovery seed and understand that I will lose access to my account if I lose both
              this device and my recovery seed.
            </label>
          </div>

          <button
            onClick={handleConfirmSeed}
            disabled={!seedConfirmed}
            className={`w-full font-bold py-3 px-4 rounded-lg transition-all ${
              seedConfirmed
                ? 'bg-[#F5F5DC] text-[#121212] hover:bg-opacity-80'
                : 'bg-[#F5F5DC]/20 text-[#F5F5DC]/40 cursor-not-allowed'
            }`}
          >
            ✓ I've Saved My Seed - Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] p-6 rounded-lg max-w-md w-full m-4 animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-4 text-[#F5F5DC]">{t('auth.createLocalAccount')}</h2>

        <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 mb-4">
          <p className="text-blue-200 text-xs">
            💾 <strong>Local Account:</strong> Your data stays on your device. No cloud, no tracking, 100% private.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-[#F5F5DC]">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-[#F5F5DC]"
              placeholder="your@email.com"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-[#F5F5DC]">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-[#F5F5DC]"
              placeholder="••••••••"
              disabled={loading}
            />
            <p className="text-xs text-[#F5F5DC]/50 mt-1">Minimum 6 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-[#F5F5DC]">{t('auth.confirmPassword')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-[#F5F5DC]"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('auth.creatingAccount') : t('auth.createAccount')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={onSwitchToLogin} className="text-[#F5F5DC]/70 hover:text-[#F5F5DC] text-sm">
            {t('auth.alreadyHaveAccount')} <span className="underline">{t('auth.login')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocalSignupModal;
