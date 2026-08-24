import { Html5Qrcode, type Html5QrcodeResult } from 'html5-qrcode';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

  // Use a ref to hold the latest onScan callback to avoid stale closures
  // without needing to restart the scanner on every parent render.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let isMounted = true;
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
            // Explicit formats: QR + common retail barcodes
            formatsToSupport: [
              // Html5QrcodeSupportedFormats enum values (numeric)
              0, // QR_CODE
              2, // AZTEC
              8, // EAN_13
              9, // EAN_8
              10, // UPC_A
              11, // UPC_E
              6, // CODE_128
              5, // CODE_39
            ],
          };

          const handleScanSuccess = (decodedText: string, _decodedResult: Html5QrcodeResult) => {
            try {
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                navigator.vibrate(50);
              }
            } catch {
              /* ignore */
            }
            onScanRef.current(decodedText);
            stopScanner();
          };

          const handleScanError = (_errorMessage: string) => {
            // This callback is called frequently, so we typically ignore errors unless debugging
          };

          await qrCodeScanner.start({ facingMode: 'environment' }, config, handleScanSuccess, handleScanError);

          if (!isMounted) {
            if (scannerRef.current?.isScanning) {
              scannerRef.current
                .stop()
                .then(() => scannerRef.current?.clear())
                .catch(console.error);
            }
            return;
          }
        } else {
          if (isMounted) setError(t('scanner.noCameras'));
        }
      } catch (err: any) {
        if (!isMounted) return;
        if (err.name === 'NotAllowedError') {
          setError(t('scanner.permissionDenied'));
        } else {
          setError(t('scanner.genericError'));
          console.error('Scanner init error:', err);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    const stopScanner = () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch((err) => {
              console.error('Failed to stop the scanner.', err);
            });
          }
        } catch (err) {
          console.error('Synchronous error stopping the scanner.', err);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [t]);

  const content = (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-panel p-4 md:p-6 rounded-lg shadow-xl border border-foreground/30 max-w-md w-full m-4">
        <h3 className="text-lg font-bold mb-4 text-center text-foreground">{t('scanner.title')}</h3>
        <div
          id="reader"
          style={{ width: '100%', borderRadius: '8px', overflow: 'hidden', minHeight: '250px' }}
          className="bg-surface flex items-center justify-center text-center text-foreground/70"
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
          className="w-full mt-4 bg-transparent border border-foreground/50 text-foreground font-bold py-2 px-4 rounded-lg hover:bg-foreground/10 transition-all active:scale-95"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default BarcodeScanner;
