import { AlertCircle, Check, X } from 'lucide-react';
import { dbSync } from 'p2p-mesh-core';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import Modal from './ui/Modal';

interface MergeResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MergeResolutionModal({ isOpen, onClose }: MergeResolutionModalProps) {
  const { t } = useI18n();
  const { state, dispatch } = useApp();
  const pendingEdits = state.pendingEdits || [];
  const isAdmin = state.role === 'admin' || dbSync.isLocalAuthority();

  const [selectedFields, setSelectedFields] = useState<Record<string, 'original' | 'proposed'>>({});

  if (!isOpen || !isAdmin || pendingEdits.length === 0) return null;

  const currentEdit = pendingEdits[0]; // Process one by one

  const original = currentEdit.originalData || {};
  const proposed = currentEdit.proposedData || {};

  // Find differing fields
  const diffFields = Object.keys(proposed).filter((key) => {
    // Ignore metadata
    if (['updatedAt', 'updatedBy', 'isActive', 'signature'].includes(key)) return false;
    return JSON.stringify(original[key]) !== JSON.stringify(proposed[key]);
  });

  const handleResolve = (resolution: 'approve' | 'reject') => {
    if (resolution === 'reject') {
      dbSync.resolvePendingEdit(currentEdit.id, 'reject');
      dispatch({ type: 'SYNC_STATE', payload: dbSync.getState(state.localPeerId) });
      if (pendingEdits.length <= 1) {
        onClose();
      }
      return;
    }

    // Merge selected fields
    const mergedData = { ...original };

    // Default to proposed if not explicitly selected, or respect selection
    diffFields.forEach((field) => {
      const choice = selectedFields[field] || 'proposed';
      if (choice === 'proposed') {
        mergedData[field] = proposed[field];
      }
    });

    // Update metadata
    mergedData.updatedAt = new Date().toISOString();
    mergedData.updatedBy = state.localPeerId || 'local';

    dbSync.resolvePendingEdit(currentEdit.id, 'approve', mergedData);
    dispatch({ type: 'SYNC_STATE', payload: dbSync.getState(state.localPeerId) });

    // Clear selections for next edit
    setSelectedFields({});

    if (pendingEdits.length <= 1) {
      onClose();
    }
  };

  const toggleFieldSelection = (field: string, choice: 'original' | 'proposed') => {
    setSelectedFields((prev) => ({ ...prev, [field]: choice }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('p2pSync.conflictResolver.title')}>
      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl mb-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-medium text-yellow-100">{t('p2pSync.conflictResolver.pendingEditTitle')}</h3>
          <p className="text-sm text-yellow-200/70">
            {t('p2pSync.conflictResolver.pendingEditDesc', { peerId: currentEdit.peerId.slice(0, 6) })}
          </p>
        </div>
      </div>

      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {diffFields.length === 0 ? (
          <p className="text-zinc-400 text-center py-4">{t('p2pSync.conflictResolver.noDiffs')}</p>
        ) : (
          diffFields.map((field) => {
            const currentChoice = selectedFields[field] || 'proposed';
            return (
              <div key={field} className="border border-white/10 rounded-xl p-3 bg-white/5">
                <h4 className="text-sm font-medium text-zinc-300 capitalize mb-2">{field}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFieldSelection(field, 'original')}
                    className={`p-2 text-left rounded-lg text-sm border transition-colors ${
                      currentChoice === 'original'
                        ? 'bg-blue-500/20 border-blue-500 text-white'
                        : 'bg-black/20 border-white/5 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="text-xs text-zinc-500 mb-1">{t('p2pSync.conflictResolver.currentVersion')}</div>
                    <div className="truncate">{JSON.stringify(original[field])}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFieldSelection(field, 'proposed')}
                    className={`p-2 text-left rounded-lg text-sm border transition-colors ${
                      currentChoice === 'proposed'
                        ? 'bg-green-500/20 border-green-500 text-white'
                        : 'bg-black/20 border-white/5 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="text-xs text-zinc-500 mb-1">{t('p2pSync.conflictResolver.newVersion')}</div>
                    <div className="truncate">{JSON.stringify(proposed[field])}</div>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6 flex justify-between items-center pt-4 border-t border-white/10">
        <div className="text-sm text-zinc-400">
          {t('p2pSync.conflictResolver.pendingCount', { count: pendingEdits.length })}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleResolve('reject')}
            className="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            {t('p2pSync.conflictResolver.rejectAll')}
          </button>
          <button
            onClick={() => handleResolve('approve')}
            className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition-colors flex items-center gap-2 font-medium"
          >
            <Check className="w-4 h-4" />
            {t('p2pSync.conflictResolver.mergeSave')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
