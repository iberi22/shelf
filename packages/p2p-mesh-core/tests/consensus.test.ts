import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createCandidacy, vote, evaluateCandidacy } from '../src/consensus';

describe('P2P Consensus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a candidacy with correct initial values', () => {
    const peerId = 'peer-1';
    const candidacy = createCandidacy(peerId);

    expect(candidacy.candidatePeerId).toBe(peerId);
    expect(candidacy.status).toBe('pending');
    expect(candidacy.votes instanceof Map).toBe(true);
    expect(candidacy.votes.size).toBe(0);
    expect(candidacy.expiresAt).toBe(candidacy.createdAt + 24 * 60 * 60 * 1000);
  });

  it('records votes correctly', () => {
    const candidacy = createCandidacy('peer-1');
    vote(candidacy, 'voter-1', true);
    vote(candidacy, 'voter-2', false);

    expect(candidacy.votes.get('voter-1')).toBe(true);
    expect(candidacy.votes.get('voter-2')).toBe(false);
    expect(candidacy.votes.size).toBe(2);
  });

  it('evaluates candidacy as pending while not expired and no majority logic applied yet', () => {
    const candidacy = createCandidacy('peer-1');
    vote(candidacy, 'voter-1', true);

    expect(evaluateCandidacy(candidacy)).toBe('pending');
  });

  it('evaluates candidacy as approved when expired with majority positive votes', () => {
    const candidacy = createCandidacy('peer-1');
    vote(candidacy, 'voter-1', true);
    vote(candidacy, 'voter-2', true);
    vote(candidacy, 'voter-3', false);

    // Fast-forward 25 hours
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    expect(evaluateCandidacy(candidacy)).toBe('approved');
  });

  it('evaluates candidacy as rejected when expired with majority negative votes', () => {
    const candidacy = createCandidacy('peer-1');
    vote(candidacy, 'voter-1', true);
    vote(candidacy, 'voter-2', false);
    vote(candidacy, 'voter-3', false);

    // Fast-forward 25 hours
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    expect(evaluateCandidacy(candidacy)).toBe('rejected');
  });

  it('evaluates candidacy as rejected when expired with tied votes', () => {
    const candidacy = createCandidacy('peer-1');
    vote(candidacy, 'voter-1', true);
    vote(candidacy, 'voter-2', false);

    // Fast-forward 25 hours
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    expect(evaluateCandidacy(candidacy)).toBe('rejected');
  });
});
