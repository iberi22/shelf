// cloudAuth.ts - Cloud auth abstraction (Firebase Auth + Firestore) with local fallback.
//
// Design goals:
//   1. Cloud-first: every auth operation tries the Firebase cloud layer first.
//   2. Local fallback: when the cloud is unavailable/unconfigured, operations
//      degrade gracefully to the existing offline auth (localAuthManager).
//   3. Offline queue: while offline, auth operations are queued and resolved
//      automatically when connectivity returns.
//   4. Lazy Firebase: the firebase SDK is dynamically imported only when a
//      cloud operation actually runs, keeping the offline-first bundle small.
//   5. Configuration via VITE_FIREBASE_CONFIG (JSON string) env var.

import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import type { Auth, User as FirebaseUser } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { User as MeshUser } from 'p2p-mesh-core';
import { localAuthManager } from './localAuth';

// ─── Public types ────────────────────────────────────────────────────────────

export interface CloudUser {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified?: boolean;
  subscriptionTier?: 'free' | 'pro' | 'pyme';
}

/** Session user: the active identity, tagged with where it came from. */
export interface AuthSessionUser extends CloudUser {
  source: 'cloud' | 'local';
  cloudUid?: string;
  localUid?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms after which the access token must be refreshed. */
  expiresAt: number;
}

export type CloudAuthOperation =
  | { type: 'signIn'; email: string; password: string }
  | { type: 'signUp'; email: string; password: string }
  | { type: 'signOut' }
  | { type: 'sync'; reason?: string };

export interface QueuedAuthOperation {
  id: string;
  op: CloudAuthOperation;
  createdAt: number;
  resolve: (value: AuthSessionUser | null) => void;
  reject: (reason?: unknown) => void;
}

export interface SignUpResult {
  /** The active session user (cloud when reachable, local otherwise). */
  user: AuthSessionUser;
  /** Recovery seed from the local account. */
  seed: string[];
  cloud: 'created' | 'linked' | 'queued' | 'unconfigured';
  syncQueued: boolean;
}

export interface SyncResult {
  status: 'synced' | 'queued' | 'skipped' | 'unconfigured' | 'error';
  collections?: string[];
  syncedAt?: number;
  reason?: string;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Cloud is unreachable/unconfigured. Safe to fall back to local auth. */
export class CloudUnavailableError extends Error {
  readonly code: string;
  constructor(message: string, code = 'cloud-unavailable') {
    super(message);
    this.name = 'CloudUnavailableError';
    this.code = code;
  }
}

/** Cloud rejected the operation (bad credentials, duplicate email, ...). */
export class CloudAuthError extends Error {
  readonly code: string;
  constructor(message: string, code = 'cloud-auth-error') {
    super(message);
    this.name = 'CloudAuthError';
    this.code = code;
  }
}

// ─── Transport contract ──────────────────────────────────────────────────────

/**
 * Pluggable cloud backend. The default implementation talks to Firebase
 * Auth + Firestore; tests inject fakes so no SDK is needed.
 */
export interface CloudAuthTransport {
  readonly kind: string;
  isConfigured(): boolean;
  signIn(email: string, password: string): Promise<CloudUser>;
  signUp(email: string, password: string): Promise<CloudUser>;
  signOut(): Promise<void>;
  /** Current tokens without forcing a refresh. */
  getTokens(): Promise<AuthTokens>;
  /** Force a token refresh (Firebase: getIdToken(user, true)). */
  refreshToken(): Promise<AuthTokens>;
  getCurrentUser(): CloudUser | null;
  onAuthStateChanged(listener: (user: CloudUser | null) => void): () => void;
  uploadData(uid: string, collections: Record<string, unknown>, meta?: { email?: string }): Promise<void>;
  fetchData(uid: string): Promise<Record<string, unknown>>;
  ping(): Promise<boolean>;
}

// ─── Config from env ─────────────────────────────────────────────────────────

/**
 * Parse VITE_FIREBASE_CONFIG (a JSON string) into a config object.
 * Returns null when unset, malformed, or missing required fields.
 */
export function getFirebaseConfig(): FirebaseConfig | null {
  const raw: string | undefined = import.meta.env.VITE_FIREBASE_CONFIG;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FirebaseConfig>;
    if (!parsed.apiKey || !parsed.projectId) return null;
    return parsed as FirebaseConfig;
  } catch {
    return null;
  }
}

