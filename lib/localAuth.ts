// localAuth.ts - Local authentication manager

import type { User } from '../types';
import {
  decryptDataLegacy as decryptData,
  encryptDataLegacy as encryptData,
  generateSalt,
  generateUUID,
  hashPassword,
  verifyPassword,
} from './crypto';
import { generateSeed, seedToString, stringToSeed, validateSeed } from './seedGenerator';

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  peerId: string;
  authorizedAt: string;
  lastSeen: string;
}

export interface LocalAccount {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  seedEncrypted: string;
  createdAt: string;
  devices: DeviceInfo[];
  subscriptionTier: 'free' | 'pro' | 'pyme';
}

export interface DeviceData {
  deviceId: string;
  deviceName: string;
  createdAt: string;
}

const STORAGE_KEY_ACCOUNT = 'local_account';
const STORAGE_KEY_DEVICE = 'device_info';

class LocalAuthManager {
  /**
   * Get current device info, create if doesn't exist
   */
  private getOrCreateDevice(): DeviceData {
    const stored = localStorage.getItem(STORAGE_KEY_DEVICE);
    if (stored) {
      return JSON.parse(stored);
    }

    // Create new device
    const device: DeviceData = {
      deviceId: generateUUID(),
      deviceName: this.getDefaultDeviceName(),
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY_DEVICE, JSON.stringify(device));
    return device;
  }

  /**
   * Get a default device name based on browser/platform
   */
  private getDefaultDeviceName(): string {
    const ua = navigator.userAgent;
    let deviceType = 'Unknown Device';

    if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) {
      deviceType = 'Mobile Device';
    } else if (/Windows/i.test(ua)) {
      deviceType = 'Windows PC';
    } else if (/Mac/i.test(ua)) {
      deviceType = 'Mac';
    } else if (/Linux/i.test(ua)) {
      deviceType = 'Linux PC';
    }

