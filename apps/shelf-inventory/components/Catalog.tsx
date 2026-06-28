import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import {
  getProductVariantDisplay,
  getProductVariants,
  normalizeProduct,
  summarizeVariantValues,
} from '../lib/productVariants';

const PLANT_BACKGROUND_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1800" fill="none">
  <g opacity="0.16" stroke="#4f9d69" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
    <path d="M185 1510c82-140 120-310 115-510" />
    <path d="M251 1000c-46 48-86 104-109 171 75 0 148-30 196-88" />
    <path d="M314 880c56 36 98 91 123 160-74 2-145-25-194-80" />
    <path d="M1045 1480c-72-118-110-266-113-446" />
    <path d="M958 1042c48 44 86 98 111 164-73 2-143-25-191-78" />
    <path d="M894 906c-58 32-103 83-130 152 73 8 145-12 198-63" />
  </g>
  <g opacity="0.09" fill="#7bbf88">
    <path d="M231 283c-79 34-131 112-132 203 89-2 171-46 222-124 19-30 29-61 32-94-39 5-78 13-122 15z" />
    <path d="M362 448c-56 61-79 144-61 229 87-16 158-71 196-153 15-31 23-63 23-96-47 3-88 7-158 20z" />
    <path d="M1106 290c76 38 126 120 124 211-89-5-168-53-215-132-18-31-27-63-27-95 41 4 79 15 118 16z" />
    <path d="M973 456c56 57 81 137 67 220-88-12-160-64-200-144-16-31-24-64-26-95 46 4 87 10 159 19z" />
  </g>
