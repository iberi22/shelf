import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { p2pMock } = vi.hoisted(() => ({
  p2pMock: {
    generateUUID: vi.fn(() => 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'),
    sign: vi.fn(() => new Uint8Array([1, 2, 3, 4])),
    toHex: vi.fn(() => 'deadbeef'),
    verify: vi.fn(() => true),
    fromHex: vi.fn((hex: string) => new Uint8Array(hex.length / 2)),
  },
}));

vi.mock('p2p-mesh-core', () => p2pMock);

import { invitationManager, type Invitation } from './invitation';

const ADMIN_SECRET = new Uint8Array([1, 1, 1, 1]);
const ADMIN_PUBLIC = new Uint8Array([2, 2, 2, 2]);

describe('InvitationManager.createInvitation', () => {
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_750_000_000_000);
    vi.clearAllMocks();
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('creates an invitation with an 8-char uppercase code and maxUses 1', () => {
    const invitation = invitationManager.createInvitation(ADMIN_SECRET);
    expect(invitation.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(invitation.maxUses).toBe(1);
    expect(invitation.uses).toBe(0);
  });

  it('computes expiresAt from the given duration', () => {
    const invitation = invitationManager.createInvitation(ADMIN_SECRET, 3_600_000);
    expect(invitation.expiresAt).toBe(1_750_000_000_000 + 3_600_000);
  });

  it('signs the code:expiresAt:maxUses payload with the admin secret key', () => {
    invitationManager.createInvitation(ADMIN_SECRET);
    expect(p2pMock.sign).toHaveBeenCalledTimes(1);
    expect(p2pMock.toHex).toHaveBeenCalledWith(new Uint8Array([1, 2, 3, 4]));
    const [dataToSign] = p2pMock.sign.mock.calls[0] as unknown as [Uint8Array, Uint8Array];
    const decoded = new TextDecoder().decode(dataToSign);
    expect(decoded).toMatch(/^[A-Z0-9]{8}:\d+:1$/);
  });

  it('exposes the PQC signature as hex in the invitation', () => {
    const invitation = invitationManager.createInvitation(ADMIN_SECRET);
    expect(invitation.signature).toBe('deadbeef');
  });
});

describe('InvitationManager.verifyInvitation', () => {
  const baseInvitation: Invitation = {
    code: 'ABCD1234',
    expiresAt: 1_751_000_000_000,
    maxUses: 1,
    uses: 0,
    signature: 'aabbccdd',
  };

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_750_500_000_000);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a valid, unexpired, unused invitation', () => {
    expect(invitationManager.verifyInvitation(baseInvitation, ADMIN_PUBLIC)).toBe(true);
    expect(p2pMock.verify).toHaveBeenCalled();
  });

  it('rejects expired invitations without verifying the signature', () => {
    const expired = { ...baseInvitation, expiresAt: 1_750_400_000_000 };
    expect(invitationManager.verifyInvitation(expired, ADMIN_PUBLIC)).toBe(false);
    expect(p2pMock.verify).not.toHaveBeenCalled();
  });

  it('rejects invitations whose uses already reached maxUses', () => {
    const exhausted = { ...baseInvitation, uses: 1 };
    expect(invitationManager.verifyInvitation(exhausted, ADMIN_PUBLIC)).toBe(false);
    expect(p2pMock.verify).not.toHaveBeenCalled();
  });

  it('rejects when the PQC signature verification fails', () => {
    p2pMock.verify.mockReturnValueOnce(false);
    expect(invitationManager.verifyInvitation(baseInvitation, ADMIN_PUBLIC)).toBe(false);
  });
});