import { Html5Qrcode, type Html5QrcodeResult } from 'html5-qrcode';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const startScanner = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const qrCodeScanner = new Html5Qrcode('reader');
          scannerRef.current = qrCodeScanner;

          const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
          };

          const handleScanSuccess = (decodedText: string, _decodedResult: Html5QrcodeResult) => {
            onScan(decodedText);
            stopScanner();
          };

          const handleScanError = (_errorMessage: string) => {
            // This callback is called frequently, so we typically ignore errors unless debugging
          };

          await qrCodeScanner.start({ facingMode: 'environment' }, config, handleScanSuccess, handleScanError);
        } else {
          setError(t('scanner.noCameras'));
        }
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          setError(t('scanner.permissionDenied'));
        } else {
          setError(t('scanner.genericError'));
          console.error('Scanner init error:', err);
        }
      } finally {
        setIsLoading(false);
      }
    };

    const stopScanner = () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch((err) => {
          console.error('Failed to stop the scanner.', err);
        });
      }
    };

    startScanner();

    return () => {
      stopScanner();
    };
  }, [onScan, t]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#1e1e1e] p-4 md:p-6 rounded-lg shadow-xl border border-[#F5F5DC]/30 max-w-md w-full m-4">
        <h3 className="text-lg font-bold mb-4 text-center text-[#F5F5DC]">{t('scanner.title')}</h3>
        <div
          id="reader"
          style={{ width: '100%', borderRadius: '8px', overflow: 'hidden', minHeight: '250px' }}
          className="bg-[#121212] flex items-center justify-center text-center text-[#F5F5DC]/70"
        >
          {isLoading && <p>{t('scanner.checking')}</p>}
          {error && (
            <div className="p-4">
              <p className="font-semibold text-red-400">{error}</p>
              {error === t('scanner.permissionDenied') && (
                <p className="text-xs mt-2">{t('scanner.permissionDeniedHelp')}</p>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-full mt-4 bg-transparent border border-[#F5F5DC]/50 text-[#F5F5DC] font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-all active:scale-95"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};

export default BarcodeScanner;
