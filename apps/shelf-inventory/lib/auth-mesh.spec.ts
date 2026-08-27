import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { p2pMock } = vi.hoisted(() => ({
  p2pMock: {
    fromHex: vi.fn((hex: string) => new Uint8Array(hex.length / 2)),
    sign: vi.fn(() => new Uint8Array([9, 8, 7, 6])),
    toHex: vi.fn(() => 'cafebabe'),
    verify: vi.fn(() => true),
  },
}));

vi.mock('p2p-mesh-core', () => p2pMock);

import { authMeshManager, type MeshRole, type MeshSession } from './auth-mesh';

const ADMIN_SECRET = new Uint8Array([1, 1, 1, 1]);
const ADMIN_PUBLIC = new Uint8Array([2, 2, 2, 2]);

const makeSession = (overrides: Partial<MeshSession> = {}): MeshSession => ({
  peerId: 'peer-101',
  role: 'COLLABORATOR',
  issuedAt: 1_750_000_000_000,
  expiresAt: 1_750_086_400_000,
  signature: 'cafebabe',
  ...overrides,
});

describe('AuthMeshManager.issueSession', () => {
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_750_000_000_000);
    vi.clearAllMocks();
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('issues a session with the given peer id, role and 24h default duration', () => {
    const session = authMeshManager.issueSession('peer-101', 'COLLABORATOR', ADMIN_SECRET);
    expect(session.peerId).toBe('peer-101');
    expect(session.role).toBe('COLLABORATOR');
    expect(session.issuedAt).toBe(1_750_000_000_000);
    expect(session.expiresAt).toBe(1_750_000_000_000 + 86_400_000);
  });

  it('signs the peerId:role:issuedAt:expiresAt payload', () => {
    authMeshManager.issueSession('peer-101', 'ADMIN', ADMIN_SECRET, 3_600_000);
    expect(p2pMock.sign).toHaveBeenCalledTimes(1);
    const [payload] = p2pMock.sign.mock.calls[0] as unknown as [Uint8Array, Uint8Array];
    expect(new TextDecoder().decode(payload)).toBe(
      'peer-101:ADMIN:1750000000000:1750003600000',
    );
  });

  it('exposes the signature as hex', () => {
    const session = authMeshManager.issueSession('peer-101', 'VIEWER', ADMIN_SECRET);
    expect(session.signature).toBe('cafebabe');
  });
});

describe('AuthMeshManager.verifySession', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_750_050_000_000);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a session that has not expired', () => {
    expect(authMeshManager.verifySession(makeSession(), ADMIN_PUBLIC)).toBe(true);
    expect(p2pMock.fromHex).toHaveBeenCalledWith('cafebabe');
    expect(p2pMock.verify).toHaveBeenCalled();
  });

  it('rejects an expired session without verifying', () => {
    const expired = makeSession({ expiresAt: 1_750_040_000_000 });
    expect(authMeshManager.verifySession(expired, ADMIN_PUBLIC)).toBe(false);
    expect(p2pMock.verify).not.toHaveBeenCalled();
  });

  it('rejects when the signature verification fails', () => {
    p2pMock.verify.mockReturnValueOnce(false);
    expect(authMeshManager.verifySession(makeSession(), ADMIN_PUBLIC)).toBe(false);
  });
});

describe('AuthMeshManager.canPerformAction (RBAC)', () => {
  const cases: Array<[MeshRole, 'WRITE' | 'READ' | 'MANAGE_USERS', boolean]> = [
    ['ADMIN', 'READ', true],
    ['ADMIN', 'WRITE', true],
    ['ADMIN', 'MANAGE_USERS', true],
    ['COLLABORATOR', 'READ', true],
    ['COLLABORATOR', 'WRITE', true],
    ['COLLABORATOR', 'MANAGE_USERS', false],
    ['VIEWER', 'READ', true],
    ['VIEWER', 'WRITE', false],
    ['VIEWER', 'MANAGE_USERS', false],
  ];

  it.each(cases)('%s can perform %s -> %s', (role, action, expected) => {
    expect(authMeshManager.canPerformAction(role, action)).toBe(expected);
  });
});