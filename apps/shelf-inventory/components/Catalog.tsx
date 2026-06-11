import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';

const Catalog: React.FC = () => {
  const { state } = useAppContext();
  const { formatCurrency } = useCurrency();
  const printRef = useRef<HTMLDivElement>(null);

  const activeProducts = useMemo(() => state.products.filter((p) => p.isActive !== false), [state.products]);

  // Catalog state
  const [catalogName, setCatalogName] = useState('El Mundo de las Materas');
  const [catalogSubtitle, setCatalogSubtitle] = useState('Catálogo de Productos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(activeProducts.map((p) => p.id)));
  const [showPrices, setShowPrices] = useState(true);
  const [showDescriptions, setShowDescriptions] = useState(true);
  const [columns, setColumns] = useState(3);
  const [brandLogo, setBrandLogo] = useState('🪴');
  const [contactInfo, setContactInfo] = useState('WhatsApp: +57 300 000 0000');
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    activeProducts.forEach((p) => {
      // Infer category from name or use a default
      const cat = p.sku?.split('-')[0] || 'general';
      cats.add(cat);
    });
    return ['todos', ...Array.from(cats)];
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    let items = activeProducts;
    if (showOnlySelected) {
      items = items.filter((p) => selectedIds.has(p.id));
    }
    if (selectedCategory !== 'todos') {
      items = items.filter((p) => (p.sku?.split('-')[0] || 'general') === selectedCategory);
    }
    return items;
  }, [activeProducts, selectedIds, selectedCategory, showOnlySelected]);

  const toggleProduct = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    setSelectedIds(new Set(activeProducts.map((p) => p.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleExportHTML = () => {
    const html = generateCatalogHTML();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${catalogName.replace(/\s+/g, '_')}_catalogo.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const generateCatalogHTML = (): string => {
    const products = showOnlySelected ? filteredProducts : activeProducts.filter((p) => selectedIds.has(p.id));

    const productCards = products
      .map(
        (p) => `
      <div class="product-card">
        ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" class="product-img" />` : `<div class="product-img placeholder">📦</div>`}
        <div class="product-info">
          <h3>${escapeHtml(p.name)}</h3>
          ${showDescriptions && p.sku ? `<p class="sku">SKU: ${escapeHtml(p.sku)}</p>` : ''}
          ${showDescriptions && p.color ? `<p class="prop">🎨 ${escapeHtml(p.color)}</p>` : ''}
          ${showDescriptions && p.dimensions ? `<p class="prop">📏 ${escapeHtml(p.dimensions)}</p>` : ''}
          ${showDescriptions && p.capacity ? `<p class="prop">🧴 ${escapeHtml(p.capacity)}</p>` : ''}
          ${showDescriptions && p.material ? `<p class="prop">🧱 ${escapeHtml(p.material)}</p>` : ''}
          ${showPrices ? `<p class="price">${formatCurrency(p.price)}</p>` : ''}
        </div>
      </div>`,
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(catalogName)} - Catálogo</title>
  <style>
    @page { margin: 1.5cm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #1a1a2e;
      background: #fff;
      padding: 20px;
    }
    .catalog-container { max-width: 1200px; margin: 0 auto; }
    ${
      includeHeader
        ? `
    .header {
      text-align: center;
      padding: 30px 20px;
      border-bottom: 3px solid #2d6a4f;
      margin-bottom: 30px;
    }
    .header .brand { font-size: 48px; margin-bottom: 10px; }
    .header h1 { font-size: 32px; color: #1b4332; margin-bottom: 5px; }
    .header p { font-size: 16px; color: #555; }
    `
        : ''
    }
    .products-grid {
      display: grid;
      grid-template-columns: repeat(${columns}, 1fr);
      gap: 20px;
      padding: 10px 0;
    }
    .product-card {
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .product-img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      display: block;
      background: #f5f5f5;
    }
    .product-img.placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 64px;
      color: #999;
    }
    .product-info {
      padding: 12px;
    }
    .product-info h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
      color: #1b4332;
    }
    .product-info .sku {
      font-size: 11px;
      color: #888;
      margin-bottom: 4px;
    }
    .product-info .prop {
      font-size: 11px;
      color: #666;
      margin-bottom: 2px;
    }
    .product-info .price {
      font-size: 18px;
      font-weight: 700;
      color: #2d6a4f;
    }
    ${
      includeFooter
        ? `
    .footer {
      text-align: center;
      padding: 30px 20px;
      margin-top: 40px;
      border-top: 2px solid #e0e0e0;
      font-size: 14px;
      color: #666;
    }
    `
        : ''
    }
    @media print {
      body { padding: 0; }
      .header { padding: 20px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="catalog-container">
    ${
      includeHeader
        ? `
    <div class="header">
      <div class="brand">${brandLogo}</div>
      <h1>${escapeHtml(catalogName)}</h1>
      <p>${escapeHtml(catalogSubtitle)}</p>
    </div>`
        : ''
    }
    <div class="products-grid">
      ${productCards}
    </div>
    ${
      includeFooter
        ? `
    <div class="footer">
      <p>${escapeHtml(contactInfo)}</p>
      <p style="margin-top:5px;font-size:12px">Generado desde Shelf. — ${new Date().toLocaleDateString('es-CO')}</p>
    </div>`
        : ''
    }
  </div>
</body>
</html>`;
  };

  const handleExportPDFViaPrint = () => {
    handlePrint();
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="no-print flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-wrap">
          <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5DC] shrink-0">📖 Generar Catálogo</h2>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-wrap sm:flex-nowrap">
            <button
              data-testid="catalog-export-html"
              onClick={handleExportHTML}
              className="flex-1 sm:flex-none bg-green-700 text-white font-bold py-2 px-3 sm:px-5 rounded-lg hover:bg-green-600 transition-all active:scale-95 text-xs sm:text-sm"
            >
              🌐 HTML
            </button>
            <button
              data-testid="catalog-export-pdf"
              onClick={handleExportPDFViaPrint}
              className="flex-1 sm:flex-none bg-red-700 text-white font-bold py-2 px-3 sm:px-5 rounded-lg hover:bg-red-600 transition-all active:scale-95 text-xs sm:text-sm"
            >
              🖨️ PDF
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        <div className="bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Catalog Name */}
            <div>
              <label className="block text-sm text-[#F5F5DC]/70 mb-1">Nombre del Catálogo</label>
              <input
                data-testid="catalog-name-input"
                type="text"
                value={catalogName}
                onChange={(e) => setCatalogName(e.target.value)}
                className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
              />
            </div>

            {/* Subtitle */}
            <div>
              <label className="block text-sm text-[#F5F5DC]/70 mb-1">Subtítulo</label>
              <input
                data-testid="catalog-subtitle-input"
                type="text"
                value={catalogSubtitle}
                onChange={(e) => setCatalogSubtitle(e.target.value)}
                className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
              />
            </div>

            {/* Columns */}
            <div>
              <label className="block text-sm text-[#F5F5DC]/70 mb-1">Columnas</label>
              <select
                data-testid="catalog-columns-select"
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
                className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
              >
                <option value={2}>2 columnas</option>
                <option value={3}>3 columnas</option>
                <option value={4}>4 columnas</option>
                <option value={5}>5 columnas</option>
              </select>
            </div>

            {/* Contact Info */}
            <div>
              <label className="block text-sm text-[#F5F5DC]/70 mb-1">Info de Contacto</label>
              <input
                data-testid="catalog-contact-input"
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                className="w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4 mt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="catalog-show-prices"
                type="checkbox"
                checked={showPrices}
                onChange={(e) => setShowPrices(e.target.checked)}
                className="accent-[#2d6a4f]"
              />
              Mostrar precios
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="catalog-show-descriptions"
                type="checkbox"
                checked={showDescriptions}
                onChange={(e) => setShowDescriptions(e.target.checked)}
                className="accent-[#2d6a4f]"
              />
              Mostrar descripciones
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="catalog-include-header"
                type="checkbox"
                checked={includeHeader}
                onChange={(e) => setIncludeHeader(e.target.checked)}
                className="accent-[#2d6a4f]"
              />
              Incluir encabezado
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="catalog-include-footer"
                type="checkbox"
                checked={includeFooter}
                onChange={(e) => setIncludeFooter(e.target.checked)}
                className="accent-[#2d6a4f]"
              />
              Incluir pie de página
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                data-testid="catalog-only-selected"
                type="checkbox"
                checked={showOnlySelected}
                onChange={(e) => setShowOnlySelected(e.target.checked)}
                className="accent-[#2d6a4f]"
              />
              Solo productos seleccionados
            </label>
          </div>

          {/* Brand Logo */}
          <div className="mt-4">
            <label className="block text-sm text-[#F5F5DC]/70 mb-1">Logo / Emoji de marca</label>
            <input
              type="text"
              value={brandLogo}
              onChange={(e) => setBrandLogo(e.target.value)}
              className="w-32 p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
              maxLength={10}
            />
          </div>
        </div>

        {/* Selection Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
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
          <div className="flex gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="p-1.5 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-xs focus:outline-none"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'todos' ? 'Todas las categorías' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Product Grid Preview */}
      <div ref={printRef} className="bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg p-4">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-[#F5F5DC]/50">
            <div className="text-4xl mb-3">📭</div>
            <p>No hay productos para mostrar en el catálogo.</p>
            <p className="text-sm mt-2">Agrega productos en Inventario primero.</p>
          </div>
        ) : (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.min(columns, 4)}, 1fr)`,
            }}
          >
            {filteredProducts.map((product) => {
              const isSelected = selectedIds.has(product.id);
              return (
                <div
                  key={product.id}
                  data-testid="catalog-product-card"
                  onClick={() => toggleProduct(product.id)}
                  className={`
                    rounded-lg overflow-hidden cursor-pointer border-2 transition-all
                    ${
                      isSelected
                        ? 'border-green-500 bg-green-900/20'
                        : 'border-transparent bg-[#121212] hover:border-gray-500'
                    }
                  `}
                >
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full aspect-square object-cover" />
                  ) : (
                    <div className="w-full aspect-square bg-[#0a0a0a] flex items-center justify-center text-5xl text-[#F5F5DC]/30">
                      🪴
                    </div>
                  )}
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-[#F5F5DC] truncate">{product.name}</h3>
                    {showDescriptions && product.sku && (
                      <p data-testid="catalog-product-sku" className="text-xs text-[#F5F5DC]/50 mt-0.5">
                        SKU: {product.sku}
                      </p>
                    )}
                    {showDescriptions && product.color && (
                      <p className="text-xs text-[#F5F5DC]/50 mt-0.5">🎨 {product.color}</p>
                    )}
                    {showDescriptions && product.dimensions && (
                      <p className="text-xs text-[#F5F5DC]/50 mt-0.5">📏 {product.dimensions}</p>
                    )}
                    {showDescriptions && product.capacity && (
                      <p className="text-xs text-[#F5F5DC]/50 mt-0.5">🧴 {product.capacity}</p>
                    )}
                    {showDescriptions && product.material && (
                      <p className="text-xs text-[#F5F5DC]/50 mt-0.5">🧱 {product.material}</p>
                    )}
                    {showPrices && (
                      <p data-testid="catalog-product-price" className="text-lg font-bold text-green-400 mt-1">
                        {formatCurrency(product.price)}
                      </p>
                    )}
                    <div className={`mt-1 text-xs ${isSelected ? 'text-green-400' : 'text-[#F5F5DC]/30'}`}>
                      {isSelected ? '✓ Seleccionado' : 'Click para seleccionar'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export default Catalog;
