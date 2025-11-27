import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useSubscription } from '../context/SubscriptionContext';
import type { ArqueoSession, ExtractedInvoiceData, InvoiceOCRResult, Product } from '../types';
import InvoiceConfirmationModal from './InvoiceConfirmationModal';
import InvoiceScannerModal from './InvoiceScannerModal';

export default function Arqueo() {
  const { state, dispatch } = useApp();
  const { isPro, isPyme } = useSubscription();

  const [showScanner, setShowScanner] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string>('');
  const [currentExtractedData, setCurrentExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [currentImageBase64, setCurrentImageBase64] = useState<string>('');
  const [currentSession, setCurrentSession] = useState<ArqueoSession | null>(null);

  // Mock storage for OCR results and sessions (in real app, would be in localStorage/Firestore)
  const [sessions, setSessions] = React.useState<ArqueoSession[]>(() => {
    const stored = localStorage.getItem('arqueo_sessions');
    return stored ? JSON.parse(stored) : [];
  });

  const [ocrResults, setOcrResults] = React.useState<InvoiceOCRResult[]>(() => {
    const stored = localStorage.getItem('invoice_ocr_results');
    return stored ? JSON.parse(stored) : [];
  });

  // Pro feature check
  if (!isPro && !isPyme) {
    return (
      <div className="p-4 text-center">
        <div className="bg-blue-900 border border-blue-600 rounded p-4">
          <h2 className="text-xl font-semibold text-blue-100 mb-2">Arqueo - Pro Feature</h2>
          <p className="text-blue-200 mb-4">
            Invoice scanning and accounting is only available for Pro and Pyme users.
          </p>
        </div>
      </div>
    );
  }

  const handleImageCapture = async (imageBase64: string, mimeType: string) => {
    setShowScanner(false);
    setIsExtracting(true);
    setExtractionError('');
    setCurrentImageBase64(imageBase64);

    try {
      // Get products for matching
      const productsForMatching = state.products.slice(0, 20).map((p: Product) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
      }));

      const response = await fetch('/api/extractInvoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getIdToken()}`,
        },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          existingProducts: productsForMatching,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to extract invoice');
      }

      const { extractedData } = await response.json();
      setCurrentExtractedData(extractedData);
      setShowConfirmation(true);
    } catch (error) {
      console.error('Extraction error:', error);
      setExtractionError(error instanceof Error ? error.message : 'Failed to extract invoice data');
    } finally {
      setIsExtracting(false);
    }
  };

  const getIdToken = async (): Promise<string> => {
    // In real app, get from auth context
    const token = localStorage.getItem('firebase_token') || '';
    return token;
  };

  const handleConfirmInvoice = (confirmedData: ExtractedInvoiceData) => {
    const ocrResult: InvoiceOCRResult = {
      id: `ocr_${Date.now()}`,
      imageUrl: currentImageBase64,
      extractedData: confirmedData,
      status: 'reviewed',
      createdAt: new Date().toISOString(),
    };

    // Save OCR result
    const updatedResults = [...ocrResults, ocrResult];
    setOcrResults(updatedResults);
    localStorage.setItem('invoice_ocr_results', JSON.stringify(updatedResults));

    // Add to current session
    if (!currentSession) {
      const newSession: ArqueoSession = {
        id: `session_${Date.now()}`,
        createdAt: new Date().toISOString(),
        invoices: [
          {
            id: `invoice_${Date.now()}`,
            ocrResultId: ocrResult.id,
            confirmedData,
            createdAt: new Date().toISOString(),
          },
        ],
        createdProducts: [],
        status: 'open',
      };
      setCurrentSession(newSession);
    } else {
      const updatedSession: ArqueoSession = {
        ...currentSession,
        invoices: [
          ...currentSession.invoices,
          {
            id: `invoice_${Date.now()}`,
            ocrResultId: ocrResult.id,
            confirmedData,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      setCurrentSession(updatedSession);
    }

    setShowConfirmation(false);
    setCurrentExtractedData(null);
    setCurrentImageBase64('');
  };

  const handleApplyInvoiceToInventory = () => {
    if (!currentSession) return;

    // Create products from all invoices in the session
    const createdProductIds: string[] = [];

    currentSession.invoices.forEach((invoice) => {
      invoice.confirmedData.items.forEach((item) => {
        // Check if product already exists
        const existingProduct = state.products.find(
          (p: Product) => p.name.toLowerCase() === item.description.toLowerCase(),
        );

        if (!existingProduct) {
          const newProduct: Product = {
            id: `prod_${Date.now()}_${Math.random()}`,
            name: item.description,
            quantity: item.quantity,
            price: item.unitPrice,
            cost: item.unitPrice,
          };

          dispatch({
            type: 'ADD_PRODUCT',
            payload: newProduct,
          });

          createdProductIds.push(newProduct.id);
        } else {
          // Update existing product quantity
          dispatch({
            type: 'UPDATE_PRODUCT',
            payload: {
              ...existingProduct,
              quantity: existingProduct.quantity + item.quantity,
            },
          });
        }
      });
    });

    // Mark session as closed
    const closedSession: ArqueoSession = {
      ...currentSession,
      createdProducts: createdProductIds,
      status: 'closed',
    };

    setSessions([...sessions, closedSession]);
    localStorage.setItem('arqueo_sessions', JSON.stringify([...sessions, closedSession]));

    setCurrentSession(null);
  };

  const handleStartNewSession = () => {
    setCurrentSession(null);
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Arqueo - Invoice Accounting</h1>

      {/* Active Session */}
      {currentSession ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Current Session</h2>
            <span className="px-3 py-1 bg-green-900 text-green-100 text-xs font-semibold rounded">
              {currentSession.invoices.length} invoice{currentSession.invoices.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Invoices in session */}
          <div className="space-y-4 mb-6">
            {currentSession.invoices.map((invoice) => (
              <div key={invoice.id} className="bg-gray-700 border border-gray-600 rounded p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm text-gray-400">
                      Supplier:{' '}
                      <span className="text-white font-medium">{invoice.confirmedData.supplierName || 'N/A'}</span>
                    </p>
                    <p className="text-sm text-gray-400">
                      Invoice #:{' '}
                      <span className="text-white font-medium">{invoice.confirmedData.invoiceNumber || 'N/A'}</span>
                    </p>
                    <p className="text-sm text-gray-400">
                      Date: <span className="text-white font-medium">{invoice.confirmedData.invoiceDate || 'N/A'}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-400">
                      ${(invoice.confirmedData.total || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">{invoice.confirmedData.items.length} items</p>
                  </div>
                </div>

                {/* Items preview */}
                <div className="mt-2 text-xs text-gray-400">
                  <p className="font-semibold mb-1">Items:</p>
                  <ul className="space-y-1">
                    {invoice.confirmedData.items.slice(0, 3).map((item, idx) => (
                      <li key={idx} className="text-gray-300">
                        • {item.description} - Qty: {item.quantity.toFixed(2)} @ ${item.unitPrice.toFixed(2)}
                      </li>
                    ))}
                    {invoice.confirmedData.items.length > 3 && (
                      <li className="text-gray-400 italic">
                        ...and {invoice.confirmedData.items.length - 3} more items
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* Session Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowScanner(true)}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
            >
              + Add Another Invoice
            </button>
            <button
              onClick={handleApplyInvoiceToInventory}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium"
            >
              ✓ Apply to Inventory
            </button>
            <button
              onClick={handleStartNewSession}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-medium"
            >
              Close Session
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6 text-center">
          <h2 className="text-xl font-semibold text-white mb-4">No Active Session</h2>
          <button
            onClick={() => setShowScanner(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            📷 Start New Session & Scan Invoice
          </button>
        </div>
      )}

      {/* Error Message */}
      {extractionError && (
        <div className="bg-red-900 border border-red-700 rounded p-4 mb-6 text-red-100">
          <p className="font-semibold">Extraction Error</p>
          <p className="text-sm">{extractionError}</p>
        </div>
      )}

      {/* Previous Sessions */}
      {sessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Previous Sessions</h2>
          <div className="space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className="bg-gray-800 border border-gray-700 rounded p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-400">
                      Closed on: <span className="text-white">{new Date(session.createdAt).toLocaleDateString()}</span>
                    </p>
                    <p className="text-sm text-gray-400">
                      Invoices: <span className="text-white font-medium">{session.invoices.length}</span>
                    </p>
                    <p className="text-sm text-gray-400">
                      Products created: <span className="text-white font-medium">{session.createdProducts.length}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-300">
                      ${session.invoices.reduce((sum, inv) => sum + (inv.confirmedData.total || 0), 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <InvoiceScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onImageCapture={handleImageCapture}
        isLoading={isExtracting}
      />

      <InvoiceConfirmationModal
        isOpen={showConfirmation}
        onClose={() => {
          setShowConfirmation(false);
          setCurrentExtractedData(null);
        }}
        onConfirm={handleConfirmInvoice}
        extractedData={currentExtractedData}
        isLoading={isExtracting}
      />
    </div>
  );
}
