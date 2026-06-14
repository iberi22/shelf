import { Html5Qrcode } from 'html5-qrcode';
import type { ExtractedInvoiceData, InvoiceLineItem } from 'p2p-mesh-core';
import { useEffect, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';
import Modal from './Modal';

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
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
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

  const parseOCRText = (text: string): ExtractedInvoiceData => {
    const lines = text.split('\n');
    const items: InvoiceLineItem[] = [];

    // Basic regex for common invoice fields
    const totalMatch = text.match(/(?:TOTAL|SUMA|TOTAL A PAGAR)[:\s]*\$?\s*(\d+(?:[.,]\d{2})?)/i);
    const total = totalMatch ? Number.parseFloat(totalMatch[1].replace(',', '.')) : 0;

    const dateMatch = text.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
    const invoiceDate = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

    const supplierMatch = lines[0]?.trim();

    // Simple item extraction: look for lines with numbers at the end
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        const price = Number.parseFloat(lastPart.replace(/[^0-9.,]/g, '').replace(',', '.'));
        if (!Number.isNaN(price) && price > 0 && price < total) {
          items.push({
            description: parts.slice(0, parts.length - 1).join(' '),
            quantity: 1,
            unitPrice: price,
            total: price,
            confidence: 0.7,
          });
        }
      }
    }

    return {
      supplierName: supplierMatch || 'Unknown Supplier',
      invoiceDate,
      items: items.slice(0, 10), // Limit to avoid noise
      total,
    };
  };

  const processImage = async (imageBase64: string) => {
    setIsProcessing(true);
    setOcrProgress(0);
    try {
      const worker = await createWorker('spa+eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      const {
        data: { text },
      } = await worker.recognize(imageBase64);
      await worker.terminate();

      const extractedData = parseOCRText(text);
      onScanComplete(imageBase64, extractedData);
    } catch (error) {
      console.error('OCR error:', error);
      setCameraError('Failed to process image. Please try again.');
    } finally {
      setIsProcessing(false);
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
    setIsProcessing(false);
    setOcrProgress(0);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Scan Invoice">
      <div className="w-full max-w-md mx-auto p-4">
        {isProcessing || isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-white font-medium">Processing Invoice...</p>
            <div className="w-full bg-gray-700 h-2 rounded-full mt-4 overflow-hidden">
              <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${ocrProgress}%` }} />
            </div>
            <p className="text-gray-400 text-xs mt-2">{ocrProgress}% complete</p>
          </div>
        ) : !scanMode ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setScanMode('camera')}
              disabled={isLoading || isProcessing}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
            >
              📷 Take Photo
            </button>
            <button
              onClick={() => setScanMode('upload')}
              disabled={isLoading || isProcessing}
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
                  disabled={isLoading || isProcessing}
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
              disabled={isLoading || isProcessing}
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
              disabled={isLoading || isProcessing}
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
              disabled={isLoading || isProcessing}
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
