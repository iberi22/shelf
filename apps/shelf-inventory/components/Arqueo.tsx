import type { ArqueoSession, ExtractedInvoiceData, InvoiceOCRResult, Product } from 'p2p-mesh-core';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useSubscription } from '../context/SubscriptionContext';
import InvoiceConfirmationModal from './InvoiceConfirmationModal';
import InvoiceScannerModal from './InvoiceScannerModal';

export default function Arqueo() {
  const { state, dispatch } = useApp();
  const { isPro, isPyme } = useSubscription();

  const [showScanner, setShowScanner] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isExtracting, _setIsExtracting] = useState(false);
  const [extractionError, _setExtractionError] = useState<string>('');
  const [currentExtractedData, setCurrentExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [currentImageBase64, setCurrentImageBase64] = useState<string>('');
  const [currentSession, setCurrentSession] = useState<ArqueoSession | null>(null);

  // Pro feature check
  if (!isPro && !isPyme) {
    return (
      <div className="p-4 text-center">
        <div className="w-full bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-[#F5F5DC] mb-2">Arqueo - Pro Feature</h2>
          <p className="text-[#F5F5DC]/70 mb-4">
            Invoice scanning and accounting is only available for Pro and Pyme users.
          </p>
        </div>
      </div>
    );
  }

  const handleScanComplete = (imageBase64: string, extractedData: ExtractedInvoiceData) => {
    setShowScanner(false);
    setCurrentImageBase64(imageBase64);
    setCurrentExtractedData(extractedData);
    setShowConfirmation(true);
  };

  const handleConfirmInvoice = (confirmedData: ExtractedInvoiceData) => {
    const ocrResult: InvoiceOCRResult = {
      id: `ocr_${Date.now()}`,
      imageUrl: currentImageBase64,
      extractedData: confirmedData,
      status: 'reviewed',
      createdAt: new Date().toISOString(),
      isActive: true,
      updatedBy: state.localPeerId || 'local',
      updatedAt: new Date().toISOString(),
    };

    // Save OCR result
    dispatch({ type: 'ADD_OCR_RESULT', payload: ocrResult });

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
        isActive: true,
        updatedBy: state.localPeerId || 'local',
        updatedAt: new Date().toISOString(),
      };
      setCurrentSession(newSession);
      dispatch({ type: 'ADD_ARQUEO_SESSION', payload: newSession });
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
      dispatch({ type: 'UPDATE_ARQUEO_SESSION', payload: updatedSession });
    }

    setShowConfirmation(false);
    setCurrentExtractedData(null);
    setCurrentImageBase64('');
  };

  const handleApplyInvoiceToInventory = () => {
    if (!currentSession) return;

    const toAdd: Product[] = [];
    const toUpdate: Product[] = [];
    const createdProductIds: string[] = [];

    // Group items by name (case-insensitive) across all invoices in the session
    const consolidatedItems = new Map<string, { name: string; quantity: number; unitPrice: number }>();

    for (const invoice of currentSession.invoices) {
      for (const item of invoice.confirmedData.items) {
        const nameKey = item.description.toLowerCase();
        const existingConsolidated = consolidatedItems.get(nameKey);
        if (existingConsolidated) {
          consolidatedItems.set(nameKey, {
            ...existingConsolidated,
            quantity: existingConsolidated.quantity + item.quantity,
            unitPrice: item.unitPrice,
          });
        } else {
          consolidatedItems.set(nameKey, {
            name: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });
        }
      }
    }

    // Determine which products to add and which to update
    consolidatedItems.forEach((data, nameKey) => {
      const existingProduct = state.products.find((p: Product) => p.name.toLowerCase() === nameKey);

      if (existingProduct) {
        toUpdate.push({
          ...existingProduct,
          quantity: existingProduct.quantity + data.quantity,
        });
      } else {
        const newProduct: Product = {
          id: `prod_${Date.now()}_${Math.random()}`,
          name: data.name,
          quantity: data.quantity,
          price: data.unitPrice,
          cost: data.unitPrice,
          isActive: true,
          updatedBy: 'system',
          updatedAt: new Date().toISOString(),
        };
        toAdd.push(newProduct);
        createdProductIds.push(newProduct.id);
      }
    });

    if (toAdd.length > 0 || toUpdate.length > 0) {
      dispatch({
        type: 'BATCH_UPDATE_PRODUCTS',
        payload: { toAdd, toUpdate },
      });
    }

    // Mark session as closed
    const closedSession: ArqueoSession = {
      ...currentSession,
      createdProducts: createdProductIds,
      status: 'closed',
    };

    dispatch({ type: 'UPDATE_ARQUEO_SESSION', payload: closedSession });

    setCurrentSession(null);
  };

  const handleStartNewSession = () => {
    setCurrentSession(null);
  };

  return (
    <div className="px-0 max-w-6xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-bold text-[#F5F5DC] mb-6">Arqueo - Invoice Accounting</h1>

      {/* Active Session */}
      {currentSession ? (
        <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg p-4 md:p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 flex-wrap">
            <h2 className="text-lg md:text-xl font-semibold text-[#F5F5DC] shrink-0">Current Session</h2>
            <span className="self-start sm:self-auto px-3 py-1 bg-[#F5F5DC]/10 text-[#F5F5DC]/80 text-xs font-semibold rounded-full border border-[#F5F5DC]/20">
              {currentSession.invoices.length} invoice{currentSession.invoices.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Invoices in session — Desktop */}
          <div className="space-y-4 mb-6">
            {currentSession.invoices.map((invoice) => (
              <div key={invoice.id} className="bg-[#121212] border border-[#F5F5DC]/20 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm text-[#F5F5DC]/60">
                      Supplier:{' '}
                      <span className="text-[#F5F5DC] font-medium">{invoice.confirmedData.supplierName || 'N/A'}</span>
                    </p>
                    <p className="text-sm text-[#F5F5DC]/60">
                      Invoice #:{' '}
                      <span className="text-[#F5F5DC] font-medium">{invoice.confirmedData.invoiceNumber || 'N/A'}</span>
                    </p>
                    <p className="text-sm text-[#F5F5DC]/60">
                      Date:{' '}
                      <span className="text-[#F5F5DC] font-medium">{invoice.confirmedData.invoiceDate || 'N/A'}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-400">
                      ${(invoice.confirmedData.total || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-[#F5F5DC]/50">{invoice.confirmedData.items.length} items</p>
                  </div>
                </div>

                {/* Items preview */}
                <div className="mt-2 text-xs text-[#F5F5DC]/50">
                  <p className="font-semibold mb-1 text-[#F5F5DC]/70">Items:</p>
                  <ul className="space-y-1">
                    {invoice.confirmedData.items.slice(0, 3).map((item, idx) => (
                      <li key={idx} className="text-[#F5F5DC]/80">
                        • {item.description} - Qty: {item.quantity.toFixed(2)} @ ${item.unitPrice.toFixed(2)}
                      </li>
                    ))}
                    {invoice.confirmedData.items.length > 3 && (
                      <li className="text-[#F5F5DC]/40 italic">
                        ...and {invoice.confirmedData.items.length - 3} more items
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* Invoices in session — Mobile cards */}
          <div className="sm:hidden flex flex-col gap-3 mb-6">
            {currentSession.invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="bg-[#121212] border border-[#F5F5DC]/20 rounded-lg p-3 active:scale-[0.98] transition-transform"
              >
                {/* Card header */}
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#F5F5DC] line-clamp-1">
                      {invoice.confirmedData.supplierName || 'N/A'}
                    </p>
                    <p className="text-[10px] text-[#F5F5DC]/50 font-mono mt-0.5">
                      #{invoice.confirmedData.invoiceNumber || 'N/A'} · {invoice.confirmedData.invoiceDate || 'N/A'}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right ml-2">
                    <p className="text-lg font-bold text-green-400">${(invoice.confirmedData.total || 0).toFixed(2)}</p>
                    <p className="text-[10px] text-[#F5F5DC]/50">{invoice.confirmedData.items.length} items</p>
                  </div>
                </div>

                {/* Items badges */}
                <div className="flex flex-wrap gap-1">
                  {invoice.confirmedData.items.slice(0, 2).map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 bg-[#F5F5DC]/8 px-1.5 py-0.5 rounded-full text-[10px] text-[#F5F5DC]/70"
                    >
                      {item.description} (x{item.quantity})
                    </span>
                  ))}
                  {invoice.confirmedData.items.length > 2 && (
                    <span className="inline-flex items-center gap-1 bg-[#F5F5DC]/8 px-1.5 py-0.5 rounded-full text-[10px] text-[#F5F5DC]/40">
                      +{invoice.confirmedData.items.length - 2} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Session Actions */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => setShowScanner(true)}
              className="w-full sm:flex-1 bg-transparent border border-blue-500/50 text-blue-400 font-bold py-2.5 px-4 rounded-lg hover:bg-blue-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
            >
              + Add Another Invoice
            </button>
            <button
              onClick={handleApplyInvoiceToInventory}
              className="w-full sm:flex-1 bg-transparent border border-green-500/50 text-green-400 font-bold py-2.5 px-4 rounded-lg hover:bg-green-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
            >
              ✓ Apply to Inventory
            </button>
            <button
              onClick={handleStartNewSession}
              className="w-full sm:flex-1 bg-transparent border border-[#F5F5DC]/50 text-[#F5F5DC] font-bold py-2.5 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-all active:scale-95 text-sm min-h-[44px]"
            >
              Close Session
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg p-6 mb-6 text-center">
          <h2 className="text-lg md:text-xl font-semibold text-[#F5F5DC] mb-4">No Active Session</h2>
          <button
            onClick={() => setShowScanner(true)}
            className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2.5 px-6 rounded-lg hover:bg-opacity-80 transition-all active:scale-95 text-sm min-h-[44px]"
          >
            📷 Start New Session & Scan Invoice
          </button>
        </div>
      )}

      {/* Error Message */}
      {extractionError && (
        <div className="bg-red-900/50 border border-red-500/30 rounded-lg p-4 mb-6 text-red-200">
          <p className="font-semibold">Extraction Error</p>
          <p className="text-sm">{extractionError}</p>
        </div>
      )}

      {/* Previous Sessions */}
      {state.arqueoSessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[#F5F5DC] mb-4">Previous Sessions</h2>
          <div className="flex flex-col gap-3">
            {state.arqueoSessions.map((session) => (
              <div
                key={session.id}
                className="w-full bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg p-3 md:p-4 active:scale-[0.98] transition-transform"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-[#F5F5DC]/60">
                      Closed on:{' '}
                      <span className="text-[#F5F5DC]">{new Date(session.createdAt).toLocaleDateString()}</span>
                    </p>
                    <div className="flex flex-wrap gap-3 mt-2">
                      <span className="inline-flex items-center text-xs text-[#F5F5DC]/70 bg-[#F5F5DC]/8 px-2 py-1 rounded">
                        📄 {session.invoices.length} invoice{session.invoices.length !== 1 ? 's' : ''}
                      </span>
                      <span className="inline-flex items-center text-xs text-[#F5F5DC]/70 bg-[#F5F5DC]/8 px-2 py-1 rounded">
                        📦 {session.createdProducts.length} product{session.createdProducts.length !== 1 ? 's' : ''}
                      </span>
                      <span className="inline-flex items-center text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded">
                        ${session.invoices.reduce((sum, inv) => sum + (inv.confirmedData.total || 0), 0).toFixed(2)}
                      </span>
                    </div>
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
        onScanComplete={handleScanComplete}
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