// ─── Firebase-backed transport (lazy SDK) ───────────────────────────────────

const CREDENTIAL_ERROR_CODES = new Set([
  'auth/invalid-credential',
  'auth/invalid-email',
  'auth/missing-password',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/email-already-in-use',
  'auth/user-disabled',
  'auth/too-many-requests',
  'auth/operation-not-allowed',
  'auth/weak-password',
]);

export class FirestoreCloudTransport implements CloudAuthTransport {
  readonly kind = 'firebase';
  private app?: FirebaseApp;
  private auth?: Auth;
  private db?: Firestore;
  private initError?: Error;

  constructor(private readonly config: FirebaseConfig | null) {}

  isConfigured(): boolean {
    return this.config !== null;
  }

  private async ensure(): Promise<{ auth: Auth; db: Firestore }> {
    if (this.auth && this.db) return { auth: this.auth, db: this.db };
    if (this.initError) throw this.initError;
    if (!this.config) throw new CloudUnavailableError('Firebase is not configured (set VITE_FIREBASE_CONFIG)');
    const [{ initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]);
    try {
      this.app = initializeApp(this.config as FirebaseOptions);
      this.auth = getAuth(this.app);
      this.db = getFirestore(this.app);
    } catch (err) {
      this.initError = err instanceof Error ? err : new Error(String(err));
      throw this.initError;
    }
    return { auth: this.auth, db: this.db };
  }

  private mapUser(user: FirebaseUser | null): CloudUser | null {
    if (!user) return null;
    return {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? undefined,
      emailVerified: user.emailVerified,
    };
  }

  private classifyError(err: unknown): Error {
    const code =
      typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : '';
    const message = err instanceof Error ? err.message : String(err);
    if (CREDENTIAL_ERROR_CODES.has(code)) return new CloudAuthError(message, code);
    return new CloudUnavailableError(message, code || 'cloud-error');
  }

  async signIn(email: string, password: string): Promise<CloudUser> {
    const { auth } = await this.ensure();
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const credential = await signInWithEmailAndPassword(auth, email, password);
      return this.mapUser(credential.user) ?? { uid: credential.user.uid, email };
    } catch (err) {
      throw this.classifyError(err);
    }
  }

  async signUp(email: string, password: string): Promise<CloudUser> {
    const { auth } = await this.ensure();
    try {
      const { createUserWithEmailAndPassword } = await import('firebase/auth');
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      return this.mapUser(credential.user) ?? { uid: credential.user.uid, email };
    } catch (err) {
      throw this.classifyError(err);
    }
  }

  async signOut(): Promise<void> {
    const { auth } = await this.ensure();
    try {
      const { signOut: firebaseSignOut } = await import('firebase/auth');
      await firebaseSignOut(auth);
    } catch (err) {
      throw this.classifyError(err);
    }
  }

  async getTokens(): Promise<AuthTokens> {
    const { auth } = await this.ensure();
    const user = auth.currentUser;
    if (!user) throw new CloudAuthError('No authenticated cloud user', 'no-session');
    const { getIdToken } = await import('firebase/auth');
    const accessToken = await getIdToken(user);
    return { accessToken, refreshToken: user.refreshToken ?? '', expiresAt: Date.now() + 55 * 60_000 };
  }

  async refreshToken(): Promise<AuthTokens> {
    const { auth } = await this.ensure();
    const user = auth.currentUser;
    if (!user) throw new CloudAuthError('No authenticated cloud user', 'no-session');
    const { getIdToken } = await import('firebase/auth');
    const accessToken = await getIdToken(user, true);
    return { accessToken, refreshToken: user.refreshToken ?? '', expiresAt: Date.now() + 55 * 60_000 };
  }

  getCurrentUser(): CloudUser | null {
    if (!this.auth) return null;
    return this.mapUser(this.auth.currentUser);
  }

  onAuthStateChanged(listener: (user: CloudUser | null) => void): () => void {
    let unsub: (() => void) | undefined;
    void this.ensure()
      .then(async ({ auth }) => {
        const { onAuthStateChanged: onState } = await import('firebase/auth');
        unsub = onState(auth, (user) => listener(this.mapUser(user)));
      })
      .catch(() => {});
    return () => unsub?.();
  }

  async uploadData(uid: string, collections: Record<string, unknown>, meta?: { email?: string }): Promise<void> {
    const { db } = await this.ensure();
    const { collection, doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    const profileRef = doc(db, 'users', uid, 'profile', 'self');
    await setDoc(profileRef, { email: meta?.email ?? '', updatedAt: serverTimestamp() }, { merge: true });
    for (const [name, value] of Object.entries(collections)) {
      const ref = doc(collection(db, 'users', uid, 'data'), name);
      await setDoc(ref, { value, updatedAt: serverTimestamp() }, { merge: true });
    }
  }

  async fetchData(uid: string): Promise<Record<string, unknown>> {
    const { db } = await this.ensure();
    const { collection, getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(collection(db, 'users', uid, 'data'));
    const out: Record<string, unknown> = {};
    snapshot.forEach((entry) => {
      const data = entry.data() as { value?: unknown };
      out[entry.id] = data.value;
    });
    return out;
  }

  async ping(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await this.ensure();
      return true;
    } catch {
      return false;
    }
  }
}

