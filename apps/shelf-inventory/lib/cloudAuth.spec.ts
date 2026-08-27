import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock p2p-mesh-core crypto so localAuthManager runs in jsdom ─────────────
vi.mock('p2p-mesh-core', () => {
  let uuidCounter = 0;
  return {
    generateUUID: () => `mock-uuid-${++uuidCounter}`,
    generateSalt: () => 'mocksalt12345678',
    hashPassword: async (password: string, salt: string) => `hashed_${password}_${salt}`,
    verifyPassword: async (password: string, salt: string, hash: string) => `hashed_${password}_${salt}` === hash,
    encryptDataLegacy: async (data: string) => `encrypted_${data}`,
    decryptDataLegacy: async (ciphertext: string) => {
      if (ciphertext.startsWith('encrypted_')) return ciphertext.slice('encrypted_'.length);
      throw new Error('Decryption failed');
    },
  };
});

vi.mock('./seedGenerator', () => ({
  generateSeed: (count: number) => Array.from({ length: count }, (_, i) => `word${i + 1}`),
  seedToString: (seed: string[]) => seed.join(' '),
  stringToSeed: (str: string) => str.split(' ').filter(Boolean),
  validateSeed: (seed: string[]) => seed.length === 12 || seed.length === 24,
}));

import {
  type AuthTokens,
  CloudAuthError,
  type CloudAuthOperation,
  CloudAuthProvider,
  type CloudAuthTransport,
  CloudUnavailableError,
  type CloudUser,
  collectLocalCollections,
  defaultCloudTransport,
  FirestoreCloudTransport,
  getFirebaseConfig,
} from './cloudAuth';

// ─── Fake cloud transport ────────────────────────────────────────────────────

class MockCloudTransport implements CloudAuthTransport {
  readonly kind = 'mock';
  configured = true;
  users: Record<string, { email: string; password: string; uid: string }> = {};
  currentUser: CloudUser | null = null;
  calls: string[] = [];
  failSignInWith: Error | null = null;
  failSignUpWith: Error | null = null;
  failRefreshWith: Error | null = null;
  failUploadWith: Error | null = null;
  failSignOutWith: Error | null = null;
  uploadCalls: Array<{ uid: string; collections: Record<string, unknown> }> = [];
  fetchDataResult: Record<string, unknown> = {};
  authStateListener: ((user: CloudUser | null) => void) | null = null;
  private nextUid = 1;

  isConfigured(): boolean {
    return this.configured;
  }

  async signIn(email: string, password: string): Promise<CloudUser> {
    this.calls.push('signIn');
    if (this.failSignInWith) throw this.failSignInWith;
    const existing = Object.values(this.users).find((u) => u.email === email);
    if (!existing || existing.password !== password) {
      throw new CloudAuthError('Invalid email or password', 'auth/invalid-credential');
    }
    this.currentUser = { uid: existing.uid, email };
    return this.currentUser;
  }

  async signUp(email: string, password: string): Promise<CloudUser> {
    this.calls.push('signUp');
    if (this.failSignUpWith) throw this.failSignUpWith;
    if (Object.values(this.users).some((u) => u.email === email)) {
      throw new CloudAuthError('Email already in use', 'auth/email-already-in-use');
    }
    const user: CloudUser = { uid: `cloud-${this.nextUid++}`, email };
    this.users[user.uid] = { email, password, uid: user.uid };
    this.currentUser = user;
    return user;
  }

  async signOut(): Promise<void> {
    this.calls.push('signOut');
    if (this.failSignOutWith) throw this.failSignOutWith;
    this.currentUser = null;
  }

  async getTokens(): Promise<AuthTokens> {
    this.calls.push('getTokens');
    return { accessToken: 'token-1', refreshToken: 'refresh-1', expiresAt: Date.now() + 60_000 };
  }

  async refreshToken(): Promise<AuthTokens> {
    this.calls.push('refreshToken');
    if (this.failRefreshWith) throw this.failRefreshWith;
    return { accessToken: 'refreshed-token', refreshToken: 'refresh-2', expiresAt: Date.now() + 55 * 60_000 };
  }

  getCurrentUser(): CloudUser | null {
    return this.currentUser;
  }

  onAuthStateChanged(listener: (user: CloudUser | null) => void): () => void {
    this.authStateListener = listener;
    return () => {
      this.authStateListener = null;
    };
  }

  async uploadData(uid: string, collections: Record<string, unknown>): Promise<void> {
    this.calls.push('uploadData');
    if (this.failUploadWith) throw this.failUploadWith;
    this.uploadCalls.push({ uid, collections });
  }

