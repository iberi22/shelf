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
    const proposal = createCandidacy(peerId);

    expect(proposal.targetPeerId).toBe(peerId);
    expect(proposal.status).toBe('active');
    expect(typeof proposal.votes).toBe('object');
    expect(Object.keys(proposal.votes).length).toBe(0);
    expect(proposal.expiresAt).toBe(proposal.createdAt + 5 * 60 * 1000);
  });

  it('records votes correctly', () => {
    const proposal = createCandidacy('peer-1');
    vote(proposal, 'voter-1', true);
    vote(proposal, 'voter-2', false, 'Not trusted');

    expect(proposal.votes['voter-1'].value).toBe('approve');
    expect(proposal.votes['voter-2'].value).toBe('reject');
    expect(proposal.votes['voter-2'].reason).toBe('Not trusted');
    expect(Object.keys(proposal.votes).length).toBe(2);
  });

  it('evaluates candidacy as pending/active while not expired and no majority', () => {
    const proposal = createCandidacy('peer-1');
    vote(proposal, 'voter-1', true);

    // totalActivePeers = 3, majority = ceil((3+1)/2) = 2. approveCount = 1.
    expect(evaluateCandidacy(proposal, 3)).toBe('active');
  });

  it('evaluates candidacy as approved when majority positive votes reached', () => {
    const proposal = createCandidacy('peer-1');
    vote(proposal, 'voter-1', true);
    vote(proposal, 'voter-2', true);

    // totalActivePeers = 3, majority = 2. approveCount = 2.
    expect(evaluateCandidacy(proposal, 3)).toBe('approved');
  });

  it('evaluates candidacy as rejected when any negative vote is cast', () => {
    const proposal = createCandidacy('peer-1');
    vote(proposal, 'voter-1', true);
    vote(proposal, 'voter-2', false);

    expect(evaluateCandidacy(proposal, 3)).toBe('rejected');
  });

  it('evaluates candidacy as expired when time runs out without majority or rejection', () => {
    const proposal = createCandidacy('peer-1');
    vote(proposal, 'voter-1', true);

    // Fast-forward 6 minutes
    vi.advanceTimersByTime(6 * 60 * 1000);

    expect(evaluateCandidacy(proposal, 3)).toBe('expired');
  });
});
