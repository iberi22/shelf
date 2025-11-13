import type React from 'react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import Modal from './Modal';

interface LoginModalProps {
  onClose: () => void;
  onSwitchToSignup: () => void;
}

const getAuthErrorMessageKey = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'auth.error.invalid-credential';
    default:
      console.warn('Unhandled login error code:', errorCode);
      return 'auth.error.generic';
  }
};

const LoginModal: React.FC<LoginModalProps> = ({ onClose, onSwitchToSignup }) => {
  const { t } = useI18n();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      onClose();
    } catch (err: any) {
      const errorCode = err.code || '';
      setError(t(getAuthErrorMessageKey(errorCode)));
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={t('auth.loginTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <input
          type="email"
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md"
        />
        <input
          type="password"
          placeholder={t('auth.passwordPlaceholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95 disabled:bg-opacity-50"
        >
          {isLoading ? t('auth.loading') : t('auth.login')}
        </button>
        <p className="text-center text-sm text-[#F5F5DC]/70">
          {t('auth.noAccount')}{' '}
          <button type="button" onClick={onSwitchToSignup} className="font-bold text-[#F5F5DC] hover:underline">
            {t('auth.signup')}
          </button>
        </p>
      </form>
    </Modal>
  );
};

export default LoginModal;
