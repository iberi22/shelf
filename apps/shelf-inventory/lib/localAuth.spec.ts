import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock p2p-mesh-core crypto functions ──────────────────────
vi.mock('p2p-mesh-core', () => {
  let uuidCounter = 0;
  return {
    generateUUID: () => `mock-uuid-${++uuidCounter}`,
    generateSalt: () => 'mocksalt12345678',
    hashPassword: async (password: string, salt: string) => `hashed_${password}_${salt}`,
    verifyPassword: async (password: string, salt: string, hash: string) => {
      const attempt = `hashed_${password}_${salt}`;
      return attempt === hash;
    },
    encryptDataLegacy: async (data: string, _password: string, _email: string) => `encrypted_${data}`,
    decryptDataLegacy: async (ciphertext: string, password: string, _email: string) => {
      if (password === 'wrongpassword') {
        throw new Error('Decryption failed');
      }
      if (ciphertext.startsWith('encrypted_')) {
        return ciphertext.slice('encrypted_'.length);
      }
      throw new Error('Decryption failed');
    },
  };
});

vi.mock('./seedGenerator', () => ({
  generateSeed: (count: number) => Array.from({ length: count }, (_, i) => `word${i + 1}`),
  seedToString: (seed: string[]) => seed.join(' '),
  stringToSeed: (str: string) => str.split(' ').filter(Boolean),
  validateSeed: (seed: string[]) => {
    if (seed.length !== 12 && seed.length !== 24) return false;
    return seed.every((w) => /^word\d+$/.test(w));
  },
}));

// ─── localStorage mock ────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

// @ts-expect-error – override globalThis.localStorage for testing
globalThis.localStorage = localStorageMock;

// Mock navigator.userAgent for device detection
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
  writable: true,
});

import { localAuthManager } from './localAuth';

// ─── Tests ────────────────────────────────────────────────────