</svg>
`;

const escapeHtml = (text: string) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const Catalog: React.FC = () => {
  const { state } = useAppContext();
  const { formatCurrency } = useCurrency();
  const didInitSelection = useRef(false);

  const activeProducts = useMemo(
    () => state.products.filter((product) => product.isActive !== false).map((product) => normalizeProduct(product)),
    [state.products],
  );

  const [catalogName, setCatalogName] = useState('El Mundo de las Materas');
  const [catalogSubtitle, setCatalogSubtitle] = useState('Catálogo de Productos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPrices, setShowPrices] = useState(true);
  const [showDescriptions, setShowDescriptions] = useState(true);
  const [columns, setColumns] = useState(3);
  const [brandLogo, setBrandLogo] = useState('🪴');
  const [contactInfo, setContactInfo] = useState('WhatsApp: +57 300 000 0000');
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  useEffect(() => {
    if (!didInitSelection.current && activeProducts.length > 0) {
      setSelectedIds(new Set(activeProducts.map((product) => product.id)));
      didInitSelection.current = true;
    }
  }, [activeProducts]);

  const categories = useMemo(() => {
    const next = new Set<string>();
    activeProducts.forEach((product) => {
      const skuPrefix = product.sku?.split('-')[0]?.trim();
      if (skuPrefix) next.add(skuPrefix);
    });
    return ['todos', ...Array.from(next)];
  }, [activeProducts]);

  const visibleProducts = useMemo(() => {
    let items = activeProducts;
    if (showOnlySelected) {
      items = items.filter((product) => selectedIds.has(product.id));
    }
    if (selectedCategory !== 'todos') {
      items = items.filter((product) => (product.sku?.split('-')[0]?.trim() || 'general') === selectedCategory);
    }
    return items;
  }, [activeProducts, selectedCategory, selectedIds, showOnlySelected]);

  const exportProducts = useMemo(() => {
    return showOnlySelected ? visibleProducts : activeProducts.filter((product) => selectedIds.has(product.id));
  }, [activeProducts, selectedIds, showOnlySelected, visibleProducts]);

  const toggleProduct = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    setSelectedIds(new Set(activeProducts.map((product) => product.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const describeProduct = (product: ReturnType<typeof normalizeProduct>) => {
    const lines: string[] = [];
    if (showDescriptions && product.sku) lines.push(`SKU: ${product.sku}`);
    if (showDescriptions && (product.variantAttributes?.length ?? 0) > 0) {
      lines.push(`Atributos: ${product.variantAttributes?.join(', ') || ''}`);
    }
    if (showDescriptions && (product.variants?.length ?? 0) > 1) {
      lines.push(`${product.variants?.length || 0} variantes`);
    }
    if (showDescriptions && product.color) lines.push(`Color: ${product.color}`);
    if (showDescriptions && product.dimensions) lines.push(`Medida: ${product.dimensions}`);
    if (showDescriptions && product.capacity) lines.push(`Capacidad: ${product.capacity}`);
    if (showDescriptions && product.material) lines.push(`Material: ${product.material}`);
    return lines;
  };

  const buildPrintableDocument = (mode: 'html' | 'pdf') => {
    const productsMarkup = exportProducts
      .map((product) => {
        const variants = getProductVariants(product);
        const highlights = summarizeVariantValues(product, 5);
        const variantMarkup =
          showDescriptions && variants.length > 1
            ? `
              <div class="variant-panel">
                <div class="variant-panel-title">Variantes</div>
                <div class="variant-list">
                  ${variants
                    .map(
                      (variant) => `
                        <div class="variant-row">
                          <div class="variant-name">${escapeHtml(getProductVariantDisplay(product, variant) || variant.label || 'Default')}</div>
                          <div class="variant-values">${escapeHtml(
                            (product.variantAttributes?.length ?? 0)
                              ? (product.variantAttributes || [])
                                  .map((label: string) => `${label}: ${variant.attributes[label] || ''}`)
                                  .filter((entry) => !entry.endsWith(': '))
                                  .join(' · ')
                              : '',
                          )}</div>
                          <div class="variant-meta">
                            <span>${variant.quantity} un</span>
                            ${showPrices ? `<span>${escapeHtml(formatCurrency(variant.price))}</span>` : ''}
                          </div>
                        </div>
                      `,
                    )
                    .join('')}
                </div>
              </div>
            `
            : '';

        return `
          <article class="product-card">
            <div class="product-media">
              ${
                product.imageUrl
                  ? `<img src="${product.imageUrl}" alt="${escapeHtml(product.name)}" />`
                  : `<div class="product-placeholder">🪴</div>`
              }
            </div>
            <div class="product-body">
              <div class="product-header">
                <h3>${escapeHtml(product.name)}</h3>
                <span class="qty-pill">${product.quantity} un</span>
              </div>
              ${showDescriptions ? `<div class="highlight-list">${highlights.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
              ${
                showDescriptions
                  ? `<p class="product-notes">${describeProduct(product)
                      .map((item) => escapeHtml(item))
                      .join(' • ')}</p>`
                  : ''
              }
              ${showPrices ? `<div class="price-line">${escapeHtml(formatCurrency(product.price))}</div>` : ''}
              ${variantMarkup}
            </div>
          </article>
        `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(catalogName)} - Catálogo</title>
  <style>
    @page { margin: 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #12301f;
      background: #ffffff;
      min-height: 100vh;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      position: relative;
      min-height: 100vh;
      padding: 28px;
      isolation: isolate;
    }
    .page::before {
      content: "";
      position: fixed;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.96)),
        url("data:image/svg+xml;utf8,${encodeURIComponent(PLANT_BACKGROUND_SVG)}") center/cover no-repeat;
      z-index: -2;
    }
    .page::after {
      content: "";
      position: fixed;
      inset: 0;
      background:
        radial-gradient(circle at 12% 20%, rgba(79, 157, 105, 0.07), transparent 28%),
        radial-gradient(circle at 88% 16%, rgba(79, 157, 105, 0.06), transparent 24%),
        radial-gradient(circle at 82% 84%, rgba(79, 157, 105, 0.05), transparent 26%),
        radial-gradient(circle at 16% 82%, rgba(79, 157, 105, 0.05), transparent 24%);
      z-index: -1;
      pointer-events: none;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
      padding-bottom: 18px;
      margin-bottom: 22px;
      border-bottom: 1px solid rgba(18, 48, 31, 0.12);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-mark {
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(79,157,105,0.22), rgba(79,157,105,0.08));
      display: grid;
      place-items: center;
      font-size: 30px;
      border: 1px solid rgba(79,157,105,0.18);
      box-shadow: 0 18px 40px rgba(79,157,105,0.08);
    }
    .brand-copy h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.05;
      color: #12301f;
    }
    .brand-copy p {
      margin: 6px 0 0;
      color: rgba(18, 48, 31, 0.7);
      font-size: 13px;
    }
    .header-meta {
      text-align: right;
      font-size: 12px;
      color: rgba(18, 48, 31, 0.65);
      max-width: 280px;
    }
    .header-meta strong {
      display: block;
      color: #12301f;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .products-grid {
      display: grid;
      grid-template-columns: repeat(${Math.max(1, Math.min(columns, 4))}, minmax(0, 1fr));
      gap: 16px;
    }
    .product-card {
      break-inside: avoid;
      page-break-inside: avoid;
      background: rgba(255,255,255,0.9);
      border: 1px solid rgba(79, 157, 105, 0.16);
      border-radius: 22px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(17, 61, 34, 0.07);
    }
    .product-media {
      position: relative;
      aspect-ratio: 1 / 1;
      background: linear-gradient(180deg, rgba(79,157,105,0.05), rgba(79,157,105,0.01));
    }
    .product-media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .product-placeholder {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      font-size: 54px;
      color: rgba(18, 48, 31, 0.28);
    }
    .product-body {
      padding: 14px 14px 16px;
    }
    .product-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 10px;
    }
    .product-header h3 {
      margin: 0;
      font-size: 15px;
      line-height: 1.2;
      color: #12301f;
    }
    .qty-pill {
      flex: none;
      font-size: 11px;
      padding: 5px 8px;
      border-radius: 999px;
      background: rgba(79,157,105,0.12);
      color: #25603a;
      border: 1px solid rgba(79,157,105,0.2);
      font-weight: 700;
    }
    .highlight-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }
    .highlight-list span {
      font-size: 10px;
      color: rgba(18, 48, 31, 0.76);
      background: rgba(18, 48, 31, 0.04);
      border: 1px solid rgba(18, 48, 31, 0.08);
      padding: 4px 8px;
      border-radius: 999px;
    }
    .product-notes {
      margin: 0 0 10px;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(18, 48, 31, 0.66);
    }
    .price-line {
      font-size: 21px;
      font-weight: 800;
      color: #1d6b3f;
      margin-bottom: 12px;
    }
    .variant-panel {
      border-top: 1px solid rgba(18, 48, 31, 0.08);
      padding-top: 12px;
    }
    .variant-panel-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(18, 48, 31, 0.55);
      margin-bottom: 8px;
      font-weight: 700;
    }
    .variant-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .variant-row {
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(18, 48, 31, 0.03);
      border: 1px solid rgba(18, 48, 31, 0.08);
    }
    .variant-name {
      font-size: 12px;
      font-weight: 700;
      color: #12301f;
      margin-bottom: 4px;
    }
    .variant-values {
      font-size: 10px;
      color: rgba(18, 48, 31, 0.7);
      margin-bottom: 6px;
    }
    .variant-meta {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 10px;
      color: rgba(18, 48, 31, 0.62);
      font-weight: 700;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid rgba(18, 48, 31, 0.12);
      font-size: 12px;
      color: rgba(18, 48, 31, 0.68);
    }
    .footer strong {
      color: #12301f;
    }
    @media print {
      .page { padding: 0; }
      .footer { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <main class="page">
    ${
      includeHeader
        ? `
      <header class="header">
        <div class="brand">
          <div class="brand-mark">${escapeHtml(brandLogo)}</div>
          <div class="brand-copy">
            <h1>${escapeHtml(catalogName)}</h1>
            <p>${escapeHtml(catalogSubtitle)}</p>
          </div>
        </div>
        <div class="header-meta">
          <strong>Catalogo listo para clientes</strong>
          ${escapeHtml(contactInfo)}<br />
          ${escapeHtml(new Date().toLocaleDateString('es-CO'))}
        </div>
      </header>
    `
        : ''
    }

    <section class="products-grid">
      ${productsMarkup}
    </section>

    ${
      includeFooter
        ? `
      <footer class="footer">
        <div><strong>${exportProducts.length}</strong> productos seleccionados</div>
        <div>Generado desde Shelf Inventory${mode === 'pdf' ? ' para PDF' : ''}</div>
      </footer>
    `
        : ''
    }
  </main>
  ${
    mode === 'pdf'
      ? `
    <script>
      window.addEventListener('load', () => {
        setTimeout(() => window.print(), 300);
      });
      window.addEventListener('afterprint', () => window.close());
    </script>
  `
      : ''
  }
</body>
</html>`;
  };

  const handleExportHTML = () => {
    const html = buildPrintableDocument('html');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${catalogName.replace(/\s+/g, '_')}_catalogo.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDFViaPrint = () => {
    const html = buildPrintableDocument('pdf');
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1280,height=1600');
    if (!printWindow) {
      return;
    }

    // Use srcdoc instead of document.write for safe DOM injection
    // All product data is escaped via escapeHtml() in buildPrintableDocument
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  };

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5DC]">📚 Generar Catálogo</h2>
            <p className="text-sm text-[#F5F5DC]/60 mt-1">
              Previsualiza el catálogo y exporta un PDF limpio, sin la interfaz de administración.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
            <button
              data-testid="catalog-export-html"
              onClick={handleExportHTML}
              className="flex-1 sm:flex-none bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition-all active:scale-95 text-sm"
            >
              🌐 HTML
            </button>
            <button
              data-testid="catalog-export-pdf"
              onClick={handleExportPDFViaPrint}
              className="flex-1 sm:flex-none bg-red-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 transition-all active:scale-95 text-sm"
            >
              🖨️ PDF
            </button>
          </div>
        </div>

        <div className="w-full bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-[#F5F5DC]/70 mb-1">Nombre del Catálogo</label>
              <input
                data-testid="catalog-name-input"
                type="text"
                value={catalogName}
                onChange={(e) => setCatalogName(e.target.value)}
                className="w-full p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]/50"
              />
            </div>
            <div>
              <label className="block text-sm text-[#F5F5DC]/70 mb-1">Subtítulo</label>
              <input
                data-testid="catalog-subtitle-input"
                type="text"
                value={catalogSubtitle}
                onChange={(e) => setCatalogSubtitle(e.target.value)}
                className="w-full p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]/50"
              />
            </div>
            <div>
              <label className="block text-sm text-[#F5F5DC]/70 mb-1">Columnas</label>
              <select
                data-testid="catalog-columns-select"
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
                className="w-full p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]/50"
              >
                <option value={2}>2 columnas</option>
                <option value={3}>3 columnas</option>
                <option value={4}>4 columnas</option>
                <option value={5}>5 columnas</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#F5F5DC]/70 mb-1">Contacto</label>
              <input
                data-testid="catalog-contact-input"
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                className="w-full p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]/50"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="catalog-show-prices"
                type="checkbox"
                checked={showPrices}
                onChange={(e) => setShowPrices(e.target.checked)}
                className="accent-[#4f9d69]"
              />
              Mostrar precios
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="catalog-show-descriptions"
                type="checkbox"
                checked={showDescriptions}
                onChange={(e) => setShowDescriptions(e.target.checked)}
                className="accent-[#4f9d69]"
              />
              Mostrar detalles
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="catalog-include-header"
                type="checkbox"
                checked={includeHeader}
                onChange={(e) => setIncludeHeader(e.target.checked)}
                className="accent-[#4f9d69]"
              />
              Incluir encabezado
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="catalog-include-footer"
                type="checkbox"
                checked={includeFooter}
                onChange={(e) => setIncludeFooter(e.target.checked)}
                className="accent-[#4f9d69]"
              />
              Incluir pie
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="catalog-only-selected"
                type="checkbox"
                checked={showOnlySelected}
                onChange={(e) => setShowOnlySelected(e.target.checked)}
                className="accent-[#4f9d69]"
              />
              Solo seleccionados
            </label>
          </div>

          <div className="mt-4">
            <label className="block text-sm text-[#F5F5DC]/70 mb-1">Logo / Emoji</label>
            <input
              type="text"
              value={brandLogo}
              onChange={(e) => setBrandLogo(e.target.value)}
              className="w-24 p-2.5 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-center text-lg focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]/50"
              maxLength={10}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-[#F5F5DC]/70">
              {selectedIds.size} de {activeProducts.length} productos
            </span>
            <button
              data-testid="catalog-select-all"
              onClick={selectAll}
              className="text-xs bg-[#F5F5DC]/10 px-3 py-1.5 rounded hover:bg-[#F5F5DC]/20 transition min-h-[36px]"
            >
              Seleccionar todos
            </button>
            <button
              data-testid="catalog-deselect-all"
              onClick={deselectAll}
              className="text-xs bg-[#F5F5DC]/10 px-3 py-1.5 rounded hover:bg-[#F5F5DC]/20 transition min-h-[36px]"
            >
              Deseleccionar todos
            </button>
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="p-2 bg-[#121212] border border-[#F5F5DC]/20 rounded-md text-sm focus:outline-none"
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === 'todos' ? 'Todas las categorías' : category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="w-full bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-2xl p-4 md:p-5">
        {visibleProducts.length === 0 ? (
          <div className="text-center py-14 text-[#F5F5DC]/55">
            <div className="text-4xl mb-3">📭</div>
            <p>No hay productos para mostrar en el catálogo.</p>
            <p className="text-sm mt-2">Agrega productos en Inventario primero.</p>
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, Math.min(columns, 4))}, minmax(0, 1fr))`,
            }}
          >
            {visibleProducts.map((product) => {
              const selected = selectedIds.has(product.id);
              const variants = getProductVariants(product);
              return (
                <article
                  key={product.id}
                  data-testid="catalog-product-card"
                  onClick={() => toggleProduct(product.id)}
                  className={`group overflow-hidden rounded-2xl border-2 transition-all cursor-pointer ${
                    selected ? 'border-[#4f9d69] bg-[#0f2518]' : 'border-transparent bg-[#121212] hover:border-white/10'
                  }`}
                >
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full aspect-square object-cover" />
                  ) : (
                    <div className="w-full aspect-square bg-gradient-to-br from-[#0e1f16] to-[#07100b] flex items-center justify-center text-5xl text-[#F5F5DC]/25">
                      🪴
                    </div>
                  )}
                  <div className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[#F5F5DC] leading-tight truncate">{product.name}</h3>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-[#F5F5DC]/10 text-[#F5F5DC]/75 whitespace-nowrap">
                        {product.quantity} stock
                      </span>
                    </div>

                    {showDescriptions && product.sku && (
                      <p data-testid="catalog-product-sku" className="text-xs text-[#F5F5DC]/50 mt-1 font-mono">
                        SKU: {product.sku}
                      </p>
                    )}

                    {showDescriptions &&
                      (product.variantAttributes?.length ?? 0) > 0 &&
                      (() => {
                        const variantAttributes = product.variantAttributes ?? [];
                        return (
                          <p className="text-xs text-[#F5F5DC]/50 mt-1">Atributos: {variantAttributes.join(', ')}</p>
                        );
                      })()}

                    {showDescriptions && variants.length > 1 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {variants.slice(0, 3).map((variant) => (
                          <span
                            key={variant.id}
                            className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[#F5F5DC]/75"
                          >
                            {getProductVariantDisplay(product, variant) || variant.label || 'Default'}
                          </span>
                        ))}
                        {variants.length > 3 && (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[#F5F5DC]/55">
                            +{variants.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {showDescriptions && product.color && (
                      <p className="text-xs text-[#F5F5DC]/50 mt-1">🎨 {product.color}</p>
                    )}
                    {showDescriptions && product.dimensions && (
                      <p className="text-xs text-[#F5F5DC]/50 mt-1">📏 {product.dimensions}</p>
                    )}
                    {showDescriptions && product.capacity && (
                      <p className="text-xs text-[#F5F5DC]/50 mt-1">🧴 {product.capacity}</p>
                    )}
                    {showDescriptions && product.material && (
                      <p className="text-xs text-[#F5F5DC]/50 mt-1">🧱 {product.material}</p>
                    )}

                    {showPrices && (
                      <p data-testid="catalog-product-price" className="text-lg font-bold text-green-400 mt-2">
                        {formatCurrency(product.price)}
                      </p>
                    )}

                    <div className={`mt-2 text-xs ${selected ? 'text-green-400' : 'text-[#F5F5DC]/30'}`}>
                      {selected ? '✓ Seleccionado' : 'Click para seleccionar'}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Catalog;
