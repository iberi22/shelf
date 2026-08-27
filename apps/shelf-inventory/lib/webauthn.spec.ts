import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateWithPasskey, isBiometricsSupported } from './webauthn';

type PlatformAuthenticator = {
  isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean>;
};

const setPublicKeyCredential = (impl: PlatformAuthenticator | undefined) => {
  Object.defineProperty(window, 'PublicKeyCredential', {
    value: impl,
    configurable: true,
    writable: true,
  });
};

const setCredentialsGet = (impl: unknown) => {
  Object.defineProperty(navigator, 'credentials', {
    value: { get: impl },
    configurable: true,
  });
};

describe('isBiometricsSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true });
  });

  it('returns true when the platform authenticator is available', async () => {
    setPublicKeyCredential({
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    });
    await expect(isBiometricsSupported()).resolves.toBe(true);
  });

  it('returns false when the platform authenticator is unavailable', async () => {
    setPublicKeyCredential({
      isUserVerifyingPlatformAuthenticatorAvailable: async () => false,
    });
    await expect(isBiometricsSupported()).resolves.toBe(false);
  });

  it('returns false when the availability probe throws', async () => {
    setPublicKeyCredential({
      isUserVerifyingPlatformAuthenticatorAvailable: async () => {
        throw new Error('not supported on this device');
      },
    });
    await expect(isBiometricsSupported()).resolves.toBe(false);
  });

  it('returns false when PublicKeyCredential is missing entirely', async () => {
    setPublicKeyCredential(undefined);
    await expect(isBiometricsSupported()).resolves.toBe(false);
  });
});

describe('authenticateWithPasskey', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setPublicKeyCredential({
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    setCredentialsGet(undefined);
    Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true });
  });

  it('returns true when the credential assertion resolves', async () => {
    setCredentialsGet(async () => ({ id: 'credential-123' }));
    await expect(authenticateWithPasskey('challenge')).resolves.toBe(true);
  });

  it('returns false when the credential assertion resolves to null', async () => {
    setCredentialsGet(async () => null);
    await expect(authenticateWithPasskey()).resolves.toBe(false);
  });

  it('returns false when credentials.get rejects', async () => {
    setCredentialsGet(async () => {
      throw new Error('user cancelled');
    });
    await expect(authenticateWithPasskey()).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('Biometric authentication failed:', expect.any(Error));
  });

  it('returns false without WebAuthn support', async () => {
    setPublicKeyCredential(undefined);
    await expect(authenticateWithPasskey()).resolves.toBe(false);
  });
});