export function defaultCloudTransport(): CloudAuthTransport {
  return new FirestoreCloudTransport(getFirebaseConfig());
}

// ─── Local data collection for cloud sync ───────────────────────────────────

const EXCLUDED_STORAGE_KEYS = new Set(['local_account', 'cloud_auth_tokens', 'cloud_account_link', 'device_info']);

/**
 * Snapshot of app data for cloud sync. Credentials / recovery seeds are
 * intentionally excluded so secrets never leave the device.
 */
export function collectLocalCollections(): Record<string, unknown> {
  const collections: Record<string, unknown> = {};
  if (typeof localStorage === 'undefined') return collections;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || EXCLUDED_STORAGE_KEYS.has(key)) continue;
    const raw = localStorage.getItem(key);
    if (raw == null) continue;
    try {
      collections[key] = JSON.parse(raw);
    } catch {
      collections[key] = raw;
    }
  }
  return collections;
}

// ─── Provider ────────────────────────────────────────────────────────────────

const TOKENS_KEY = 'cloud_auth_tokens';
const LINK_KEY = 'cloud_account_link';
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60_000;

export class CloudAuthProvider {
  private readonly transport: CloudAuthTransport;
  private tokens: AuthTokens | null = null;
  private cloudUser: CloudUser | null = null;
  private queue: QueuedAuthOperation[] = [];
  private flushing = false;
  private online: boolean;
  private disposed = false;
  private idCounter = 0;
  private lastSyncedAt = 0;
  private unsubAuth: (() => void) | undefined;
  private readonly listeners = new Set<(user: CloudUser | null) => void>();
  private readonly handleOnline = (): void => this.setOnlineStatus(true);
  private readonly handleOffline = (): void => this.setOnlineStatus(false);

  constructor(transport?: CloudAuthTransport) {
    this.transport = transport ?? defaultCloudTransport();
    this.online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    this.loadTokens();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  // ── State ────────────────────────────────────────────────────────────

  isConfigured(): boolean {
    return this.transport.isConfigured();
  }

  isOnline(): boolean {
    return this.online;
  }

  /** Explicit connectivity control (used by tests and the UI). */
  setOnlineStatus(online: boolean): void {
    const changed = this.online !== online;
    this.online = online;
    if (changed && online) void this.flushQueue();
  }

  getCurrentUser(): CloudUser | null {
    return this.cloudUser;
  }

  /** Active identity: cloud user when available, otherwise local account. */
  getCurrentSession(): AuthSessionUser | null {
    if (this.cloudUser) return { ...this.cloudUser, source: 'cloud', cloudUid: this.cloudUser.uid };
    const local = localAuthManager.getCurrentUser();
    if (!local) return null;
    return {
      uid: local.uid,
      email: local.email ?? '',
      subscriptionTier: local.subscriptionTier,
      source: 'local',
      localUid: local.uid,
    };
  }

  getLastSyncedAt(): number {
    return this.lastSyncedAt;
  }

  subscribe(listener: (user: CloudUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Attach to the cloud auth state to restore sessions after reload. */
  restoreSession(): void {
    if (!this.transport.isConfigured() || this.unsubAuth) return;
    this.unsubAuth = this.transport.onAuthStateChanged((user) => {
      if (user) {
        this.setCloudUser(user, user.email);
      } else {
        this.cloudUser = null;
        this.notify();
      }
    });
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.cloudUser);
      } catch {
        /* isolate listener errors */
      }
    }
  }

