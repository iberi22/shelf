import { type CameraDevice, Html5Qrcode } from 'html5-qrcode';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface QRScannerModalProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScannerModal({ onScan, onClose }: QRScannerModalProps) {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    let mounted = true;

    const initScanner = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!mounted) return;

        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back camera if found
          const backCamera = devices.find(
            (device) =>
              device.label.toLowerCase().includes('back') ||
              device.label.toLowerCase().includes('rear') ||
              device.label.toLowerCase().includes('environment'),
          );

          setActiveCameraId(backCamera ? backCamera.id : devices[0].id);
        } else {
          setError('No se encontraron cámaras.');
        }
      } catch (err: any) {
        console.error('Error getting cameras', err);
        if (mounted) {
          setError('No se pudo acceder a las cámaras. Verifique los permisos.');
        }
      }
    };

    initScanner();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current
              .stop()
              .then(() => scannerRef.current?.clear())
              .catch(console.error);
          }
        } catch (err) {
          console.error('Sync error on stop:', err);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!activeCameraId) return;

    let mounted = true;

    const startCamera = async () => {
      try {
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode('qr-reader');
        }

        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }

        if (!mounted) return;

        const boxSize =
          typeof window !== 'undefined' ? Math.max(180, Math.min(250, Math.floor(window.innerWidth - 96))) : 250;

        await scannerRef.current.start(
          activeCameraId,
          {
            fps: 10,
            qrbox: { width: boxSize, height: boxSize },
          },
          (decodedText) => {
            if (scannerRef.current?.isScanning) {
              scannerRef.current
                .stop()
                .then(() => scannerRef.current?.clear())
                .catch(console.error);
            }
            onScan(decodedText);
          },
          (_errorMessage) => {
            // ignore background scan errors
          },
        );

        if (!mounted) {
          if (scannerRef.current?.isScanning) {
            scannerRef.current
              .stop()
              .then(() => scannerRef.current?.clear())
              .catch(console.error);
          }
          return;
        }

        setIsScanning(true);
        setError('');
      } catch (err: any) {
        console.error('Error starting scanner:', err);
        if (mounted) {
          setError('Error al iniciar la cámara.');
          setIsScanning(false);
        }
      }
    };

    startCamera();

    return () => {
      mounted = false;
    };
  }, [activeCameraId, onScan]);

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveCameraId(e.target.value);
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex h-[var(--app-height,100vh)] items-end justify-center overflow-y-auto bg-black/60 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[calc(var(--app-height,100vh)-1.5rem)] w-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-t-2xl bg-[#1a1a1a] border border-[#F5F5DC]/20 shadow-2xl sm:max-h-[calc(var(--app-height,100vh)-2rem)] sm:max-w-md sm:rounded-lg">
        <div className="flex items-start justify-between gap-3 border-b border-[#F5F5DC]/10 p-4">
          <h2 className="min-w-0 flex-1 text-lg font-bold text-[#F5F5DC] sm:text-xl">Escanear Código QR</h2>
          <button onClick={onClose} className="shrink-0 text-2xl font-bold text-[#F5F5DC]/50 hover:text-[#F5F5DC]">
            &times;
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 flex flex-col items-center">
          {error && <div className="text-red-400 mb-4 text-center text-sm">{error}</div>}

          {cameras.length > 1 && (
            <div className="w-full mb-4">
              <label htmlFor="camera-select" className="block text-xs font-medium text-[#F5F5DC]/60 mb-1">
                Seleccionar Cámara
              </label>
              <select
                id="camera-select"
                value={activeCameraId}
                onChange={handleCameraChange}
                className="w-full rounded-md border border-[#F5F5DC]/30 bg-[#121212] py-2 px-3 text-[#F5F5DC] focus:outline-none focus:border-yellow-400"
              >
                {cameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.label || `Cámara ${camera.id.substring(0, 5)}...`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            id="qr-reader"
            className="w-full overflow-hidden rounded-lg bg-black border border-[#F5F5DC]/10 flex items-center justify-center min-h-[300px]"
          >
            {!isScanning && !error && <div className="text-[#F5F5DC]/50 animate-pulse">Iniciando cámara...</div>}
          </div>
        </div>

        <div className="border-t border-[#F5F5DC]/10 p-4">
          <button
            onClick={onClose}
            className="w-full rounded bg-[#333] px-4 py-2 font-bold text-white transition-colors hover:bg-[#444]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
