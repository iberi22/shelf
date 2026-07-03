
import type { GovernanceProposal, GovernanceVote, GovernanceVoteValue, GovernanceStatus } from 'edge-mesh';

export type { GovernanceProposal, GovernanceVote, GovernanceVoteValue, GovernanceStatus };

/**
 * Creates a new admin candidacy for a peer as a GovernanceProposal.
 * By default, the candidacy expires in 5 minutes.
 */
export function createCandidacy(peerId: string): GovernanceProposal {
	const now = Date.now();
	return {
		id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `prop-${now}-${Math.random().toString(36).slice(2, 9)}`,
		targetPeerId: peerId,
		proposedRole: 'admin',
		createdBy: peerId,
		createdAt: now,
		expiresAt: now + 5 * 60 * 1000,
		status: 'active',
		votes: {},
	};
}

/**
 * Casts a vote for an admin candidacy.
 */
export function vote(
	proposal: GovernanceProposal,
	voterPeerId: string,
	approve: boolean,
	reason?: string
): void {
	proposal.votes[voterPeerId] = {
		peerId: voterPeerId,
		value: approve ? 'approve' : 'reject',
		timestamp: Date.now(),
		reason
	};
}

/**
 * Evaluates the status of an admin candidacy based on cast votes and expiration.
 */
export function evaluateCandidacy(
	proposal: GovernanceProposal,
	totalActivePeers: number
): GovernanceStatus {
	if (proposal.status !== 'active') return proposal.status;

	const votes = Object.values(proposal.votes);
	const approveCount = votes.filter((v) => v.value === 'approve').length;
	const rejectCount = votes.filter((v) => v.value === 'reject').length;

	// According to current policy: any rejection rejects the proposal
	if (rejectCount > 0) return 'rejected';

	// Majority logic: total active peers (including the candidate if they could vote, but usually they don't vote for themselves in this simplified UI)
	// In Settings.tsx: const majority = Math.ceil((totalActivePeers + 1) / 2);
	const majority = Math.ceil((totalActivePeers + 1) / 2);

	if (approveCount >= majority) return 'approved';

	const now = Date.now();
	if (now >= proposal.expiresAt) return 'expired';

	return 'active';
}
