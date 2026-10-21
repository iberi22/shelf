import { describe, expect, it } from 'vitest';
import { pinnedDsaKeyFor } from '../src/p2p/pinned-key';

const nodes = [
  { id: 'peer-a', dsaPublicKey: 'ABcd01' },
  { id: 'peer-b' },
  { id: 'peer-c', dsaPublicKey: '' },
] as any[];

describe('pinnedDsaKeyFor', () => {
  it('returns the pinned hex key for a known peer', () => {
    expect(pinnedDsaKeyFor(nodes, 'peer-a')).toBe('ABcd01');
  });
  it('returns undefined when the record has no (or empty) key', () => {
    expect(pinnedDsaKeyFor(nodes, 'peer-b')).toBeUndefined();
    expect(pinnedDsaKeyFor(nodes, 'peer-c')).toBeUndefined();
  });
  it('returns undefined for an unknown id or empty list', () => {
    expect(pinnedDsaKeyFor(nodes, 'nobody')).toBeUndefined();
    expect(pinnedDsaKeyFor([], 'peer-a')).toBeUndefined();
  });
});
