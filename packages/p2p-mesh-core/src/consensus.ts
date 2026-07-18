/**
 * Lightweight admin-candidacy helpers used by Shelf UI.
 * Kept local to p2p-mesh-core so we do not depend on edge-mesh governance type names
 * (which use Spanish Propuesta/EstadoPropuesta APIs).
 */

export type GovernanceVoteValue = "approve" | "reject" | "abstain";

export type GovernanceStatus = "active" | "approved" | "rejected" | "expired";

export interface GovernanceVote {
	peerId: string;
	value: GovernanceVoteValue;
	timestamp: number;
	reason?: string;
}

export interface GovernanceProposal {
	id: string;
	targetPeerId: string;
	proposedRole: string;
	createdBy: string;
	createdAt: number;
	expiresAt: number;
	status: GovernanceStatus;
	votes: Record<string, GovernanceVote>;
}

/**
 * Creates a new admin candidacy for a peer.
 * By default, the candidacy expires in 5 minutes.
 */
export function createCandidacy(peerId: string): GovernanceProposal {
	const now = Date.now();
	return {
		id:
			typeof crypto !== "undefined" && crypto.randomUUID
				? crypto.randomUUID()
				: `prop-${now}-${Math.random().toString(36).slice(2, 9)}`,
		targetPeerId: peerId,
		proposedRole: "admin",
		createdBy: peerId,
		createdAt: now,
		expiresAt: now + 5 * 60 * 1000,
		status: "active",
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
	reason?: string,
): void {
	proposal.votes[voterPeerId] = {
		peerId: voterPeerId,
		value: approve ? "approve" : "reject",
		timestamp: Date.now(),
		reason,
	};
}

/**
 * Returns true if proposal is still within its voting window.
 */
export function isProposalActive(proposal: GovernanceProposal, now = Date.now()): boolean {
	return proposal.status === "active" && proposal.expiresAt > now;
}

/**
 * Tally approve/reject counts.
 */
export function tallyVotes(proposal: GovernanceProposal): {
	approve: number;
	reject: number;
	total: number;
} {
	const values = Object.values(proposal.votes);
	const approve = values.filter((v) => v.value === "approve").length;
	const reject = values.filter((v) => v.value === "reject").length;
	return { approve, reject, total: values.length };
}

/**
 * Evaluate candidacy against active peer count.
 * Majority = ceil((totalActivePeers + 1) / 2)  (classic majority of n peers)
 * Any reject → rejected; expired without majority → expired; else active/approved.
 */
export function evaluateCandidacy(
	proposal: GovernanceProposal,
	totalActivePeers: number,
	now = Date.now(),
): GovernanceStatus {
	const { approve, reject } = tallyVotes(proposal);
	if (reject > 0) {
		proposal.status = "rejected";
		return "rejected";
	}
	const majority = Math.ceil((totalActivePeers + 1) / 2);
	if (approve >= majority) {
		proposal.status = "approved";
		return "approved";
	}
	if (now >= proposal.expiresAt) {
		proposal.status = "expired";
		return "expired";
	}
	proposal.status = "active";
	return "active";
}
