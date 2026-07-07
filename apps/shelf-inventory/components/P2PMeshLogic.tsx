import {
  Timer,
  UserCheck,
  Vote,
} from 'lucide-react';
import type {
  GovernanceProposal,
  GovernanceVote,
  GovernanceVoteValue,
} from 'p2p-mesh-core';
import { dbSync } from 'p2p-mesh-core';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useUI } from '../context/UIContext';
import { generateId } from '../utils/id';

const P2PMeshLogic: React.FC = () => {
  const { state } = useAppContext();
  const { showNotification } = useUI();
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [now, setNow] = useState(Date.now());

  const isNextEligible = useMemo(() => {
    if (state.role === 'admin') return false;
    const activeNonAdmins = state.peers.filter((p) => p.role !== 'admin' && p.status !== 'offline').map((p) => p.id);
    if (state.localPeerId && !activeNonAdmins.includes(state.localPeerId)) {
      activeNonAdmins.push(state.localPeerId);
    }
    activeNonAdmins.sort();
    return activeNonAdmins[0] === state.localPeerId;
  }, [state.peers, state.localPeerId, state.role]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const proposalsMap = dbSync.doc.getMap('proposals');
    const updateProposals = () => {
      setProposals(Array.from(proposalsMap.values()) as GovernanceProposal[]);
    };

    updateProposals();
    proposalsMap.observe(updateProposals);
    return () => proposalsMap.unobserve(updateProposals);
  }, []);

  const handlePostulate = () => {
    if (!state.localPeerId) return;
    const proposalId = generateId();
    const proposal: GovernanceProposal = {
      id: proposalId,
      targetPeerId: state.localPeerId,
      proposedRole: 'admin',
      createdBy: state.localPeerId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      status: 'active',
      votes: {},
    };

    dbSync.doc.transact(() => {
      const proposalsMap = dbSync.doc.getMap('proposals');
      proposalsMap.set(proposalId, proposal as any);
    }, 'local');

    showNotification('Postulación como Admin enviada', 'success');
  };

  const handleVote = (proposalId: string, value: GovernanceVoteValue) => {
    if (!state.localPeerId) return;
    const proposalsMap = dbSync.doc.getMap('proposals');
    const proposal = proposalsMap.get(proposalId) as GovernanceProposal | undefined;
    if (proposal?.status !== 'active') return;

    const vote: GovernanceVote = {
      peerId: state.localPeerId,
      value,
      timestamp: Date.now(),
    };

    dbSync.doc.transact(() => {
      const updatedProposal = {
        ...proposal,
        votes: {
          ...proposal.votes,
          [state.localPeerId || '']: vote,
        },
      };

      // Resolve status logic (simplified)
      const votes = Object.values(updatedProposal.votes);
      const approveCount = votes.filter((v: GovernanceVote) => v.value === 'approve').length;
      const rejectCount = votes.filter((v: GovernanceVote) => v.value === 'reject').length;

      const totalActivePeers = state.peers.filter((p) => p.status !== 'offline').length;
      const majority = Math.ceil((totalActivePeers + 1) / 2);

      if (rejectCount > 0) {
        updatedProposal.status = 'rejected';
      } else if (approveCount >= majority) {
        updatedProposal.status = 'approved';
        // Auto-promote if approved
        dbSync.updatePeerConfig(updatedProposal.targetPeerId, 'admin', undefined, state.localPeerId || undefined);
      }

      proposalsMap.set(proposalId, updatedProposal as any);
    }, 'local');
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg">
      <div className="flex items-center gap-2 mb-4">
        <Vote className="h-5 w-5 text-[#4ADE80]" aria-hidden="true" />
        <h3 className="text-xl font-bold text-[#F5F5DC]">Elección de Admin (Consenso)</h3>
      </div>

      {proposals.length > 0 ? (
        <div className="space-y-4">
          {proposals.map((proposal) => {
            const isCandidate = proposal.targetPeerId === state.localPeerId;
            const timeLeft = Math.max(0, Math.floor((proposal.expiresAt - now) / 1000));
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            const votes = Object.values(proposal.votes);
            const approveCount = votes.filter((v: GovernanceVote) => v.value === 'approve').length;
            const hasVoted = state.localPeerId && proposal.votes[state.localPeerId];

            return (
              <div key={proposal.id} className="p-4 rounded-lg bg-[#121212] border border-[#F5F5DC]/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-yellow-400" />
                      <span className="text-sm font-semibold text-[#F5F5DC]">Candidato:</span>
                      <code className="text-xs text-yellow-400 truncate">{proposal.targetPeerId}</code>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[#F5F5DC]/60">
                      <span className="flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        {proposal.status === 'active'
                          ? `${minutes}:${seconds.toString().padStart(2, '0')}`
                          : 'Finalizado'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Vote className="h-3 w-3" />
                        {approveCount} votos positivos
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                        proposal.status === 'active'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : proposal.status === 'approved'
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}
                    >
                      {proposal.status === 'active'
                        ? 'Pendiente'
                        : proposal.status === 'approved'
                          ? 'Aprobado'
                          : proposal.status === 'rejected'
                            ? 'Rechazado'
                            : 'Expirado'}
                    </span>

                    {proposal.status === 'active' && !isCandidate && !hasVoted && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleVote(proposal.id, 'approve')}
                          className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs font-bold hover:bg-green-500/30 transition-colors"
                        >
                          Votar Sí
                        </button>
                        <button
                          onClick={() => handleVote(proposal.id, 'reject')}
                          className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs font-bold hover:bg-red-500/30 transition-colors"
                        >
                          Votar No
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 bg-[#121212] rounded-lg border border-dashed border-[#F5F5DC]/20">
          <p className="text-sm text-[#F5F5DC]/40 italic">No hay elecciones activas en este momento.</p>
          {isNextEligible && (
            <button
              onClick={handlePostulate}
              className="mt-4 px-6 py-2 bg-[#F5F5DC] text-[#121212] rounded-lg text-sm font-bold hover:bg-opacity-80 active:scale-95 transition-all"
            >
              Postularme como Admin
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default P2PMeshLogic;
