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
    onAuthStateChanged: (callback: (user: null) => void) => {
      // Immediately call back with a null user to signify a logged-out state.
      callback(null);
      // Return a dummy unsubscribe function.
      return () => {};
    },
    signInWithEmailAndPassword: () => Promise.reject(new Error('Firebase not configured.')),
    createUserWithEmailAndPassword: () => Promise.reject(new Error('Firebase not configured.')),
    signOut: () => Promise.resolve(),
    currentUser: null,
  };

  const mockDb = {
    collection: (_name: string) => ({
      doc: (_id: string) => ({
        get: () => Promise.resolve({ exists: false }), // Always act like a new user with no cloud data.
        set: () => Promise.reject(new Error('Firebase not configured.')),
      }),
    }),
  };

  auth = mockAuth as any;
  db = mockDb as any;
  firebaseReady = Promise.resolve(null); // Resolve immediately for local mode.
}

export { auth, db, firebaseReady };