  private setCloudUser(user: CloudUser, email: string): void {
    this.cloudUser = user;
    try {
      localStorage.setItem(LINK_KEY, JSON.stringify({ cloudUid: user.uid, email, linkedAt: Date.now() }));
    } catch {
      /* storage unavailable */
    }
    this.notify();
  }

  private clearCloudSession(): void {
    this.cloudUser = null;
    this.tokens = null;
    try {
      localStorage.removeItem(TOKENS_KEY);
    } catch {
      /* storage unavailable */
    }
    this.notify();
  }

  // ── Sign in: cloud first, local fallback ─────────────────────────────

  async signInWithEmail(email: string, password: string): Promise<AuthSessionUser> {
    const normalized = email.trim().toLowerCase();

    // No cloud backend configured: pure local auth.
    if (!this.transport.isConfigured()) {
      return this.signInLocal(normalized, password);
    }

    // Offline: local fast-path when a local account exists, otherwise queue.
    if (!this.online) {
      const local = await this.trySignInLocal(normalized, password);
      if (local) {
        void this.syncLocalToCloud().catch(() => {});
        return local;
      }
      return this.enqueueOperation({ type: 'signIn', email: normalized, password }).then((user) => {
        if (!user) throw new CloudUnavailableError('Queued sign-in did not produce a user');
        return user;
      });
    }

    try {
      const user = await this.transport.signIn(normalized, password);
      this.setCloudUser(user, normalized);
      const localUid = localAuthManager.getAccount()?.id;
      void this.syncLocalToCloud().catch(() => {});
      return { ...user, source: 'cloud', cloudUid: user.uid, localUid };
    } catch (err) {
      // Real credential rejections must surface; connectivity issues fall back.
      if (err instanceof CloudAuthError) throw err;
      return this.signInLocal(normalized, password);
    }
  }

  private async trySignInLocal(email: string, password: string): Promise<AuthSessionUser | null> {
    try {
      const user = await localAuthManager.login(email, password);
      return {
        uid: user.uid,
        email: user.email ?? '',
        subscriptionTier: user.subscriptionTier,
        source: 'local',
        localUid: user.uid,
      };
    } catch {
      return null;
    }
  }

  private async signInLocal(email: string, password: string): Promise<AuthSessionUser> {
    const user = await localAuthManager.login(email, password);
    return {
      uid: user.uid,
      email: user.email ?? '',
      subscriptionTier: user.subscriptionTier,
      source: 'local',
      localUid: user.uid,
    };
  }

  // ── Sign up: create BOTH cloud and local accounts ─────────────────────

