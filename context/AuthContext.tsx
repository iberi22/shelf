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
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showLoading, hideLoading } = useUI();
  const { t } = useI18n();

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);

      // Check for guest user in localStorage first
      const guestUser = localStorage.getItem('guest_user');
      if (guestUser) {
        setUser(JSON.parse(guestUser));
        setIsLoading(false);
        return;
      }

      const unsubscribe = auth.onAuthStateChanged(async (firebaseUser: any) => {
        setIsLoading(true);
        if (firebaseUser) {
          try {
            // Check for user document in Firestore to get subscription tier
            const userDocRef = db.collection('users').doc(firebaseUser.uid);
            const docSnap = await userDocRef.get();

            if (docSnap.exists) {
              const userData = docSnap.data();
              setUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                subscriptionTier: userData?.subscriptionTier || 'free',
              });
            } else {
              // Create a user document for new sign-ups
              const newUser: Omit<User, 'uid' | 'email'> = { subscriptionTier: 'free' };
              await userDocRef.set(newUser);
              setUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                subscriptionTier: 'free',
              });
            }
          } catch (error) {
            console.error('Error fetching user data from Firestore:', error);
            // Fallback for offline or error
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              subscriptionTier: 'free',
            });
          }
        } else {
          setUser(null);
        }
        setIsLoading(false);
      });

      // Wait for firebase to be ready before unsubscribing the loading state
      await firebaseReady;
      setIsLoading(false);

      return unsubscribe;
    };

    let unsubscribe: (() => void) | undefined;
    initAuth().then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    await auth.signInWithEmailAndPassword(email, password);
  };

  const signup = async (email: string, password: string) => {
    await auth.createUserWithEmailAndPassword(email, password);
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
      setUser(null);
    } else {
      await auth.signOut();
    }
    hideLoading();
  };

  const getIdToken = async (): Promise<string | null> => {
    if (user?.isGuest) {
      return 'guest-token';
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return null;
    }
    return currentUser.getIdToken();
  };

  const value = { user, isLoading, login, signup, loginAsGuest, logout, getIdToken };

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
