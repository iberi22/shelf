import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Product, Sale } from 'p2p-mesh-core';

/**
 * Shared report configuration for PDF exports.
 */
export interface PDFReportConfig {
  /** Report title shown at the top of the document. Defaults per report type. */
  title?: string;
  /** Optional company / branch name shown under the title. */
  companyName?: string;
  /** Currency symbol prepended to money values. Defaults to '$'. */
  currencySymbol?: string;
  /** Locale used for number and date formatting (e.g. 'en-US', 'es-ES'). Defaults to 'en-US'. */
  locale?: string;
}

/** Inclusive date range for sales reports. Bound values are ISO date strings. */
export interface DateRange {
  start: string;
  end: string;
}

interface ResolvedPdfConfig {
  title: string;
  companyName: string;
  currencySymbol: string;
  locale: string;
}

const DEFAULT_CONFIG: Omit<ResolvedPdfConfig, 'title'> = {
  companyName: '',
  currencySymbol: '$',
  locale: 'en-US',
};

function resolveConfig(config: PDFReportConfig = {}, fallbackTitle: string): ResolvedPdfConfig {
  return {
    title: config.title ?? fallbackTitle,
    companyName: config.companyName ?? DEFAULT_CONFIG.companyName,
    currencySymbol: config.currencySymbol ?? DEFAULT_CONFIG.currencySymbol,
    locale: config.locale ?? DEFAULT_CONFIG.locale,
  };
}

function formatMoney(value: number, config: ResolvedPdfConfig): string {
  if (!Number.isFinite(value)) return '-';
  const sign = value < 0 ? '-' : '';
  const formatted = new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${sign}${config.currencySymbol}${formatted}`;
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(locale);
}

/**
 * Returns the calendar day (YYYY-MM-DD) of a date stored as ISO string or any
 * parseable date value, without timezone shifting. Used for inclusive
 * calendar-day range comparisons.
 */
function dayKey(value: string): string {
  const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (isoMatch) return isoMatch[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Writes the title block (title, company name, generation date) and returns
 * the Y coordinate where the table should start.
 */
function writeReportHeader(doc: jsPDF, config: ResolvedPdfConfig): number {
  doc.setFontSize(16);
  doc.setTextColor(26, 26, 26);
  doc.text(config.title, 14, 18);

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const generatedAt = new Date().toLocaleString(config.locale);
  if (config.companyName) {
    doc.text(config.companyName, 14, 24);
    doc.text(generatedAt, 14, 28);
    return 32;
  }
  doc.text(generatedAt, 14, 24);
  return 28;
}

/** Adds a "Page X of Y" footer to every page of the document. */
function applyPageNumbers(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }
}

function getTableFinalY(doc: jsPDF, fallback: number): number {
  const lastTable = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return lastTable?.finalY ?? fallback;
}

const HEADER_FILL: [number, number, number] = [26, 26, 26];
const FOOTER_FILL: [number, number, number] = [240, 240, 240];

/**
 * Generates an inventory valuation PDF: product name, SKU, quantity, unit price
 * and total value (quantity x unit price) per active product, with a grand
 * total. Returns the PDF as a Blob ready for download.
 */
export function generateInventoryValuationPDF(products: Product[], config: PDFReportConfig = {}): Blob {
  const resolved = resolveConfig(config, 'Inventory Valuation');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: resolved.title, creator: resolved.companyName || 'shelf-inventory' });
  const startY = writeReportHeader(doc, resolved);

  const activeProducts = products
    .filter((p) => p.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, resolved.locale));

  const body = activeProducts.map((p) => [
    p.name,
    p.sku || '-',
    String(p.quantity),
    formatMoney(p.price, resolved),
    formatMoney(p.quantity * p.price, resolved),
  ]);
  const totalUnits = activeProducts.reduce((sum, p) => sum + p.quantity, 0);
  const totalValue = activeProducts.reduce((sum, p) => sum + p.quantity * p.price, 0);

  autoTable(doc, {
    head: [['Product', 'SKU', 'Quantity', 'Unit Price', 'Total Value']],
    body,
    foot: [['Total', '', String(totalUnits), '', formatMoney(totalValue, resolved)]],
    startY,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: FOOTER_FILL, textColor: [26, 26, 26], fontStyle: 'bold' },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  const finalY = getTableFinalY(doc, startY);
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  doc.text(`${activeProducts.length} product(s) — Grand total: ${formatMoney(totalValue, resolved)}`, 14, finalY + 8);

  applyPageNumbers(doc);
  return doc.output('blob');
}

/**
 * Generates a low stock report PDF listing active products whose quantity is at
 * or below the given threshold, sorted by quantity ascending (most critical
 * first). Returns the PDF as a Blob ready for download.
 */
export function generateLowStockPDF(products: Product[], threshold: number): Blob {
  const resolved = resolveConfig({}, 'Low Stock Report');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: resolved.title, creator: 'shelf-inventory' });
  const startY = writeReportHeader(doc, resolved);

  const lowStockProducts = products
    .filter((p) => p.isActive && p.quantity <= threshold)
    .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name, resolved.locale));

  const body = lowStockProducts.map((p) => [p.name, p.sku || '-', String(p.quantity), String(threshold)]);

  autoTable(doc, {
    head: [['Product', 'SKU', 'Quantity', 'Threshold']],
    body,
    startY,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  });

  const finalY = getTableFinalY(doc, startY);
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  doc.text(`${lowStockProducts.length} product(s) at or below the threshold of ${threshold} units`, 14, finalY + 8);

  applyPageNumbers(doc);
  return doc.output('blob');
}

/**
 * Generates a sales summary PDF for the given inclusive date range: one row per
 * sale (date, client, items sold, total and profit) plus a totals row. Returns
 * the PDF as a Blob ready for download.
 */
export function generateSalesSummaryPDF(sales: Sale[], dateRange: DateRange): Blob {
  const resolved = resolveConfig({}, 'Sales Summary');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: resolved.title, creator: 'shelf-inventory' });
  const startY = writeReportHeader(doc, resolved);

  const startDay = dayKey(dateRange.start);
  const endDay = dayKey(dateRange.end);

  const filteredSales = sales
    .filter((sale) => {
      const saleDay = dayKey(sale.date);
      return saleDay >= startDay && saleDay <= endDay;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const body = filteredSales.map((sale) => [
    formatDate(sale.date, resolved.locale),
    sale.clientName || '-',
    String(sale.items.reduce((sum, item) => sum + item.quantity, 0)),
    formatMoney(sale.totalPrice, resolved),
    formatMoney(sale.profit, resolved),
  ]);
  const totalSales = filteredSales.length;
  const totalItems = filteredSales.reduce(
    (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.totalPrice, 0);
  const totalProfit = filteredSales.reduce((sum, sale) => sum + sale.profit, 0);

  autoTable(doc, {
    head: [['Date', 'Client', 'Items', 'Total', 'Profit']],
    body,
    foot: [['Total', '', String(totalItems), formatMoney(totalRevenue, resolved), formatMoney(totalProfit, resolved)]],
    startY,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: FOOTER_FILL, textColor: [26, 26, 26], fontStyle: 'bold' },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  const finalY = getTableFinalY(doc, startY);
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  doc.text(
    `${totalSales} sale(s) — Revenue: ${formatMoney(totalRevenue, resolved)} — Profit: ${formatMoney(totalProfit, resolved)}`,
    14,
    finalY + 8,
  );

  applyPageNumbers(doc);
  return doc.output('blob');
}
