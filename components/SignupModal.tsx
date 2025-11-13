import type React from 'react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import Modal from './Modal';

interface SignupModalProps {
  onClose: () => void;
  onSwitchToLogin: () => void;
}

const getAuthErrorMessageKey = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'auth.error.email-in-use';
    case 'auth/weak-password':
      return 'auth.error.weak-password';
    default:
      console.warn('Unhandled signup error code:', errorCode);
      return 'auth.error.generic';
  }
};

const SignupModal: React.FC<SignupModalProps> = ({ onClose, onSwitchToLogin }) => {
  const { t } = useI18n();
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await signup(email, password);
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
    <Modal isOpen={true} onClose={onClose} title={t('auth.signupTitle')}>
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
        <input
          type="password"
          placeholder={t('auth.confirmPasswordPlaceholder')}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95 disabled:bg-opacity-50"
        >
          {isLoading ? t('auth.loading') : t('auth.signup')}
        </button>
        <p className="text-center text-sm text-[#F5F5DC]/70">
          {t('auth.hasAccount')}{' '}
          <button type="button" onClick={onSwitchToLogin} className="font-bold text-[#F5F5DC] hover:underline">
            {t('auth.login')}
          </button>
        </p>
      </form>
    </Modal>
  );
};

export default SignupModal;
