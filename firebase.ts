import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// Firebase configuration from environment variables (production)
// or fallback to placeholder values (local development)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'YOUR_AUTH_DOMAIN',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'YOUR_STORAGE_BUCKET',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_MESSAGING_SENDER_ID',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'YOUR_APP_ID',
};

const isFirebaseConfigured = firebaseConfig.apiKey !== 'YOUR_API_KEY' && firebaseConfig.projectId !== 'YOUR_PROJECT_ID';

let app: firebase.app.App;
let auth: firebase.auth.Auth;
let db: firebase.firestore.Firestore;
let firebaseReady: Promise<any>;

if (isFirebaseConfigured) {
  if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
  } else {
    app = firebase.app();
  }
  auth = app.auth();
  db = app.firestore();
  firebaseReady = new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      resolve(user);
      unsubscribe();
    });
  });
} else {
  console.warn('Firebase is not configured. Running in local-only mode. All cloud features are disabled.');

  // Mock Firebase when not configured to allow the app to run without crashing.
  const mockAuth = {
    onAuthStateChanged: (callback: (user: any) => void) => {
      // Check if we have a stored mock user
      const storedUser = localStorage.getItem('shelf_mock_user');
      if (storedUser) {
        callback(JSON.parse(storedUser));
      } else {
        callback(null);
      }
      return () => {};
    },
    signInWithEmailAndPassword: (email: string, password: string) => {
      if (email === 'iberi22@gmail.com' && password === 'admin0990') {
        const user = { uid: 'local-admin', email };
        localStorage.setItem('shelf_mock_user', JSON.stringify(user));
        // Trigger auth state change manually if needed, or just reload/let the app handle it on next load
        // Since onAuthStateChanged is a listener, we can't easily trigger it from here without a real event emitter.
        // But for a simple mock, we can just reload the page or rely on the app re-rendering if we exposed a setter.
        // Better: just return resolved and let the user refresh or use a simple event system.
        // For now, let's just reload to keep it simple or assume the AuthContext will re-check?
        // AuthContext runs onAuthStateChanged on mount.
        window.location.reload();
        return Promise.resolve({ user });
      }
      return Promise.reject(new Error('Invalid credentials (Mock)'));
    },
    createUserWithEmailAndPassword: () => Promise.reject(new Error('Firebase not configured.')),
    signOut: () => {
      localStorage.removeItem('shelf_mock_user');
      window.location.reload();
      return Promise.resolve();
    },
    currentUser: null,
  };

  const mockDb = {
    collection: (_name: string) => ({
      doc: (id: string) => ({
        get: () => {
          if (id === 'local-admin') {
            return Promise.resolve({
              exists: true,
              data: () => ({ subscriptionTier: 'pro' }),
            });
          }
          return Promise.resolve({ exists: false });
        },
        set: () => Promise.resolve(),
      }),
    }),
  };

  auth = mockAuth as any;
  db = mockDb as any;
  firebaseReady = Promise.resolve(null); // Resolve immediately for local mode.
}

export { auth, db, firebaseReady };
