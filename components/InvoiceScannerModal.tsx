import { Html5Qrcode } from 'html5-qrcode';
import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';

interface InvoiceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageCapture: (imageBase64: string, mimeType: string) => void;
  isLoading?: boolean;
}

export default function InvoiceScannerModal({
  isOpen,
  onClose,
  onImageCapture,
  isLoading = false,
}: InvoiceScannerModalProps) {
  const [scanMode, setScanMode] = useState<'camera' | 'upload' | null>(null);
  const [cameraError, setCameraError] = useState<string>('');
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const cameraContainerId = 'invoice-camera-container';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize camera scanner
  useEffect(() => {
    if (!isOpen || scanMode !== 'camera') {
      return;
    }

    const initCamera = async () => {
      try {
        setCameraError('');
        const scanner = new Html5Qrcode(cameraContainerId);
        qrScannerRef.current = scanner;

        const config = {
          fps: 30,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
          disableFlip: false,
        };

        const cameras = await Html5Qrcode.getCameras();
        if (cameras.length === 0) {
          setCameraError('No camera found on this device');
          return;
        }

        // Prefer back camera
        const backCamera = cameras.find((cam: any) => cam.label.toLowerCase().includes('back')) || cameras[0];

        await scanner.start(
          backCamera.id,
          config,
          () => {
            // QR code detected - we capture still frame instead
          },
          () => {
            // Ignore scan errors
          },
        );

        // Add button to capture still frame from camera
      } catch (error) {
        console.error('Camera initialization error:', error);
        setCameraError('Failed to access camera. Please check permissions.');
      }
    };

    initCamera();

    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(() => {
          // Camera already stopped
        });
      }
    };
  }, [isOpen, scanMode]);

  const capturePhoto = async () => {
    if (!qrScannerRef.current) {
      setCameraError('Camera not ready');
      return;
    }

    try {
      const canvas = document.querySelector(`#${cameraContainerId} canvas`) as HTMLCanvasElement | null;
      if (canvas) {
        const imageBase64 = canvas.toDataURL('image/jpeg');
        onImageCapture(imageBase64, 'image/jpeg');
      } else {
        setCameraError('Failed to capture image');
      }
    } catch (error) {
      console.error('Photo capture error:', error);
      setCameraError('Failed to capture photo');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setCameraError('File too large. Maximum 5MB allowed.');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setCameraError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      onImageCapture(base64, file.type);
    };
    reader.onerror = () => {
      setCameraError('Failed to read file');
    };
    reader.readAsDataURL(file);
  };

  const handleClose = () => {
    setScanMode(null);
    setCameraError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Scan Invoice">
      <div className="w-full max-w-md mx-auto p-4">
        {!scanMode ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setScanMode('camera')}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
            >
              📷 Take Photo
            </button>
            <button
              onClick={() => setScanMode('upload')}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
            >
              📁 Upload Image
            </button>
          </div>
        ) : scanMode === 'camera' ? (
          <div className="flex flex-col gap-3">
            {cameraError ? (
              <div className="text-center text-red-500 text-sm font-medium mb-2">{cameraError}</div>
            ) : (
              <>
                <div
                  id={cameraContainerId}
                  className="w-full rounded border-2 border-gray-600 overflow-hidden bg-black"
                  style={{ aspectRatio: '1' }}
                />
                <button
                  onClick={capturePhoto}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:opacity-50"
                >
                  📸 Capture Photo
                </button>
              </>
            )}
            <button
              onClick={() => setScanMode(null)}
              disabled={isLoading}
              className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={handleFileSelect}
              disabled={isLoading}
              className="block w-full text-sm text-gray-400 file:mr-4 file:px-4 file:py-2 file:rounded file:bg-blue-600 file:text-white file:font-medium hover:file:bg-blue-700 disabled:opacity-50"
            />
            {cameraError && <div className="text-red-500 text-sm font-medium">{cameraError}</div>}
            <button
              onClick={() => setScanMode(null)}
              disabled={isLoading}
              className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
