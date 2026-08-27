import { Html5Qrcode } from 'html5-qrcode';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ExtractedInvoiceData } from 'p2p-mesh-core';
import { useEffect, useRef, useState } from 'react';
import { useLocalOCR } from '../hooks/useLocalOCR';
import useLocalStorage from '../hooks/useLocalStorage';
import Modal from './ui/Modal';

const CAPTURE_CANVAS_ID = 'invoice-capture-canvas';

interface InvoiceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (imageBase64: string, extractedData: ExtractedInvoiceData) => void;
  isLoading?: boolean;
}

export default function InvoiceScannerModal({
  isOpen,
  onClose,
  onScanComplete,
  isLoading = false,
}: InvoiceScannerModalProps) {
  const [scanMode, setScanMode] = useState<'camera' | 'upload' | null>(null);
  const [cameraError, setCameraError] = useState<string>('');
  const [useLocalOcr, setUseLocalOcr] = useLocalStorage('useLocalOcr', true);
  const [showRawText, setShowRawText] = useState(false);
  const [isCloudProcessing, setIsCloudProcessing] = useState(false);

  const {
    processImage: processLocalImage,
    progress: localProgress,
    isProcessing: isLocalProcessing,
    rawText: localRawText,
  } = useLocalOCR();

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
        try {
          qrScannerRef.current.stop().catch(() => {
            // Camera already stopped
          });
        } catch (e) {
          console.error('Sync error on stop:', e);
        }
      }
    };
  }, [isOpen, scanMode]);

  const processImage = async (imageBase64: string) => {
    if (useLocalOcr) {
      const result = await processLocalImage(imageBase64);
      if (result) {
        onScanComplete(imageBase64, result);
      } else {
        setCameraError('Local OCR failed to process image');
      }
    } else {
      setIsCloudProcessing(true);
      try {
        const geminiApiKey = localStorage.getItem('geminiApiKey')?.replace(/"/g, '');
        const response = await fetch('/api/extractInvoice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image: imageBase64.split(',')[1], // Remove data:image/jpeg;base64,
            apiKey: geminiApiKey,
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        onScanComplete(imageBase64, data as ExtractedInvoiceData);
      } catch (error) {
        console.error('Cloud OCR error:', error);
        setCameraError('Cloud OCR failed. Check your API key and connection.');
      } finally {
        setIsCloudProcessing(false);
      }
    }
  };

  const capturePhoto = async () => {
    if (!qrScannerRef.current) {
      setCameraError('Camera not ready');
      return;
    }

    try {
      // html5-qrcode renders a <video> element inside the container, not a <canvas>
      const video = document.querySelector(`#${cameraContainerId} video`) as HTMLVideoElement | null;
      if (!video || video.readyState < 2) {
        setCameraError('Camera feed not ready yet. Please wait a moment and try again.');
        return;
      }

      // Draw the current video frame onto our hidden canvas
      const canvas = document.getElementById(CAPTURE_CANVAS_ID) as HTMLCanvasElement;
      if (!canvas) {
        setCameraError('Internal error: capture surface not found');
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setCameraError('Failed to initialize image capture');
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.85);
      await processImage(imageBase64);
    } catch (error) {
      console.error('Photo capture error:', error);
      setCameraError('Failed to capture photo');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setCameraError('File too large. Maximum 5MB allowed.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setCameraError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      await processImage(base64);
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

  const isAnyProcessing = isLocalProcessing || isCloudProcessing || isLoading;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Scan Invoice">
      <div className="w-full max-w-md mx-auto p-4">
        {/* OCR Type Selector */}
        <div className="mb-6 p-1 bg-surface rounded-lg border border-foreground/10 flex">
          <button
            onClick={() => setUseLocalOcr(true)}
            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${useLocalOcr ? 'bg-foreground text-surface' : 'text-foreground/60 hover:text-foreground'}`}
          >
            Local OCR (Offline)
          </button>
          <button
            onClick={() => setUseLocalOcr(false)}
            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${!useLocalOcr ? 'bg-foreground text-surface' : 'text-foreground/60 hover:text-foreground'}`}
          >
            Cloud OCR (Gemini)
          </button>
        </div>

        {isAnyProcessing ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-white font-medium">
              {isCloudProcessing ? 'Cloud processing...' : 'Processing Invoice...'}
            </p>
            {!isCloudProcessing && (
              <>
                <div className="w-full bg-gray-700 h-2 rounded-full mt-4 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full transition-all duration-300"
                    style={{ width: `${localProgress}%` }}
                  />
                </div>
                <p className="text-gray-400 text-xs mt-2">{localProgress}% complete</p>
              </>
            )}
          </div>
        ) : !scanMode ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setScanMode('camera')}
              disabled={isAnyProcessing}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
            >
              📷 Take Photo
            </button>
            <button
              onClick={() => setScanMode('upload')}
              disabled={isAnyProcessing}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
            >
              📁 Upload Image
            </button>
          </div>
        ) : scanMode === 'camera' ? (
          <div className="flex flex-col gap-3">
            {cameraError ? (
              <div className="text-center">
                <div className="text-red-500 text-sm font-medium mb-3">{cameraError}</div>
                <button
                  onClick={() => {
                    setCameraError('');
                    setScanMode('camera');
                  }}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm mb-2"
                >
                  🔄 Try Again
                </button>
              </div>
            ) : (
              <>
                <div
                  id={cameraContainerId}
                  className="w-full rounded border-2 border-gray-600 overflow-hidden bg-black"
                  style={{ aspectRatio: '1' }}
                />
                <canvas id={CAPTURE_CANVAS_ID} style={{ display: 'none' }} />
                <button
                  onClick={capturePhoto}
                  disabled={isAnyProcessing}
                  className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:opacity-50"
                >
                  📸 Capture Photo
                </button>
              </>
            )}
            <button
              onClick={() => {
                setCameraError('');
                setScanMode(null);
              }}
              disabled={isAnyProcessing}
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
              disabled={isAnyProcessing}
              className="block w-full text-sm text-gray-400 file:mr-4 file:px-4 file:py-2 file:rounded file:bg-blue-600 file:text-white file:font-medium hover:file:bg-blue-700 disabled:opacity-50"
            />
            {cameraError && (
              <div className="flex flex-col items-center gap-2">
                <div className="text-red-500 text-sm font-medium">{cameraError}</div>
                <button
                  onClick={() => setCameraError('')}
                  className="text-blue-400 text-sm underline hover:text-blue-300"
                >
                  Dismiss
                </button>
              </div>
            )}
            <button
              onClick={() => {
                setCameraError('');
                setScanMode(null);
              }}
              disabled={isAnyProcessing}
              className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm"
            >
              Back
            </button>
          </div>
        )}

        {/* Debug Panel */}
        {localRawText && (
          <div className="mt-6 border-t border-foreground/10 pt-4">
            <button
              onClick={() => setShowRawText(!showRawText)}
              className="flex items-center justify-between w-full text-xs text-foreground/60 hover:text-foreground transition-colors"
            >
              <span>{showRawText ? 'Hide' : 'Show'} Raw OCR Text</span>
              {showRawText ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showRawText && (
              <div className="mt-2 p-3 bg-black/40 rounded border border-foreground/5 max-h-40 overflow-y-auto text-[10px] font-mono text-foreground/80 whitespace-pre-wrap">
                {localRawText}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
