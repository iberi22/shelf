import React from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onScan: (text: string) => void;
  title: string;
  instruction: string;
}

const QRScannerModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-6 rounded-lg max-w-md w-full">
        <h2 className="text-xl font-bold text-[#F5F5DC] mb-4">Scanner Mock</h2>
        <button onClick={onClose} className="mt-4 w-full bg-[#F5F5DC] text-black py-2 rounded-lg">Close</button>
      </div>
    </div>
  );
};

export default QRScannerModal;