  async fetchData(_uid: string): Promise<Record<string, unknown>> {
    this.calls.push('fetchData');
    return this.fetchDataResult;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

describe('cloudAuth', () => {
  let transport: MockCloudTransport;
  let provider: CloudAuthProvider;

  beforeEach(() => {
    localStorage.clear();
    transport = new MockCloudTransport();
    provider = new CloudAuthProvider(transport);
  });

  afterEach(() => {
    provider.dispose();
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  // ── signInWithEmail: cloud first, local fallback ─────────────────────

  describe('signInWithEmail', () => {
    it('tries the cloud first and returns the cloud user', async () => {
      await transport.signUp('cloud@example.com', 'password123');
      const user = await provider.signInWithEmail('cloud@example.com', 'password123');

      expect(transport.calls).toContain('signIn');
      expect(user.source).toBe('cloud');
      expect(user.cloudUid).toBeTruthy();
      expect(user.email).toBe('cloud@example.com');
    });

    it('falls back to local auth when the cloud is unavailable', async () => {
      await localAuthCreate('fallback@example.com', 'password123');
      transport.failSignInWith = new CloudUnavailableError('network down');

      const user = await provider.signInWithEmail('fallback@example.com', 'password123');

      expect(transport.calls[0]).toBe('signIn');
      expect(user.source).toBe('local');
      expect(user.localUid).toBeTruthy();
      expect(user.email).toBe('fallback@example.com');
    });

    it('does NOT fall back to local when the cloud rejects credentials', async () => {
      await localAuthCreate('reject@example.com', 'password123');
      transport.failSignInWith = new CloudAuthError('Invalid email or password', 'auth/invalid-credential');

      await expect(provider.signInWithEmail('reject@example.com', 'password123')).rejects.toBeInstanceOf(
        CloudAuthError,
      );
      expect(transport.calls).toEqual(['signIn']);
    });

    it('works purely locally when no cloud backend is configured', async () => {
      transport.configured = false;
      await localAuthCreate('local-only@example.com', 'password123');

      const user = await provider.signInWithEmail('local-only@example.com', 'password123');

      expect(provider.isConfigured()).toBe(false);
      expect(user.source).toBe('local');
      expect(transport.calls).toEqual([]);
    });

    it('throws when cloud is unavailable and no local account exists', async () => {
      transport.failSignInWith = new CloudUnavailableError('network down');

      await expect(provider.signInWithEmail('nobody@example.com', 'password123')).rejects.toThrow(/No account found/);
    });

    it('normalizes the email before contacting the cloud', async () => {
      await transport.signUp('upper@example.com', 'password123');
      await provider.signInWithEmail('  UPPER@Example.COM  ', 'password123');

      expect(transport.calls).toContain('signIn');
    });

    it('signs in locally when offline and a local account exists', async () => {
      await localAuthCreate('offline-local@example.com', 'password123');
      provider.setOnlineStatus(false);

      const user = await provider.signInWithEmail('offline-local@example.com', 'password123');

      expect(user.source).toBe('local');
      expect(transport.calls).toEqual([]);
    });

    it('queues the sign-in when offline without a local account, resolving on reconnect', async () => {
      provider.setOnlineStatus(false);
      await transport.signUp('queued@example.com', 'password123');

      const pending = provider.signInWithEmail('queued@example.com', 'password123');
      // Let the async offline branch reach enqueueOperation before checking.
      await new Promise((r) => setTimeout(r, 0));
      expect(provider.getQueuedOperationCount()).toBe(1);
      expect(provider.getQueuedOperations()[0]).toMatchObject({ type: 'signIn', email: 'queued@example.com' });

      let resolved = false;
      void pending.then(() => {
        resolved = true;
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(resolved).toBe(false);

      provider.setOnlineStatus(true);
      const user = await pending;
      expect(user.source).toBe('cloud');
      expect(provider.getQueuedOperationCount()).toBe(0);
    });

    it('notifies subscribers when a cloud user is established', async () => {
      const listener = vi.fn();
      provider.subscribe(listener);
      await transport.signUp('notify@example.com', 'password123');

      await provider.signInWithEmail('notify@example.com', 'password123');

      await vi.waitFor(() => expect(listener).toHaveBeenCalled());
      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ email: 'notify@example.com' }));
    });
  });

  // ── signUpWithEmail: creates cloud AND local accounts ────────────────

  describe('signUpWithEmail', () => {
    it('creates the cloud account and a local account on this device', async () => {
      const result = await provider.signUpWithEmail('new@example.com', 'password123');

      expect(result.cloud).toBe('created');
      expect(result.user.source).toBe('cloud');
      expect(transport.calls).toContain('signUp');
      const account = JSON.parse(localStorage.getItem('local_account') as string);
      expect(account.email).toBe('new@example.com');
      expect(result.seed).toHaveLength(12);
    });

    it('uploads local data to the cloud account after sign-up', async () => {
      localStorage.setItem('products', JSON.stringify([{ id: 1 }]));
      localStorage.setItem('local_account', JSON.stringify({ secret: true }));

      await provider.signUpWithEmail('sync@example.com', 'password123');

      await vi.waitFor(() => expect(transport.uploadCalls.length).toBe(1));
      const { uid, collections } = transport.uploadCalls[0];
      expect(uid).toBeTruthy();
      expect(collections.products).toEqual([{ id: 1 }]);
      // Credentials / recovery seeds never leave the device.
      expect('local_account' in collections).toBe(false);
    });

    it('links an existing cloud account when the email is already registered', async () => {
      await transport.signUp('existing@example.com', 'password123');

      const result = await provider.signUpWithEmail('existing@example.com', 'password123');

      expect(result.cloud).toBe('linked');
      expect(transport.calls).toContain('signUp');
      expect(transport.calls).toContain('signIn');
    });

    it('creates local only when the cloud backend is unconfigured', async () => {
      transport.configured = false;

      const result = await provider.signUpWithEmail('nocfg@example.com', 'password123');

      expect(result.cloud).toBe('unconfigured');
      expect(result.user.source).toBe('local');
      expect(transport.calls).toEqual([]);
      expect(localStorage.getItem('local_account')).toBeTruthy();
    });

    it('creates the local account immediately and queues cloud sign-up when offline', async () => {
      provider.setOnlineStatus(false);

      const result = await provider.signUpWithEmail('offline-signup@example.com', 'password123');

      expect(result.cloud).toBe('queued');
      expect(result.user.source).toBe('local');
      expect(localStorage.getItem('local_account')).toBeTruthy();
      expect(provider.getQueuedOperations()[0]).toMatchObject({ type: 'signUp' });

      provider.setOnlineStatus(true);
      await vi.waitFor(() => expect(transport.calls).toContain('signUp'));
      expect(provider.getQueuedOperationCount()).toBe(0);
    });

    it('propagates hard cloud rejections', async () => {
      transport.failSignUpWith = new CloudAuthError('Weak password', 'auth/weak-password');

      await expect(provider.signUpWithEmail('weak@example.com', 'short')).rejects.toBeInstanceOf(CloudAuthError);
      expect(localStorage.getItem('local_account')).toBeNull();
    });
  });

  // ── syncLocalToCloud ─────────────────────────────────────────────────

  describe('syncLocalToCloud', () => {
    it('uploads local collections to the cloud user', async () => {
      localStorage.setItem('products', JSON.stringify([{ name: 'test' }]));
      localStorage.setItem('sales', JSON.stringify([{ total: 10 }]));
      await provider.signUpWithEmail('syncer@example.com', 'password123');
      await vi.waitFor(() => expect(transport.uploadCalls.length).toBe(1));

      const result = await provider.syncLocalToCloud();

      expect(result.status).toBe('synced');
      expect(result.collections).toEqual(expect.arrayContaining(['products', 'sales']));
      expect(provider.getLastSyncedAt()).toBeGreaterThan(0);
    });

    it('skips when there is no cloud session', async () => {
      const result = await provider.syncLocalToCloud();

      expect(result.status).toBe('skipped');
      expect(transport.uploadCalls).toEqual([]);
    });

    it('queues the sync when offline and flushes it on reconnect', async () => {
      await provider.signUpWithEmail('syncq@example.com', 'password123');
      await vi.waitFor(() => expect(transport.uploadCalls.length).toBe(1));

      provider.setOnlineStatus(false);
      const result = await provider.syncLocalToCloud();

      expect(result.status).toBe('queued');
      expect(provider.getQueuedOperationCount()).toBe(1);

      provider.setOnlineStatus(true);
      await vi.waitFor(() => expect(provider.getQueuedOperationCount()).toBe(0));
      expect(transport.uploadCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('returns unconfigured when no cloud backend exists', async () => {
      transport.configured = false;
      const result = await provider.syncLocalToCloud();

      expect(result.status).toBe('unconfigured');
    });

    it('reports error when the upload fails for non-network reasons', async () => {
      await provider.signUpWithEmail('syncerr@example.com', 'password123');
      await vi.waitFor(() => expect(transport.uploadCalls.length).toBe(1));
      transport.failUploadWith = new Error('permission denied');

      const result = await provider.syncLocalToCloud();

      expect(result.status).toBe('error');
      expect(result.reason).toContain('permission denied');
    });
  });

  // ── Token management ─────────────────────────────────────────────────

  describe('token management', () => {
    it('fetches and persists tokens on first use', async () => {
      await provider.signUpWithEmail('token@example.com', 'password123');
      await vi.waitFor(() => expect(transport.uploadCalls.length).toBe(1));

      const token = await provider.getValidToken();

      expect(token).toBe('refreshed-token');
      expect(provider.getTokens()).toMatchObject({ accessToken: 'refreshed-token' });
      expect(JSON.parse(localStorage.getItem('cloud_auth_tokens') as string).accessToken).toBe('refreshed-token');
    });

    it('does NOT refresh while the stored token is still valid', async () => {
      await provider.signUpWithEmail('token2@example.com', 'password123');
      await provider.getValidToken();
      const refreshCalls = transport.calls.filter((c) => c === 'refreshToken').length;

      const token = await provider.getValidToken();
      const refreshCallsAfter = transport.calls.filter((c) => c === 'refreshToken').length;

      expect(token).toBe('refreshed-token');
      expect(refreshCallsAfter).toBe(refreshCalls);
    });

    it('refreshes an expired token', async () => {
      localStorage.setItem(
        'cloud_auth_tokens',
        JSON.stringify({ accessToken: 'stale', refreshToken: 'old', expiresAt: Date.now() - 1000 }),
      );
      provider = new CloudAuthProvider(transport);

      const token = await provider.getValidToken();

      expect(token).toBe('refreshed-token');
      expect(transport.calls).toContain('refreshToken');
    });

    it('rejects refreshing while offline', async () => {
      localStorage.setItem(
        'cloud_auth_tokens',
        JSON.stringify({ accessToken: 'stale', refreshToken: 'old', expiresAt: Date.now() - 1000 }),
      );
      provider = new CloudAuthProvider(transport);
      provider.setOnlineStatus(false);

      await expect(provider.getValidToken()).rejects.toBeInstanceOf(CloudUnavailableError);
    });

    it('rejects when cloud auth is not configured', async () => {
      transport.configured = false;

      await expect(provider.getValidToken()).rejects.toBeInstanceOf(CloudUnavailableError);
    });

    it('clears invalid tokens when the cloud rejects the refresh', async () => {
      localStorage.setItem(
        'cloud_auth_tokens',
        JSON.stringify({ accessToken: 'stale', refreshToken: 'old', expiresAt: Date.now() - 1000 }),
      );
      provider = new CloudAuthProvider(transport);
      transport.failRefreshWith = new CloudAuthError('Session expired', 'auth/invalid-token');

      await expect(provider.getValidToken()).rejects.toBeInstanceOf(CloudAuthError);
      expect(provider.getTokens()).toBeNull();
      expect(localStorage.getItem('cloud_auth_tokens')).toBeNull();
    });
  });

  // ── Offline queue ────────────────────────────────────────────────────

  describe('offline queue', () => {
    it('tracks queued operations and clears them after flushing', async () => {
      provider.setOnlineStatus(false);
      await transport.signUp('q1@example.com', 'password123');

      const pending = provider.signInWithEmail('q1@example.com', 'password123');
      // Let the async offline branch reach enqueueOperation before checking.
      await new Promise((r) => setTimeout(r, 0));
      const queued: CloudAuthOperation[] = provider.getQueuedOperations();

      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ type: 'signIn' });

      provider.setOnlineStatus(true);
      await pending;
      expect(provider.getQueuedOperationCount()).toBe(0);
    });

    it('runs queued operations in order', async () => {
      provider.setOnlineStatus(false);
      await transport.signUp('a@example.com', 'password123');
      await transport.signUp('b@example.com', 'password123');

      const first = provider.signInWithEmail('a@example.com', 'password123');
      const second = provider.signInWithEmail('b@example.com', 'password123');

      provider.setOnlineStatus(true);
      const [a, b] = await Promise.all([first, second]);

      expect(a.email).toBe('a@example.com');
      expect(b.email).toBe('b@example.com');
    });
  });

  // ── signOut ──────────────────────────────────────────────────────────

  describe('signOut', () => {
    it('signs out of the cloud and clears the session', async () => {
      await provider.signUpWithEmail('out@example.com', 'password123');
      await vi.waitFor(() => expect(transport.uploadCalls.length).toBe(1));

      await provider.signOut();

      expect(transport.calls).toContain('signOut');
      expect(provider.getCurrentUser()).toBeNull();
    });

    it('queues sign-out when offline and clears the session immediately', async () => {
      await provider.signUpWithEmail('outoff@example.com', 'password123');
      await vi.waitFor(() => expect(transport.uploadCalls.length).toBe(1));

      provider.setOnlineStatus(false);
      await provider.signOut();

      expect(provider.getCurrentUser()).toBeNull();
      expect(provider.getQueuedOperationCount()).toBe(1);

      provider.setOnlineStatus(true);
      await vi.waitFor(() => expect(provider.getQueuedOperationCount()).toBe(0));
      expect(transport.calls).toContain('signOut');
    });
  });

  // ── Session restore + pull ───────────────────────────────────────────

  describe('session restore and pull', () => {
    it('restores the cloud session through onAuthStateChanged', () => {
      provider.restoreSession();

      transport.authStateListener?.({ uid: 'restored-uid', email: 'restored@example.com' } as CloudUser);

      expect(provider.getCurrentUser()).toMatchObject({ uid: 'restored-uid', email: 'restored@example.com' });
    });

    it('pulls cloud collections back into local storage', async () => {
      await provider.signUpWithEmail('pull@example.com', 'password123');
      await vi.waitFor(() => expect(transport.uploadCalls.length).toBe(1));
      transport.fetchDataResult = { products: [{ id: 7 }], settings: { theme: 'dark' } };

      const data = await provider.pullCloudToLocal();

      expect(data.products).toEqual([{ id: 7 }]);
      expect(JSON.parse(localStorage.getItem('products') as string)).toEqual([{ id: 7 }]);
      expect(JSON.parse(localStorage.getItem('settings') as string)).toEqual({ theme: 'dark' });
    });
  });

  // ── Config + collection helpers ──────────────────────────────────────

  describe('config and helpers', () => {
    it('parses VITE_FIREBASE_CONFIG JSON', () => {
      vi.stubEnv('VITE_FIREBASE_CONFIG', JSON.stringify({ apiKey: 'key-1', projectId: 'shelf-prod' }));

      expect(getFirebaseConfig()).toMatchObject({ apiKey: 'key-1', projectId: 'shelf-prod' });
    });

    it('returns null for malformed or incomplete configs', () => {
      vi.stubEnv('VITE_FIREBASE_CONFIG', 'not-json');
      expect(getFirebaseConfig()).toBeNull();

      vi.stubEnv('VITE_FIREBASE_CONFIG', JSON.stringify({ apiKey: 'key-1' }));
      expect(getFirebaseConfig()).toBeNull();

      vi.stubEnv('VITE_FIREBASE_CONFIG', '');
      expect(getFirebaseConfig()).toBeNull();
    });

    it('default transport is unconfigured without the env var', () => {
      expect(defaultCloudTransport().isConfigured()).toBe(false);
    });

    it('firestore transport reports configuration from its config', () => {
      expect(new FirestoreCloudTransport(null).isConfigured()).toBe(false);
      expect(new FirestoreCloudTransport({ apiKey: 'k', projectId: 'p' }).isConfigured()).toBe(true);
    });

    it('collectLocalCollections excludes credentials and parses JSON values', () => {
      localStorage.setItem('products', JSON.stringify([{ id: 1 }]));
      localStorage.setItem('plain', 'hello');
      localStorage.setItem('local_account', JSON.stringify({ passwordHash: 'x' }));
      localStorage.setItem('cloud_auth_tokens', JSON.stringify({ accessToken: 'x' }));
      localStorage.setItem('cloud_account_link', JSON.stringify({ cloudUid: 'x' }));

      const collections = collectLocalCollections();

      expect(collections.products).toEqual([{ id: 1 }]);
      expect(collections.plain).toBe('hello');
      expect('local_account' in collections).toBe(false);
      expect('cloud_auth_tokens' in collections).toBe(false);
      expect('cloud_account_link' in collections).toBe(false);
    });
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────

async function localAuthCreate(email: string, password: string): Promise<void> {
  // Local accounts are created through the provider-less manager by signing
  // up with an unconfigured transport, which routes straight to local auth.
  const offline = new CloudAuthProvider(new MockCloudTransport());
  try {
    offline.setOnlineStatus(false);
    await offline.signUpWithEmail(email, password);
  } finally {
    offline.dispose();
  }
}
