import type React from 'react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

const LockScreen: React.FC = () => {
  const { t } = useI18n();
  const { hasBiometricLock, unlockApp, unlockWithBiometrics } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await unlockApp(pin);
    if (!success) {
      setError(true);
      setPin('');
      setTimeout(() => setError(false), 500);
    }
  };

  const MAX_PIN_LENGTH = 8;

  const handleNumberClick = (num: string) => {
    if (pin.length < MAX_PIN_LENGTH) {
      setPin((prev) => prev + num);
      setError(false);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleBiometricUnlock = async () => {
    const success = await unlockWithBiometrics();
    if (!success) {
      setError(true);
      setTimeout(() => setError(false), 500);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-background flex flex-col items-center justify-center p-6">
      <div className={`w-full max-w-sm transition-transform duration-200 ${error ? 'animate-shake' : ''}`}>
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-foreground/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-foreground/20">
            <span className="text-4xl">🔐</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground">{t('auth.lockedTitle') || 'Aplicación Bloqueada'}</h2>
          <p className="text-foreground/60 mt-2">
            {t('auth.lockedDescription') || 'Ingresa tu PIN o Contraseña para continuar'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="app-lock-password" className="sr-only">
            ContraseÃ±a o PIN
          </label>
          <input
            id="app-lock-password"
            data-testid="app-lock-password-input"
            type="password"
            autoComplete="current-password"
            value={pin}
            onChange={(event) => {
              setPin(event.target.value);
              setError(false);
            }}
            placeholder="ContraseÃ±a o PIN"
            className="mb-6 w-full rounded-xl border border-foreground/20 bg-surface-alt px-4 py-3 text-center text-foreground placeholder:text-foreground/35 focus:border-foreground/50 focus:outline-none"
          />

          <div className="flex justify-center gap-3 mb-10 flex-wrap">
            {[...Array(Math.max(6, pin.length))].map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                  pin.length > i ? 'bg-foreground border-foreground scale-110' : 'border-foreground/30'
                } ${error ? 'border-red-500 bg-red-500' : ''}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-[280px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleNumberClick(num)}
                className="w-16 h-16 rounded-full bg-surface-alt text-2xl font-bold text-foreground hover:bg-foreground/10 active:scale-90 transition-all flex items-center justify-center border border-foreground/5"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin('')}
              className="w-16 h-16 rounded-full flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors"
            >
              ✕
            </button>
            <button
              type="button"
              onClick={() => handleNumberClick('0')}
              className="w-16 h-16 rounded-full bg-surface-alt text-2xl font-bold text-foreground hover:bg-foreground/10 active:scale-90 transition-all flex items-center justify-center border border-foreground/5"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="w-16 h-16 rounded-full flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors"
            >
              ⌫
            </button>
          </div>

          <button
            type="submit"
            className="w-full mt-10 bg-foreground text-background font-bold py-4 rounded-xl hover:bg-opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={pin.length === 0}
          >
            {t('auth.unlock') || 'Desbloquear'}
          </button>
          {hasBiometricLock && (
            <button
              type="button"
              data-testid="biometric-unlock-button"
              onClick={handleBiometricUnlock}
              className="mt-3 w-full rounded-xl border border-foreground/20 py-3 font-bold text-foreground transition-colors hover:bg-foreground/10 active:scale-[0.98]"
            >
              Usar huella digital
            </button>
          )}
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}</style>
    </div>
  );
};

export default LockScreen;
