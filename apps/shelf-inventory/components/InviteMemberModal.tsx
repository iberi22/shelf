import type { TeamMemberRole } from 'p2p-mesh-core';
import { canInvite } from 'p2p-mesh-core';
import type React from 'react';
import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';
import Modal from './ui/Modal';

interface InviteMemberModalProps {
  onClose: () => void;
  onInviteSent: () => void;
}

const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ onClose, onInviteSent }) => {
  const { t } = useI18n();
  const { showNotification } = useUI();
  const { state, dispatch } = useAppContext();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamMemberRole>('collaborator');
  const [error, setError] = useState('');
  const [lastLink, setLastLink] = useState<string | null>(null);

  const generateInviteLink = (peerId: string, inviteRole: TeamMemberRole, inviteEmail: string) => {
    const baseUrl = window.location.origin;
    const params = new URLSearchParams({
      peerId,
      role: inviteRole,
      email: inviteEmail,
      invite: 'true',
    });
    return `${baseUrl}?${params.toString()}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!canInvite(state.role, state.permissions)) {
      setError(t('settings.team.inviteForbidden') || 'Only admins can invite team members');
      showNotification(t('settings.team.inviteForbidden') || 'Only admins can invite team members', 'error');
      return;
    }

    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError(t('validation.invalidEmail'));
      return;
    }

    if (state.teamMembers.find((m) => m.email === email)) {
      setError(t('settings.team.alreadyMember') || 'This user is already a team member');
      return;
    }

    setError('');

    const inviteLink = generateInviteLink(state.localPeerId || 'shelf-master', role, email);
    setLastLink(inviteLink);

    dispatch({
      type: 'ADD_TEAM_MEMBER',
      payload: {
        id: crypto.randomUUID(),
        email: email.trim().toLowerCase(),
        role,
      },
    });

    const subject = encodeURIComponent(t('settings.team.inviteSubject') || 'Invitation to join Shelf Team');
    const body = encodeURIComponent(
      `${t('settings.team.inviteBody') || 'You have been invited to join the Shelf team. Click the link below to accept:'}\n\n${inviteLink}`,
    );

    void navigator.clipboard?.writeText(inviteLink).then(
      () => {
        showNotification(t('settings.team.linkCopied') || 'Invite link copied to clipboard', 'success');
      },
      () => {
        /* ignore */
      },
    );

    try {
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank', 'noopener,noreferrer');
    } catch {
      /* ignore */
    }

    onInviteSent();
  };

  if (!canInvite(state.role, state.permissions)) {
    return (
      <Modal isOpen={true} onClose={onClose} title={t('settings.team.inviteTitle')}>
        <div data-testid="invite-forbidden" className="space-y-4">
          <p className="text-sm text-red-400">
            {t('settings.team.inviteForbidden') || 'Only admins can invite team members'}
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="invite-cancel"
              onClick={onClose}
              className="bg-transparent border border-foreground/50 font-bold py-2 px-4 rounded-lg hover:bg-foreground/10 transition-colors active:scale-95"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={t('settings.team.inviteTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4" data-testid="invite-member-modal">
        <p className="text-sm text-foreground/70">{t('settings.team.inviteDescription')}</p>
        <div>
          <label htmlFor="invite-email" className="block text-xs font-medium text-foreground/80 mb-1">
            {t('common.email')}
          </label>
          <input
            id="invite-email"
            data-testid="invite-email-input"
            type="email"
            placeholder={t('settings.team.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={`w-full p-2 bg-surface border rounded-md ${error ? 'border-red-400/70' : 'border-foreground/30'}`}
          />
          {error && (
            <p className="text-red-400 text-xs mt-1" data-testid="invite-error">
              {error}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-xs font-medium text-foreground/80 mb-1">
            {t('settings.team.role')}
          </label>
          <select
            id="invite-role"
            data-testid="invite-role-select"
            value={role}
            onChange={(e) => setRole(e.target.value as TeamMemberRole)}
            className="w-full p-2 bg-surface border rounded-md border-foreground/30"
          >
            <option value="collaborator">{t('p2pSync.roleCollaborator') || 'Collaborator'}</option>
            <option value="admin">{t('p2pSync.roleAdmin') || 'Admin'}</option>
            <option value="vendedor">{t('p2pSync.roleVendedor') || 'Vendedor'}</option>
          </select>
        </div>
        {lastLink && (
          <div
            className="text-xs break-all bg-background/50 border border-foreground/20 rounded p-2"
            data-testid="invite-link-preview"
          >
            {lastLink}
          </div>
        )}
        <div className="flex justify-end gap-4 pt-4">
          <button
            type="button"
            data-testid="invite-cancel"
            onClick={onClose}
            className="bg-transparent border border-foreground/50 font-bold py-2 px-4 rounded-lg hover:bg-foreground/10 transition-colors active:scale-95"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            data-testid="invite-submit"
            className="bg-foreground text-surface font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95"
          >
            {t('settings.team.sendInvitation')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default InviteMemberModal;
