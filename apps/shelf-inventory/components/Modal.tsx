import type React from 'react';
import { useI18n } from '../context/I18nContext';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const { t } = useI18n();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex h-[var(--app-height,100vh)] items-end justify-center overflow-y-auto bg-black/70 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-modal-enter flex max-h-[calc(var(--app-height,100vh)-1.5rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-[#F5F5DC]/30 bg-[#1e1e1e] shadow-xl sm:max-h-[calc(var(--app-height,100vh)-2rem)] sm:max-w-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#F5F5DC]/10 p-4 sm:p-6">
          <h3 className="min-w-0 flex-1 text-lg font-bold text-[#F5F5DC] sm:text-xl">{title}</h3>
          <button
            onClick={onClose}
            className="shrink-0 text-2xl text-[#F5F5DC]/70 transition-all active:scale-95 hover:text-[#F5F5DC]"
            aria-label={t('modal.close')}
          >
            &times;
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6 md:p-8">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
