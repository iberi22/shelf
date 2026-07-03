import type { ExtractedInvoiceData, InvoiceLineItem } from 'p2p-mesh-core';
import { useCallback, useState } from 'react';
import { createWorker, type Worker } from 'tesseract.js';

export function useLocalOCR() {
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawText, setRawText] = useState('');

  const parseOCRText = useCallback((text: string): ExtractedInvoiceData => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const items: InvoiceLineItem[] = [];

    // Total extraction - looking for common keywords
    const totalRegex = /(?:TOTAL|SUMA|TOTAL A PAGAR|AMOUNT|NETTO|BRUTTO|IMPORTE)[:\s]*\$?\s*([\d,.]+)/i;
    let total = 0;
    for (const line of lines) {
      const match = line.match(totalRegex);
      if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        if (!Number.isNaN(val) && val > total) total = val;
      }
    }

    // Date extraction
    const dateRegex = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/;
    let invoiceDate = new Date().toISOString().split('T')[0];
    for (const line of lines) {
      const match = line.match(dateRegex);
      if (match) {
        invoiceDate = match[1];
        break;
      }
    }

    // Supplier - usually at the top
    const supplierName = lines[0] || 'Unknown Supplier';

    // Items extraction
    for (const line of lines) {
      // Look for lines that look like: "Description 10.00" or "Description 2 x 10.00"
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1].replace(/[^0-9.,]/g, '').replace(',', '.');
        const price = parseFloat(lastPart);

        if (!Number.isNaN(price) && price > 0 && (total === 0 || price <= total)) {
          // If the price found is exactly the total, it's probably not a line item but the total line itself
          if (total > 0 && Math.abs(price - total) < 0.01 && line.toUpperCase().includes('TOTAL')) {
            continue;
          }

          let quantity = 1;
          let unitPrice = price;
          let descriptionPartsCount = 1;

          if (parts.length >= 3) {
            const secondToLast = parts[parts.length - 2].replace(/x|X/g, '').replace(',', '.');
            const q = parseFloat(secondToLast);
            if (!Number.isNaN(q) && q > 0 && q < 1000) {
              quantity = q;
              unitPrice = price / quantity;
              descriptionPartsCount = 2;
            }
          }

          items.push({
            description: parts.slice(0, parts.length - descriptionPartsCount).join(' '),
            quantity,
            unitPrice,
            total: price,
            confidence: 0.6,
          });
        }
      }
    }

    return {
      supplierName,
      invoiceDate,
      items: items.slice(0, 15),
      total: total || items.reduce((sum, item) => sum + item.total, 0),
    };
  }, []);

  const processImage = useCallback(
    async (imageBase64: string): Promise<ExtractedInvoiceData | null> => {
      setIsProcessing(true);
      setProgress(0);
      setRawText('');

      let worker: Worker | null = null;
      try {
        worker = await createWorker('spa+eng', 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setProgress(Math.round(m.progress * 100));
            }
          },
        });

        const {
          data: { text },
        } = await worker.recognize(imageBase64);
        setRawText(text);

        return parseOCRText(text);
      } catch (error) {
        console.error('Local OCR error:', error);
        return null;
      } finally {
        if (worker) {
          await worker.terminate();
        }
        setIsProcessing(false);
      }
    },
    [parseOCRText],
  );

  return { processImage, progress, isProcessing, rawText };
}
