
import type { GovernanceProposal, GovernanceVote, GovernanceVoteValue } from 'edge-mesh';

export type { GovernanceProposal, GovernanceVote, GovernanceVoteValue };

export interface AdminCandidacy {
	candidatePeerId: string;
	createdAt: number;
	expiresAt: number;
	votes: Map<string, boolean>;
	status: "pending" | "approved" | "rejected";
}

/**
 * Creates a new admin candidacy for a peer.
 * By default, the candidacy expires in 24 hours.
 */
export function createCandidacy(peerId: string): AdminCandidacy {
	const now = Date.now();
	return {
		candidatePeerId: peerId,
		createdAt: now,
		expiresAt: now + 24 * 60 * 60 * 1000,
		votes: new Map<string, boolean>(),
		status: "pending",
	};
}

/**
 * Casts a vote for an admin candidacy.
 */
export function vote(
	candidacy: AdminCandidacy,
	voterPeerId: string,
	approve: boolean,
): void {
	candidacy.votes.set(voterPeerId, approve);
}

/**
 * Evaluates the status of an admin candidacy based on cast votes and expiration.
 * If expired, it's approved if positive votes outnumber negative votes.
 * Otherwise, it remains pending unless a clear majority is reached (not implemented here
 * as total peer count is not available in the candidacy object alone).
 */
export function evaluateCandidacy(
	candidacy: AdminCandidacy,
): "approved" | "rejected" | "pending" {
	let positive = 0;
	let negative = 0;

	for (const v of candidacy.votes.values()) {
		if (v) {
			positive++;
		} else {
			negative++;
		}
	}

	const now = Date.now();
	const isExpired = now >= candidacy.expiresAt;

	if (isExpired) {
		return positive > negative ? "approved" : "rejected";
	}

	// For non-expired candidacies, we could approve if positive > totalPeers / 2
	// but since we don't have totalPeers here, we'll keep it pending.
	return "pending";
}


