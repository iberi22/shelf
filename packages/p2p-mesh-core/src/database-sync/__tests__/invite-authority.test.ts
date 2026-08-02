import { describe, expect, it } from 'vitest';
import { canInvite } from '../authority-checks';

describe('Invite authority (#364)', () => {
  it('allows admin to invite', () => {
    expect(canInvite('admin')).toBe(true);
  });
  it('allows owner to invite', () => {
    expect(canInvite('owner')).toBe(true);
  });
  it('rejects collaborator invite', () => {
    expect(canInvite('collaborator')).toBe(false);
  });
  it('rejects vendedor invite', () => {
    expect(canInvite('vendedor')).toBe(false);
  });
  it('rejects custom / null / undefined', () => {
    expect(canInvite('custom')).toBe(false);
    expect(canInvite(null)).toBe(false);
    expect(canInvite(undefined)).toBe(false);
  });
  it('allows non-admin when canManageTeam is set', () => {
    expect(canInvite('collaborator', { canManageTeam: true })).toBe(true);
    expect(canInvite('vendedor', { canManageTeam: false })).toBe(false);
  });
});