  async signUpWithEmail(email: string, password: string): Promise<SignUpResult> {
    const normalized = email.trim().toLowerCase();

    if (!this.transport.isConfigured()) {
      const local = await localAuthManager.createAccount(normalized, password);
      return this.buildSignUpResult(local, null, 'unconfigured');
    }

    if (!this.online) {
      // Offline sign-up: local account now, cloud creation queued for later.
      const local = await localAuthManager.createAccount(normalized, password);
      this.enqueueOperation({ type: 'signUp', email: normalized, password });
      return this.buildSignUpResult(local, null, 'queued', true);
    }

    let cloudUser: CloudUser;
    let status: 'created' | 'linked';
    try {
      cloudUser = await this.transport.signUp(normalized, password);
      status = 'created';
    } catch (err) {
      if (err instanceof CloudAuthError && err.code === 'auth/email-already-in-use') {
        // Cloud account exists: link by signing in, then merge local data.
        cloudUser = await this.transport.signIn(normalized, password);
        status = 'linked';
      } else if (err instanceof CloudAuthError) {
        throw err;
      } else {
        // Cloud unavailable at sign-up time: local now, cloud queued.
        const local = await localAuthManager.createAccount(normalized, password);
        this.enqueueOperation({ type: 'signUp', email: normalized, password });
        return this.buildSignUpResult(local, null, 'queued', true);
      }
    }

    // Ensure a local account exists (reuse when one is already present).
    let localUser: MeshUser;
    let seed: string[] = [];
    try {
      const created = await localAuthManager.createAccount(normalized, password);
      localUser = created.user;
      seed = created.seed;
    } catch {
      localUser = localAuthManager.getCurrentUser() ?? { uid: '', email: normalized };
    }

    this.setCloudUser(cloudUser, normalized);
    void this.syncLocalToCloud().catch(() => {});
    return {
      user: { ...cloudUser, source: 'cloud', cloudUid: cloudUser.uid, localUid: localUser.uid },
      seed,
      cloud: status,
      syncQueued: false,
    };
  }

  private buildSignUpResult(
    local: { user: MeshUser; seed: string[] },
    cloudUser: CloudUser | null,
    cloud: 'created' | 'linked' | 'queued' | 'unconfigured',
    syncQueued = cloud === 'queued',
  ): SignUpResult {
    if (cloudUser) {
      return {
        user: { ...cloudUser, source: 'cloud', cloudUid: cloudUser.uid, localUid: local.user.uid },
        seed: local.seed,
        cloud,
        syncQueued,
      };
    }
    return {
      user: {
        uid: local.user.uid,
        email: local.user.email ?? '',
        subscriptionTier: local.user.subscriptionTier,
        source: 'local',
        localUid: local.user.uid,
      },
      seed: local.seed,
      cloud,
      syncQueued,
    };
  }

  // ── Sign out ──────────────────────────────────────────────────────────

  async signOut(): Promise<void> {
    if (!this.transport.isConfigured()) {
      this.clearCloudSession();
      return;
    }
    if (!this.online) {
      this.enqueueOperation({ type: 'signOut' });
      this.clearCloudSession();
      return;
    }
    try {
      await this.transport.signOut();
    } catch (err) {
      if (!(err instanceof CloudAuthError)) {
        // Connectivity problem: retry once we are back online.
        this.enqueueOperation({ type: 'signOut' });
        this.clearCloudSession();
        return;
      }
      throw err;
    }
    this.clearCloudSession();
  }

  // ── Sync local → cloud ────────────────────────────────────────────────

  async syncLocalToCloud(): Promise<SyncResult> {
    if (!this.transport.isConfigured()) return { status: 'unconfigured' };
    const user = this.cloudUser ?? this.transport.getCurrentUser();
    if (!user) return { status: 'skipped', reason: 'no-cloud-user' };
    if (!this.online) {
      this.enqueueOperation({ type: 'sync', reason: 'offline' });
      return { status: 'queued', reason: 'offline' };
    }
    const collections = collectLocalCollections();
    try {
      await this.transport.uploadData(user.uid, collections, { email: user.email });
      this.lastSyncedAt = Date.now();
      return { status: 'synced', collections: Object.keys(collections), syncedAt: this.lastSyncedAt };
    } catch (err) {
      if (err instanceof CloudUnavailableError) {
        this.enqueueOperation({ type: 'sync', reason: 'upload-unavailable' });
        return { status: 'queued', reason: err.message };
      }
      return { status: 'error', reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Pull cloud data back into local storage (compliments syncLocalToCloud). */
  async pullCloudToLocal(): Promise<Record<string, unknown>> {
    const user = this.cloudUser ?? this.transport.getCurrentUser();
    if (!this.transport.isConfigured() || !user) return {};
    if (!this.online) throw new CloudUnavailableError('Offline: cannot pull from cloud');
    const data = await this.transport.fetchData(user.uid);
    for (const [key, value] of Object.entries(data)) {
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      } catch {
        /* storage unavailable */
      }
    }
    return data;
  }

  // ── Token management ──────────────────────────────────────────────────

  getTokens(): AuthTokens | null {
    return this.tokens;
  }

  /** Returns a usable access token, refreshing when close to expiry. */
  async getValidToken(forceRefresh = false): Promise<string> {
    if (!this.transport.isConfigured()) {
      throw new CloudUnavailableError('Cloud auth is not configured');
    }
    if (!this.tokens || forceRefresh || this.tokens.expiresAt - Date.now() < TOKEN_REFRESH_THRESHOLD_MS) {
      if (!this.online) throw new CloudUnavailableError('Offline: cannot refresh auth token');
      try {
        this.tokens = await this.transport.refreshToken();
        this.persistTokens();
      } catch (err) {
        if (err instanceof CloudAuthError) {
          this.clearTokens();
          throw err;
        }
        throw err instanceof CloudUnavailableError
          ? err
          : new CloudUnavailableError(err instanceof Error ? err.message : String(err));
      }
    }
    return this.tokens.accessToken;
  }

  async refreshToken(forceRefresh = false): Promise<AuthTokens> {
    await this.getValidToken(forceRefresh);
    return this.tokens as AuthTokens;
  }

  private loadTokens(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AuthTokens>;
      if (parsed.accessToken && parsed.expiresAt) this.tokens = parsed as AuthTokens;
    } catch {
      this.tokens = null;
    }
  }

  private persistTokens(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (this.tokens) {
        localStorage.setItem(TOKENS_KEY, JSON.stringify(this.tokens));
      } else {
        localStorage.removeItem(TOKENS_KEY);
      }
    } catch {
      /* storage unavailable */
    }
  }

