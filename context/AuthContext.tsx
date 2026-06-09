import type React from 'react';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { type DeviceInfo, localAuthManager } from '../lib/localAuth';
import type { User } from '../types';
import { useI18n } from './I18nContext';
import { useUI } from './UIContext';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  isLocked: boolean;
  hasAppLock: boolean;
  unlockApp: (pin: string) => Promise<boolean>;
  setAppLock: (pin: string | null) => Promise<void>;
  isLocalAccount: boolean;
  getAuthorizedDevices: () => DeviceInfo[];
  revokeDevice: (deviceId: string) => void;
  loginLocal: (email: string, password: string) => Promise<void>;
  createLocalAccount: (email: string, password: string) => Promise<{ seed: string[] }>;
}

const hashPin = async (pin: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showLoading, hideLoading } = useUI();
  const { t } = useI18n();
  const [isLocked, setIsLocked] = useState(false);
  const [appLockPin, setAppLockPin] = useState<string | null>(localStorage.getItem('appLockPin'));

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);

      // Check for guest user in localStorage first
      const guestUser = localStorage.getItem('guest_user');
      if (guestUser) {
        setUser(JSON.parse(guestUser));
        if (appLockPin) setIsLocked(true);
        setIsLoading(false);
        return;
      }

      const currentUser = localAuthManager.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
      } else {
        setUser(null);
      }

      if (appLockPin) setIsLocked(true);
      setIsLoading(false);
    };

    initAuth();
  }, [appLockPin]);

  const login = async (email: string, password: string) => {
    const loggedUser = await localAuthManager.login(email, password);
    setUser(loggedUser);
  };

  const signup = async (email: string, password: string) => {
    const { user: newUser } = await localAuthManager.createAccount(email, password);
    setUser(newUser);
  };

  const loginAsGuest = async () => {
    const guestUser: User = {
      uid: `guest_${Date.now()}`,
      email: null,
      subscriptionTier: 'pyme', // Guests get full access for offline demo
      isGuest: true,
    };
    localStorage.setItem('guest_user', JSON.stringify(guestUser));
    setUser(guestUser);
  };

  const logout = async () => {
    showLoading(t('auth.loggingOut'));
    if (user?.isGuest) {
      localStorage.removeItem('guest_user');
    } else {
      localAuthManager.logout();
    }
    setUser(null);
    hideLoading();
  };

  const getIdToken = async (): Promise<string | null> => {
    if (user?.isGuest) return 'guest-token';
    const currentUser = localAuthManager.getCurrentUser();
    if (!currentUser) return null;
    return 'local-token-not-needed';
  };

  const unlockApp = async (pin: string): Promise<boolean> => {
    if (!appLockPin) return true;
    const hashedInput = await hashPin(pin);

    // Support legacy plain-text pins for one-time migration
    if (hashedInput === appLockPin || pin === appLockPin) {
      if (pin === appLockPin && pin.length !== 64) {
        await setAppLock(pin);
      }
      setIsLocked(false);
      return true;
    }
    return false;
  };

  const setAppLock = async (pin: string | null) => {
    if (pin) {
      const hashedPin = pin.length === 64 ? pin : await hashPin(pin);
      localStorage.setItem('appLockPin', hashedPin);
      setAppLockPin(hashedPin);
      setIsLocked(true);
    } else {
      localStorage.removeItem('appLockPin');
      setAppLockPin(null);
      setIsLocked(false);
    }
  };

  const isLocalAccount = user !== null && !user.isGuest;

  const getAuthorizedDevices = () => {
    return localAuthManager.getAuthorizedDevices();
  };

  const revokeDevice = (deviceId: string) => {
    localAuthManager.revokeDevice(deviceId);
  };

  const loginLocal = login;

  const createLocalAccount = async (email: string, password: string) => {
    const { user: newUser, seed } = await localAuthManager.createAccount(email, password);
    setUser(newUser);
    return { seed };
  };

  const value = {
    user,
    isLoading,
    login,
    signup,
    loginAsGuest,
    logout,
    getIdToken,
    isLocked,
    hasAppLock: !!appLockPin,
    unlockApp,
    setAppLock,
    isLocalAccount,
    getAuthorizedDevices,
    revokeDevice,
    loginLocal,
    createLocalAccount,
  };

  return (
    <AuthContext.Provider value={value}>{!isLoading ? children : null /* Or a global loader */}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
