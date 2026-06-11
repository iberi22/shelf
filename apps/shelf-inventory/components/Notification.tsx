import React from 'react';

interface NotificationProps {
  message: string;
  type: 'error' | 'success' | 'info';
  onClose: () => void;
}

const Notification: React.FC<NotificationProps> = ({ message, type, onClose }) => {
  const baseClasses =
    'fixed top-5 left-1/2 -translate-x-1/2 w-full max-w-md p-4 rounded-lg text-center shadow-lg z-[150] animate-fade-in-down';
  const typeClasses = {
    error: 'bg-red-500/90 border border-red-400 text-[#F5F5DC]',
    success: 'bg-green-500/90 border border-green-400 text-[#F5F5DC]',
    info: 'bg-sky-500/90 border border-sky-400 text-[#F5F5DC]',
  };

  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // Auto-dismiss after 5 seconds
    return () => clearTimeout(timer);
  }, [onClose]);

  return <div className={`${baseClasses} ${typeClasses[type]}`}>{message}</div>;
};

export default Notification;
