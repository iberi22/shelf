import { Html5QrcodeScanner } from 'html5-qrcode';
import { useEffect } from 'react';

interface QRScannerModalProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScannerModal({ onScan, onClose }: QRScannerModalProps) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 250, height: 250 } }, false);

    scanner.render(
      (text) => {
        scanner.clear();
        onScan(text);
      },
      () => {
        // Ignore background scan errors
      },
    );

    return () => {
      scanner.clear().catch(console.error);
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Escanear Código QR</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">
            &times;
          </button>
        </div>

        <div id="qr-reader" className="w-full bg-black overflow-hidden rounded-lg"></div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