    return `${deviceType} - ${new Date().toLocaleDateString()}`;
  }

  /**
   * Create a new local account
   * @param email - User email
   * @param password - User password
   * @returns Object with user and recovery seed
   */
  async createAccount(email: string, password: string): Promise<{ user: User; seed: string[] }> {
    // Check if account already exists
    const existing = localStorage.getItem(STORAGE_KEY_ACCOUNT);
    if (existing) {
      throw new Error('An account already exists on this device. Please logout first.');
    }

    // Validate inputs
    if (!email || email.trim().length === 0) {
      throw new Error('Email is required');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // Generate account ID and salt
    const accountId = generateUUID();
    const passwordSalt = generateSalt();

    // Hash password
    const passwordHash = await hashPassword(password, passwordSalt);

    // Generate recovery seed
    const seed = generateSeed(12);
    const seedString = seedToString(seed);

    // Encrypt seed with password
    const seedEncrypted = await encryptData(seedString, password, email);

    // Get or create device info
    const device = this.getOrCreateDevice();

    // Create account object
    const account: LocalAccount = {
      id: accountId,
      email: email.trim().toLowerCase(),
      passwordHash,
      passwordSalt,
      seedEncrypted,
      createdAt: new Date().toISOString(),
      devices: [
        {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          peerId: '', // Will be set when P2P initializes
          authorizedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        },
      ],
      subscriptionTier: 'free',
    };

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY_ACCOUNT, JSON.stringify(account));

    // Return user object and seed
    const user: User = {
      uid: account.id,
      email: account.email,
      subscriptionTier: account.subscriptionTier,
    };

    return { user, seed };
  }

  /**
   * Login with email and password
   * @param email - User email
   * @param password - User password
   * @returns User object
   */
  async login(email: string, password: string): Promise<User> {
    const stored = localStorage.getItem(STORAGE_KEY_ACCOUNT);
    if (!stored) {
      throw new Error('No account found on this device');
    }

    const account: LocalAccount = JSON.parse(stored);

    // Verify email
    if (account.email !== email.trim().toLowerCase()) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await verifyPassword(password, account.passwordSalt, account.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Update last seen for current device
    const device = this.getOrCreateDevice();
    const deviceIndex = account.devices.findIndex((d) => d.deviceId === device.deviceId);
    if (deviceIndex !== -1) {
      account.devices[deviceIndex].lastSeen = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY_ACCOUNT, JSON.stringify(account));
    }

    // Return user object
    return {
      uid: account.id,
      email: account.email,
      subscriptionTier: account.subscriptionTier,
    };
  }

  /**
   * Get current account if exists
   * @returns LocalAccount or null
   */
  getAccount(): LocalAccount | null {
    const stored = localStorage.getItem(STORAGE_KEY_ACCOUNT);
    if (!stored) {
      return null;
    }
    return JSON.parse(stored);
  }

  /**
   * Get current user if logged in
   * @returns User or null
   */
  getCurrentUser(): User | null {
    const account = this.getAccount();
    if (!account) {
      return null;
    }

    return {
      uid: account.id,
      email: account.email,
      subscriptionTier: account.subscriptionTier,
    };
  }

  /**
   * Logout - removes account from this device
   */
  logout(): void {
    localStorage.removeItem(STORAGE_KEY_ACCOUNT);
  }

  /**
   * Update device peer ID
   * @param peerId - PeerJS ID
   */
  updateDevicePeerId(peerId: string): void {
    const account = this.getAccount();
    if (!account) return;

    const device = this.getOrCreateDevice();
    const deviceIndex = account.devices.findIndex((d) => d.deviceId === device.deviceId);

    if (deviceIndex !== -1) {
      account.devices[deviceIndex].peerId = peerId;
      account.devices[deviceIndex].lastSeen = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY_ACCOUNT, JSON.stringify(account));
    }
  }

  /**
   * Get authorized devices
   * @returns Array of device info
   */
  getAuthorizedDevices(): DeviceInfo[] {
    const account = this.getAccount();
    if (!account) return [];
    return account.devices;
  }

  /**
   * Revoke device access
   * @param deviceId - Device ID to revoke
   */
  revokeDevice(deviceId: string): void {
    const account = this.getAccount();
    if (!account) return;

    account.devices = account.devices.filter((d) => d.deviceId !== deviceId);
    localStorage.setItem(STORAGE_KEY_ACCOUNT, JSON.stringify(account));
  }

  /**
   * Get recovery seed (requires password)
   * @param password - User password
   * @returns Array of seed words
   */
  async getRecoverySeed(password: string): Promise<string[]> {
    const account = this.getAccount();
    if (!account) {
      throw new Error('No account found');
    }

    try {
      const seedString = await decryptData(account.seedEncrypted, password, account.email);
      return stringToSeed(seedString);
    } catch (_error) {
      throw new Error('Invalid password');
    }
  }

  /**
   * Recover account from seed
   * @param seedWords - Array of seed words
   * @param newPassword - New password for this device
   * @param email - Email of the account
   * @returns User object
   */
  async recoverFromSeed(seedWords: string[], newPassword: string, email: string): Promise<User> {
    // Validate seed
    if (!validateSeed(seedWords)) {
      throw new Error('Invalid recovery seed');
    }

    // Check if account already exists
    const existing = localStorage.getItem(STORAGE_KEY_ACCOUNT);
    if (existing) {
      throw new Error('An account already exists on this device. Please logout first.');
    }

    // Validate password
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // Create new account with recovered seed
    const accountId = generateUUID();
    const passwordSalt = generateSalt();
    const passwordHash = await hashPassword(newPassword, passwordSalt);

    const seedString = seedToString(seedWords);
    const seedEncrypted = await encryptData(seedString, newPassword, email);

    const device = this.getOrCreateDevice();

    const account: LocalAccount = {
      id: accountId,
      email: email.trim().toLowerCase(),
      passwordHash,
      passwordSalt,
      seedEncrypted,
      createdAt: new Date().toISOString(),
      devices: [
        {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          peerId: '',
          authorizedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        },
      ],
      subscriptionTier: 'free',
    };

    localStorage.setItem(STORAGE_KEY_ACCOUNT, JSON.stringify(account));

    return {
      uid: account.id,
      email: account.email,
      subscriptionTier: account.subscriptionTier,
    };
  }

  /**
   * Change password
   * @param currentPassword - Current password
   * @param newPassword - New password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const account = this.getAccount();
    if (!account) {
      throw new Error('No account found');
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, account.passwordSalt, account.passwordHash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters');
    }

    // Decrypt seed with old password
    const seedString = await decryptData(account.seedEncrypted, currentPassword, account.email);

    // Generate new salt and hash
    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);

    // Re-encrypt seed with new password
    const newSeedEncrypted = await encryptData(seedString, newPassword, account.email);

    // Update account
    account.passwordHash = newHash;
    account.passwordSalt = newSalt;
    account.seedEncrypted = newSeedEncrypted;

    localStorage.setItem(STORAGE_KEY_ACCOUNT, JSON.stringify(account));
  }

  /**
   * Update subscription tier
   * @param tier - New subscription tier
   */
  updateSubscriptionTier(tier: 'free' | 'pro' | 'pyme'): void {
    const account = this.getAccount();
    if (!account) return;

    account.subscriptionTier = tier;
    localStorage.setItem(STORAGE_KEY_ACCOUNT, JSON.stringify(account));
  }

  /**
   * Get current device info
   */
  getCurrentDevice(): DeviceData {
    return this.getOrCreateDevice();
  }

  /**
   * Update device name
   * @param newName - New device name
   */
  updateDeviceName(newName: string): void {
    const device = this.getOrCreateDevice();
    device.deviceName = newName;
    localStorage.setItem(STORAGE_KEY_DEVICE, JSON.stringify(device));

    // Also update in account devices list
    const account = this.getAccount();
    if (account) {
      const deviceIndex = account.devices.findIndex((d) => d.deviceId === device.deviceId);
      if (deviceIndex !== -1) {
        account.devices[deviceIndex].deviceName = newName;
        localStorage.setItem(STORAGE_KEY_ACCOUNT, JSON.stringify(account));
      }
    }
  }
}

export const localAuthManager = new LocalAuthManager();
