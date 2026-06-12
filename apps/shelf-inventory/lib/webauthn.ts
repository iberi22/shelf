export async function isBiometricsSupported(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.PublicKeyCredential) {
    try {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (_e) {
      return false;
    }
  }
  return false;
}

export async function authenticateWithPasskey(_challengeStr?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: 'required',
      },
    });

    if (credential) {
      return true;
    }
    return false;
  } catch (error) {
    console.error('Biometric authentication failed:', error);
    return false;
  }
}
