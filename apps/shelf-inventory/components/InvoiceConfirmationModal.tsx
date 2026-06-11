import React, { useState } from 'react';
import type { ExtractedInvoiceData } from 'p2p-mesh-core';
import Modal from './Modal';

interface InvoiceConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmedData: ExtractedInvoiceData) => void;
  extractedData: ExtractedInvoiceData | null;
  isLoading?: boolean;
}

export default function InvoiceConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  extractedData,
  isLoading = false,
}: InvoiceConfirmationModalProps) {
  const [editedData, setEditedData] = useState<ExtractedInvoiceData | null>(null);
  const [totalConfirmed, setTotalConfirmed] = useState(false);

  React.useEffect(() => {
    if (extractedData && isOpen) {
      setEditedData(JSON.parse(JSON.stringify(extractedData)));
      setTotalConfirmed(false);
    }
  }, [extractedData, isOpen]);

  const handleItemChange = (index: number, field: string, value: any) => {
    if (!editedData) return;
    const newItems = [...editedData.items];
    const item = newItems[index];

    if (field === 'quantity' || field === 'unitPrice' || field === 'total' || field === 'confidence') {
      newItems[index] = {
        ...item,
        [field]: field === 'confidence' ? Math.min(Math.max(parseFloat(value) || 0, 0), 1) : parseFloat(value) || 0,
      };
    } else {
      newItems[index] = {
        ...item,
        [field]: value,
      };
    }

    setEditedData({
      ...editedData,
      items: newItems,
    });
  };

  const handleSupplierChange = (field: string, value: string) => {
    if (!editedData) return;
    setEditedData({
      ...editedData,
      [field]: value || undefined,
    });
  };

  const handleTotalChange = (value: string) => {
    if (!editedData) return;
    setEditedData({
      ...editedData,
      total: parseFloat(value) || 0,
    });
  };

  const handleConfirm = () => {
    if (!editedData || !totalConfirmed) {
      return;
    }
    onConfirm(editedData);
  };

  if (!editedData) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Review & Confirm Invoice Data">
      <div className="w-full max-w-2xl mx-auto p-4 max-h-96 overflow-y-auto">
        {/* Supplier Info */}
        <div className="mb-4 p-3 bg-gray-800 rounded border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Supplier Information</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-gray-400">Supplier Name</label>
              <input
                type="text"
                value={editedData.supplierName || ''}
                onChange={(e) => handleSupplierChange('supplierName', e.target.value)}
                disabled={isLoading}
                className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-gray-400">Invoice Number</label>
              <input
                type="text"
                value={editedData.invoiceNumber || ''}
                onChange={(e) => handleSupplierChange('invoiceNumber', e.target.value)}
                disabled={isLoading}
                className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs disabled:opacity-50"
              />
            </div>
            <div className="col-span-2">
              <label className="text-gray-400">Invoice Date</label>
              <input
                type="date"
                value={editedData.invoiceDate || ''}
                onChange={(e) => handleSupplierChange('invoiceDate', e.target.value)}
                disabled={isLoading}
                className="w-full mt-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="mb-4 p-3 bg-gray-800 rounded border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Line Items</h3>
          <div className="space-y-2 text-xs">
            {editedData.items.map((item, idx) => (
              <div key={idx} className="p-2 bg-gray-700 rounded border border-gray-600">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="col-span-2">
                    <label className="text-gray-400">Description</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      disabled={isLoading}
                      className="w-full mt-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-xs disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400">Qty</label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                      disabled={isLoading}
                      step="0.01"
                      className="w-full mt-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-xs disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400">Unit Price</label>
                    <input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                      disabled={isLoading}
                      step="0.01"
                      className="w-full mt-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-xs disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400">Total</label>
                    <input
                      type="number"
                      value={item.total}
                      onChange={(e) => handleItemChange(idx, 'total', e.target.value)}
                      disabled={isLoading}
                      step="0.01"
                      className="w-full mt-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-xs disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400">Confidence</label>
                    <input
                      type="number"
                      value={(item.confidence * 100).toFixed(0)}
                      onChange={(e) => handleItemChange(idx, 'confidence', (parseFloat(e.target.value) || 0) / 100)}
                      disabled={isLoading}
                      min="0"
                      max="100"
                      step="1"
                      className="w-full mt-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-xs disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="mb-4 p-3 bg-gray-800 rounded border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Summary</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Subtotal:</span>
              <input
                type="number"
                value={editedData.subtotal || ''}
                onChange={(e) => handleSupplierChange('subtotal', e.target.value)}
                disabled={isLoading}
                step="0.01"
                className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs disabled:opacity-50"
              />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tax:</span>
              <input
                type="number"
                value={editedData.tax || ''}
                onChange={(e) => handleSupplierChange('tax', e.target.value)}
                disabled={isLoading}
                step="0.01"
                className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs disabled:opacity-50"
              />
            </div>
            <div className="flex justify-between items-center border-t border-gray-600 pt-2">
              <span className="text-gray-300 font-semibold">TOTAL:</span>
              <input
                type="number"
                value={editedData.total}
                onChange={(e) => handleTotalChange(e.target.value)}
                disabled={isLoading}
                step="0.01"
                className="w-24 px-2 py-1 bg-green-900 border-2 border-green-600 rounded text-green-100 font-semibold text-sm disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Confirmation */}
        <div className="mb-4 p-3 bg-gray-800 rounded border border-yellow-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={totalConfirmed}
              onChange={(e) => setTotalConfirmed(e.target.checked)}
              disabled={isLoading}
              className="w-4 h-4 cursor-pointer disabled:opacity-50"
            />
            <span className="text-xs text-yellow-200">
              I confirm that the TOTAL amount is correct: <strong>${(editedData?.total || 0).toFixed(2)}</strong>
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || !totalConfirmed}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50"
          >
            ✓ Confirm & Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
