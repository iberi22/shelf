import type React from 'react';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { auth, db, firebaseReady } from '../firebase';
import type { User } from '../types';
import { useI18n } from './I18nContext';
import { useUI } from './UIContext';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  isLocked: boolean;
  hasAppLock: boolean;
  unlockApp: (pin: string) => Promise<boolean>;
  setAppLock: (pin: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const hashPin = async (pin: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showLoading, hideLoading } = useUI();
  const { t } = useI18n();
  const [isLocked, setIsLocked] = useState(false);
  const [appLockPin, setAppLockPin] = useState<string | null>(() => localStorage.getItem('appLockPin'));

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser: any) => {
      setIsLoading(true);
      if (firebaseUser) {
        // Check for user document in Firestore to get subscription tier
        const userDocRef = db.collection('users').doc(firebaseUser.uid);
        const docSnap = await userDocRef.get();

        if (docSnap.exists) {
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            subscriptionTier: 'pro',
          });
        } else {
          // Create a user document for new sign-ups
          const newUser: Omit<User, 'uid' | 'email'> = { subscriptionTier: 'free' };
          await userDocRef.set(newUser);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            subscriptionTier: 'pro',
          });
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    // Handle App Lock on initial load
    const savedPin = localStorage.getItem('appLockPin');
    if (savedPin) {
      setIsLocked(true);
    }

    // Wait for firebase to be ready before unsubscribing the loading state
    firebaseReady.then(() => setIsLoading(false));

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    await auth.signInWithEmailAndPassword(email, password);
  };

  const signup = async (email: string, password: string) => {
    await auth.createUserWithEmailAndPassword(email, password);
  };

  const logout = async () => {
    showLoading(t('auth.loggingOut'));
    await auth.signOut();
    hideLoading();
  };

  const getIdToken = async (): Promise<string | null> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return null;
    }
    return currentUser.getIdToken();
  };

  const unlockApp = async (pin: string): Promise<boolean> => {
    if (!appLockPin) return true;
    const hashedInput = await hashPin(pin);

    // Support legacy plain-text pins for one-time migration
    if (hashedInput === appLockPin || pin === appLockPin) {
      // If it was a legacy pin, migrate it now
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

  const value = {
    user,
    isLoading,
    login,
    signup,
    logout,
    getIdToken,
    isLocked,
    hasAppLock: !!appLockPin,
    unlockApp,
    setAppLock,
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
