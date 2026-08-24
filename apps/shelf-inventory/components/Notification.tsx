import React from 'react';

interface NotificationProps {
  message: string;
  type: 'error' | 'success' | 'info';
  durationMs?: number;
  onClose: () => void;
}

const Notification: React.FC<NotificationProps> = ({ message, type, durationMs = 5000, onClose }) => {
  const baseClasses =
    'fixed top-5 left-1/2 -translate-x-1/2 w-full max-w-md p-4 rounded-lg text-center shadow-lg z-[150] animate-fade-in-down';
  const typeClasses = {
    error: 'bg-red-500/90 border border-red-400 text-foreground',
    success: 'bg-green-500/90 border border-green-400 text-foreground',
    info: 'bg-sky-500/90 border border-sky-400 text-foreground',
  };

  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, durationMs); // Auto-dismiss after the configured duration
    return () => clearTimeout(timer);
  }, [durationMs, onClose]);

  return <div className={`${baseClasses} whitespace-pre-line ${typeClasses[type]}`}>{message}</div>;
};

export default Notification;