  private clearTokens(): void {
    this.tokens = null;
    try {
      localStorage.removeItem(TOKENS_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  // ── Offline queue ─────────────────────────────────────────────────────

  getQueuedOperations(): CloudAuthOperation[] {
    return this.queue.map((queued) => queued.op);
  }

  getQueuedOperationCount(): number {
    return this.queue.length;
  }

  private enqueueOperation(op: CloudAuthOperation): Promise<AuthSessionUser | null> {
    const promise = new Promise<AuthSessionUser | null>((resolve, reject) => {
      this.queue.push({
        id: `op-${Date.now()}-${this.idCounter++}`,
        op,
        createdAt: Date.now(),
        resolve,
        reject,
      });
    });
    // Avoid unhandled-rejection noise for fire-and-forget callers.
    promise.catch(() => {});
    if (this.online) void this.flushQueue();
    return promise;
  }

  /** Run queued operations now (called automatically when going online). */
  async flushQueue(): Promise<void> {
    if (this.flushing || this.disposed) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0 && this.online && !this.disposed) {
        const queued = this.queue.shift() as QueuedAuthOperation;
        try {
          const result = await this.runQueuedOperation(queued.op);
          queued.resolve(result);
        } catch (err) {
          queued.reject(err);
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async runQueuedOperation(op: CloudAuthOperation): Promise<AuthSessionUser | null> {
    switch (op.type) {
      case 'signIn': {
        const user = await this.transport.signIn(op.email, op.password);
        this.setCloudUser(user, op.email);
        void this.syncLocalToCloud().catch(() => {});
        return { ...user, source: 'cloud', cloudUid: user.uid, localUid: localAuthManager.getAccount()?.id };
      }
      case 'signUp': {
        const user = await this.transport.signUp(op.email, op.password);
        this.setCloudUser(user, op.email);
        void this.syncLocalToCloud().catch(() => {});
        return { ...user, source: 'cloud', cloudUid: user.uid, localUid: localAuthManager.getAccount()?.id };
      }
      case 'signOut': {
        await this.transport.signOut();
        this.clearCloudSession();
        return null;
      }
      case 'sync': {
        await this.syncLocalToCloud();
        return null;
      }
    }
  }

  /** Release window listeners, auth subscription and pending queue. */
  dispose(): void {
    this.disposed = true;
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.unsubAuth?.();
    const pending = this.queue.splice(0);
    for (const queued of pending) {
      queued.reject(new CloudUnavailableError('CloudAuthProvider disposed'));
    }
  }
}

/** App-wide singleton (constructed lazily; cloud SDK loads only on use). */
export const cloudAuthProvider = new CloudAuthProvider();
