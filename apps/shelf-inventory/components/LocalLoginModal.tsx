import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

interface LocalLoginModalProps {
  onClose: () => void;
  onSwitchToSignup: () => void;
  onSwitchToRecovery?: () => void;
}

const LocalLoginModal: React.FC<LocalLoginModalProps> = ({ onClose, onSwitchToSignup, onSwitchToRecovery }) => {
  const { loginLocal, loginAsGuest } = useAuth();
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError(t('auth.fillAllFields'));
      return;
    }

    setLoading(true);

    try {
      await loginLocal(email, password);
      onClose();
    } catch (err: any) {
      setError(err.message || t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] p-6 rounded-lg max-w-md w-full m-4 animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-4 text-[#F5F5DC]">{t('auth.loginToLocalAccount')}</h2>

        <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 mb-4">
          <p className="text-blue-200 text-xs">
            💾 <strong>Local Account:</strong> Login to your device-stored account.
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
            {loading ? t('auth.loggingIn') : t('auth.login')}
          </button>
        </form>

        {onSwitchToRecovery && (
          <div className="mt-3 text-center space-y-1">
            <button
              onClick={onSwitchToRecovery}
              className="block w-full text-[#F5F5DC]/70 hover:text-[#F5F5DC] text-sm"
            >
              🔑 Recover with seed phrase
            </button>
          </div>
        )}

        <div className="mt-4 text-center space-y-3">
          <button onClick={onSwitchToSignup} className="block w-full text-[#F5F5DC]/70 hover:text-[#F5F5DC] text-sm">
            {t('auth.noAccount')} <span className="underline">{t('auth.createAccount')}</span>
          </button>
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-[#F5F5DC]/10" />
            <span className="text-[10px] text-[#F5F5DC]/30 uppercase font-bold tracking-widest">{t('auth.or')}</span>
            <div className="flex-1 h-px bg-[#F5F5DC]/10" />
          </div>
          <button
            onClick={async () => {
              await loginAsGuest();
              onClose();
            }}
            className="text-[#F5F5DC]/60 hover:text-[#F5F5DC] text-xs transition-colors"
          >
            {t('auth.loginGuest')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocalLoginModal;
