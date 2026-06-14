import { Html5QrcodeScanner } from 'html5-qrcode';
import { useEffect } from 'react';

interface QRScannerModalProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScannerModal({ onScan, onClose }: QRScannerModalProps) {
  useEffect(() => {
    const boxSize =
      typeof window !== 'undefined' ? Math.max(180, Math.min(250, Math.floor(window.innerWidth - 96))) : 250;

    const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: boxSize, height: boxSize } }, false);

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
    <div className="fixed inset-0 z-50 flex h-[var(--app-height,100vh)] items-end justify-center overflow-y-auto bg-black/60 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[calc(var(--app-height,100vh)-1.5rem)] w-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[calc(var(--app-height,100vh)-2rem)] sm:max-w-md sm:rounded-lg">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
          <h2 className="min-w-0 flex-1 text-lg font-bold text-gray-900 sm:text-xl">Escanear Código QR</h2>
          <button onClick={onClose} className="shrink-0 text-2xl font-bold text-gray-500 hover:text-gray-700">
            &times;
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div id="qr-reader" className="w-full overflow-hidden rounded-lg bg-black" />
        </div>

        <div className="border-t border-gray-200 p-4">
          <button
            onClick={onClose}
            className="w-full rounded bg-gray-200 px-4 py-2 text-gray-800 transition-colors hover:bg-gray-300"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
