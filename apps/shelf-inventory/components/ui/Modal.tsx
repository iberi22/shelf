import type React from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';

/**
 * React port of @swal/ui/components/Modal.svelte (SHELF-212).
 * Misma estructura (`swal-modal-root` → `.backdrop` + `.modal` con header/body/
 * edges) y mismos tokens `--swal-*` que el design system. API compatible con el
 * Modal legacy de shelf (`isOpen`/`onClose`/`title`/`size`).
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'default' | 'wide';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: ModalSize;
}

/** Sizes del DS: sm=28rem, md=32rem, lg=36rem (legacy shelf: default→md, wide→lg). */
const sizeClass = (size: ModalSize): string => {
  switch (size) {
    case 'sm':
      return 'sm';
    case 'lg':
      return 'lg';
    case 'wide':
      return 'lg';
    default:
      return 'md';
  }
};

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'default' }) => {
  const { t } = useI18n();

  // ESC cierra + lock del scroll del body mientras está abierto (como el original)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeydown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="swal-modal-root fixed inset-0 z-[60] flex items-center justify-center p-4 swal-enter">
      {/* Backdrop */}
      <button type="button" className="backdrop" onClick={onClose} aria-label={t('modal.close')} tabIndex={-1} />

      {/* Contenido */}
      <div
        className={`modal ${sizeClass(size)} swal-enter-scale`}
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
      >
        <div className="header">
          <div className="header-title">
            <h3>{title}</h3>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label={t('modal.close')}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <title>{t('modal.close')}</title>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="body swal-scrollbar">{children}</div>

        {/* Gradientes decorativos */}
        <div className="edge top" aria-hidden="true" />
        <div className="edge bottom" aria-hidden="true" />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default Modal;
