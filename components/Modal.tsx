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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="bg-[#1e1e1e] p-6 md:p-8 rounded-lg shadow-xl border border-[#F5F5DC]/30 max-w-lg w-full m-4 animate-modal-enter"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="text-2xl text-[#F5F5DC]/70 hover:text-[#F5F5DC] transition-all active:scale-95"
            aria-label={t('modal.close')}
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