describe('localAuthManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── createAccount ───────────────────────────────────────────

  describe('createAccount', () => {
    it('creates an account and returns user + seed', async () => {
      const { user, seed } = await localAuthManager.createAccount('test@example.com', 'password123');

      expect(user.uid).toBeTruthy();
      expect(user.email).toBe('test@example.com');
      expect(user.subscriptionTier).toBe('free');
      expect(seed).toHaveLength(12);
      expect(seed[0]).toBe('word1');
    });

    it('normalizes email to lowercase and trimmed', async () => {
      const { user } = await localAuthManager.createAccount('  TEST@Example.COM  ', 'password123');
      expect(user.email).toBe('test@example.com');
    });

    it('saves account to localStorage', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      const stored = localStorage.getItem('local_account');
      expect(stored).toBeTruthy();

      const account = JSON.parse(stored!);
      expect(account.email).toBe('test@example.com');
      expect(account.passwordHash).toBeTruthy();
      expect(account.seedEncrypted).toBeTruthy();
      expect(account.subscriptionTier).toBe('free');
    });

    it('creates a device entry in localStorage', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      const stored = localStorage.getItem('device_info');
      expect(stored).toBeTruthy();

      const device = JSON.parse(stored!);
      expect(device.deviceId).toBeTruthy();
      expect(device.deviceName).toContain('Linux PC');
      expect(device.createdAt).toBeTruthy();
    });

    it('adds the device to the account devices list', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      const account = JSON.parse(localStorage.getItem('local_account')!);
      expect(account.devices).toHaveLength(1);
      expect(account.devices[0].deviceId).toBeTruthy();
      expect(account.devices[0].peerId).toBe('');
    });

    it('throws if an account already exists', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      await expect(localAuthManager.createAccount('other@example.com', 'password456')).rejects.toThrow(
        'An account already exists',
      );
    });

    it('throws if email is empty', async () => {
      await expect(localAuthManager.createAccount('', 'password123')).rejects.toThrow('Email is required');
    });

    it('throws if password is too short', async () => {
      await expect(localAuthManager.createAccount('test@example.com', '12345')).rejects.toThrow(
        'at least 6 characters',
      );
    });

    it('sets createdAt to a valid ISO timestamp', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');
      const account = JSON.parse(localStorage.getItem('local_account')!);
      expect(new Date(account.createdAt).toISOString()).toBe(account.createdAt);
    });
  });

  // ── login ───────────────────────────────────────────────────

  describe('login', () => {
    beforeEach(async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');
    });

    it('logs in successfully with correct credentials', async () => {
      const user = await localAuthManager.login('test@example.com', 'password123');

      expect(user.uid).toBeTruthy();
      expect(user.email).toBe('test@example.com');
      expect(user.subscriptionTier).toBe('free');
    });

    it('throws for non-existent account', async () => {
      localStorage.clear();

      await expect(localAuthManager.login('nobody@example.com', 'password123')).rejects.toThrow('No account found');
    });

    it('throws for wrong email', async () => {
      await expect(localAuthManager.login('wrong@example.com', 'password123')).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('throws for wrong password', async () => {
      await expect(localAuthManager.login('test@example.com', 'wrongpassword')).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('updates lastSeen on the current device', async () => {
      const before = JSON.parse(localStorage.getItem('local_account')!);
      const lastSeenBefore = before.devices[0].lastSeen;

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      await localAuthManager.login('test@example.com', 'password123');

      const after = JSON.parse(localStorage.getItem('local_account')!);
      expect(after.devices[0].lastSeen).not.toBe(lastSeenBefore);
    });
  });

  // ── getAccount / getCurrentUser ─────────────────────────────

  describe('getAccount', () => {
    it('returns null when no account exists', () => {
      expect(localAuthManager.getAccount()).toBeNull();
    });

    it('returns the account object when it exists', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');
      const account = localAuthManager.getAccount();

      expect(account).not.toBeNull();
      expect(account!.email).toBe('test@example.com');
    });
  });

  describe('getCurrentUser', () => {
    it('returns null when not logged in', () => {
      expect(localAuthManager.getCurrentUser()).toBeNull();
    });

    it('returns user when account exists', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');
      const user = localAuthManager.getCurrentUser();

      expect(user).not.toBeNull();
      expect(user!.email).toBe('test@example.com');
      expect(user!.subscriptionTier).toBe('free');
    });
  });

  // ── logout ──────────────────────────────────────────────────

  describe('logout', () => {
    it('removes the account from localStorage', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');
      expect(localAuthManager.getAccount()).not.toBeNull();

      localAuthManager.logout();
      expect(localAuthManager.getAccount()).toBeNull();
    });
  });

  // ── device management ───────────────────────────────────────

  describe('updateDevicePeerId', () => {
    it('updates the peerId for the current device', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      localAuthManager.updateDevicePeerId('peer-abc-123');

      const account = JSON.parse(localStorage.getItem('local_account')!);
      expect(account.devices[0].peerId).toBe('peer-abc-123');
    });

    it('does nothing if no account exists', () => {
      localAuthManager.updateDevicePeerId('peer-abc-123');
      // No error should be thrown
    });
  });

  describe('getAuthorizedDevices', () => {
    it('returns empty array when no account exists', () => {
      expect(localAuthManager.getAuthorizedDevices()).toEqual([]);
    });

    it('returns device list when account exists', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');
      const devices = localAuthManager.getAuthorizedDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].deviceId).toBeTruthy();
      expect(devices[0].deviceName).toContain('Linux PC');
    });
  });

  describe('revokeDevice', () => {
    it('removes the specified device from the account', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      const device = JSON.parse(localStorage.getItem('device_info')!);
      localAuthManager.revokeDevice(device.deviceId);

      const account = JSON.parse(localStorage.getItem('local_account')!);
      expect(account.devices).toHaveLength(0);
    });

    it('does nothing for a non-existent device ID', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      localAuthManager.revokeDevice('non-existent-id');

      const account = JSON.parse(localStorage.getItem('local_account')!);
      expect(account.devices).toHaveLength(1);
    });
  });

  // ── updateDeviceName ────────────────────────────────────────

  describe('updateDeviceName', () => {
    it('updates the device name in both device_info and account', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      localAuthManager.updateDeviceName('Mi PC');

      const device = JSON.parse(localStorage.getItem('device_info')!);
      expect(device.deviceName).toBe('Mi PC');

      const account = JSON.parse(localStorage.getItem('local_account')!);
      expect(account.devices[0].deviceName).toBe('Mi PC');
    });
  });

  // ── getCurrentDevice ────────────────────────────────────────

  describe('getCurrentDevice', () => {
    it('creates and returns a device if none exists', () => {
      const device = localAuthManager.getCurrentDevice();

      expect(device.deviceId).toBeTruthy();
      expect(device.deviceName).toContain('Linux PC');
      expect(device.createdAt).toBeTruthy();
    });

    it('returns the same device on subsequent calls', () => {
      const device1 = localAuthManager.getCurrentDevice();
      const device2 = localAuthManager.getCurrentDevice();

      expect(device1.deviceId).toBe(device2.deviceId);
    });
  });

  // ── updateSubscriptionTier ──────────────────────────────────

  describe('updateSubscriptionTier', () => {
    it('updates the subscription tier in the account', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      localAuthManager.updateSubscriptionTier('pro');

      const user = localAuthManager.getCurrentUser();
      expect(user!.subscriptionTier).toBe('pro');
    });

    it('does nothing if no account exists', () => {
      localAuthManager.updateSubscriptionTier('pro');
      // No error should be thrown
    });
  });

  // ── getRecoverySeed ─────────────────────────────────────────

  describe('getRecoverySeed', () => {
    it('returns the seed when correct password is provided', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      const seed = await localAuthManager.getRecoverySeed('password123');

      expect(seed).toHaveLength(12);
      expect(seed[0]).toBe('word1');
    });

    it('throws when no account exists', async () => {
      await expect(localAuthManager.getRecoverySeed('password123')).rejects.toThrow('No account found');
    });

    it('throws when wrong password is provided', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      await expect(localAuthManager.getRecoverySeed('wrongpassword')).rejects.toThrow('Invalid password');
    });
  });

  // ── recoverFromSeed ─────────────────────────────────────────

  describe('recoverFromSeed', () => {
    it('creates a new account from a valid seed', async () => {
      const seedWords = Array.from({ length: 12 }, (_, i) => `word${i + 1}`);
      const user = await localAuthManager.recoverFromSeed(seedWords, 'newpassword', 'recovered@example.com');

      expect(user.uid).toBeTruthy();
      expect(user.email).toBe('recovered@example.com');
      expect(user.subscriptionTier).toBe('free');
    });

    it('throws if an account already exists', async () => {
      await localAuthManager.createAccount('existing@example.com', 'password123');
      const seedWords = Array.from({ length: 12 }, (_, i) => `word${i + 1}`);

      await expect(localAuthManager.recoverFromSeed(seedWords, 'newpassword', 'recovered@example.com')).rejects.toThrow(
        'An account already exists',
      );
    });

    it('throws for an invalid seed', async () => {
      await expect(
        localAuthManager.recoverFromSeed(['invalid', 'seed'], 'newpassword', 'test@example.com'),
      ).rejects.toThrow('Invalid recovery seed');
    });

    it('throws for a short password', async () => {
      const seedWords = Array.from({ length: 12 }, (_, i) => `word${i + 1}`);

      await expect(localAuthManager.recoverFromSeed(seedWords, 'short', 'test@example.com')).rejects.toThrow(
        'at least 6 characters',
      );
    });

    it('normalizes the email to lowercase', async () => {
      const seedWords = Array.from({ length: 12 }, (_, i) => `word${i + 1}`);
      const user = await localAuthManager.recoverFromSeed(seedWords, 'newpassword', '  RECOVERED@Test.COM  ');

      expect(user.email).toBe('recovered@test.com');
    });
  });

  // ── changePassword ──────────────────────────────────────────

  describe('changePassword', () => {
    it('changes the password successfully', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      await localAuthManager.changePassword('password123', 'newpassword456');

      // Old password should no longer work
      await expect(localAuthManager.login('test@example.com', 'password123')).rejects.toThrow(
        'Invalid email or password',
      );

      // New password should work
      const user = await localAuthManager.login('test@example.com', 'newpassword456');
      expect(user.email).toBe('test@example.com');
    });

    it('throws when no account exists', async () => {
      await expect(localAuthManager.changePassword('old', 'newpassword')).rejects.toThrow('No account found');
    });

    it('throws for incorrect current password', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      await expect(localAuthManager.changePassword('wrongpassword', 'newpassword456')).rejects.toThrow(
        'Current password is incorrect',
      );
    });

    it('throws for a short new password', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');

      await expect(localAuthManager.changePassword('password123', 'short')).rejects.toThrow('at least 6 characters');
    });

    it('preserves the recovery seed after password change', async () => {
      await localAuthManager.createAccount('test@example.com', 'password123');
      await localAuthManager.changePassword('password123', 'newpassword456');

      const seed = await localAuthManager.getRecoverySeed('newpassword456');
      expect(seed).toHaveLength(12);
    });
  });
});
