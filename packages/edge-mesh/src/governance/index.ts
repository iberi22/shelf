import type {
	GovernanceProposal,
	GovernanceStatus,
	GovernanceVote,
	GovernanceVoteValue,
} from '../types';

export type GovernancePolicy = 'active-unanimous' | 'total-unanimous';

export interface GovernanceManagerOptions {
	now?: () => number;
	idFactory?: () => string;
	policy?: GovernancePolicy;
	timeoutMs?: number;
	activePeerIds?: () => string[];
	allPeerIds?: () => string[];
}

export class GovernanceManager {
	private proposals = new Map<string, GovernanceProposal>();
	private now: () => number;
	private idFactory: () => string;
	private policy: GovernancePolicy;
	private timeoutMs: number;
	private activePeerIds: () => string[];
	private allPeerIds: () => string[];

	constructor(options: GovernanceManagerOptions = {}) {
		this.now = options.now || (() => Date.now());
		this.idFactory =
			options.idFactory ||
			(() => {
				if (globalThis.crypto?.randomUUID)
					return globalThis.crypto.randomUUID();
				return `proposal-${this.now()}-${Math.random().toString(36).slice(2)}`;
			});
		this.policy = options.policy || 'active-unanimous';
		this.timeoutMs = options.timeoutMs || 5 * 60 * 1000;
		this.activePeerIds = options.activePeerIds || (() => []);
		this.allPeerIds = options.allPeerIds || this.activePeerIds;
	}

	createProposal(input: {
		targetPeerId: string;
		proposedRole: string;
		createdBy: string;
		metadata?: Record<string, unknown>;
	}): GovernanceProposal {
		if (input.targetPeerId === input.createdBy) {
			throw new Error('A peer cannot promote itself without governance');
		}
		const createdAt = this.now();
		const proposal: GovernanceProposal = {
			id: this.idFactory(),
			targetPeerId: input.targetPeerId,
			proposedRole: input.proposedRole,
			createdBy: input.createdBy,
			createdAt,
			expiresAt: createdAt + this.timeoutMs,
			status: 'active',
			votes: {},
			metadata: input.metadata,
		};
		this.proposals.set(proposal.id, proposal);
		return proposal;
	}

	vote(
		proposalId: string,
		peerId: string,
		value: GovernanceVoteValue,
		reason?: string,
	): GovernanceProposal {
		const proposal = this.getRequired(proposalId);
		if (proposal.status !== 'active') return proposal;

		const vote: GovernanceVote = {
			peerId,
			value,
			reason,
			timestamp: this.now(),
		};
		proposal.votes[peerId] = vote;
		proposal.status = this.resolveStatus(proposal);
		this.proposals.set(proposal.id, proposal);
		return proposal;
	}

	resolve(proposalId: string): GovernanceProposal {
		const proposal = this.getRequired(proposalId);
		proposal.status = this.resolveStatus(proposal);
		this.proposals.set(proposal.id, proposal);
		return proposal;
	}

	getProposal(proposalId: string): GovernanceProposal | undefined {
		return this.proposals.get(proposalId);
	}

	listProposals(): GovernanceProposal[] {
		return Array.from(this.proposals.values());
	}

	import(proposals: GovernanceProposal[]): void {
		for (const proposal of proposals) {
			this.proposals.set(proposal.id, proposal);
		}
	}

	private getRequired(proposalId: string): GovernanceProposal {
		const proposal = this.proposals.get(proposalId);
		if (!proposal) throw new Error(`Unknown governance proposal ${proposalId}`);
		return proposal;
	}

	private resolveStatus(proposal: GovernanceProposal): GovernanceStatus {
		if (proposal.status !== 'active') return proposal.status;
		if (proposal.expiresAt <= this.now()) return 'expired';

		const voters =
			this.policy === 'total-unanimous'
				? this.allPeerIds()
				: this.activePeerIds();
		const requiredVoters = voters.filter(
			(peerId) => peerId !== proposal.targetPeerId,
		);
		const votes = Object.values(proposal.votes);

		if (votes.some((vote) => vote.value === 'reject')) return 'rejected';
		if (requiredVoters.length === 0) return 'rejected';
		if (
			requiredVoters.every(
				(peerId) => proposal.votes[peerId]?.value === 'approve',
			)
		) {
			return 'approved';
		}
		return 'active';
	}
}

export const createGovernanceManager = (
	options: GovernanceManagerOptions = {},
) => new GovernanceManager(options);
