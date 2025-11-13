import type React from 'react';
import { useState } from 'react';
import { useI18n } from '../context/I18nContext';
import type { UserRole } from '../types';
import Modal from './Modal';

interface InviteMemberModalProps {
  onClose: () => void;
  onInviteSent: () => void; // Simplified for UI-only implementation
}

const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ onClose, onInviteSent }) => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError(t('validation.invalidEmail'));
      return;
    }
    setError('');
    // In a real app, this would trigger a backend call.
    // For now, we just call the success callback.
    onInviteSent();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={t('settings.team.inviteTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-foreground/70">{t('settings.team.inviteDescription')}</p>
        <div>
          <label htmlFor="invite-email" className="block text-xs font-medium text-foreground/80 mb-1">
            {t('common.email')}
          </label>
          <input
            id="invite-email"
            type="email"
            placeholder={t('settings.team.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={`w-full p-2 bg-[#121212] border rounded-md ${error ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
          />
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-xs font-medium text-foreground/80 mb-1">
            {t('settings.team.role')}
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30"
          >
            <option value="member">{t('settings.team.roles.member')}</option>
            <option value="admin">{t('settings.team.roles.admin')}</option>
          </select>
        </div>
        <div className="flex justify-end gap-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-colors active:scale-95"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95"
          >
            {t('settings.team.sendInvitation')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default InviteMemberModal;
