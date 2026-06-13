import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';

interface SearchResult {
  category: string;
  label: string;
  sublabel: string;
  navKey: string;
  id: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (navKey: string) => void;
}

// Map nav keys to human-readable category labels
const CATEGORY_LABELS: Record<string, string> = {
  products: 'Productos',
  clients: 'Clientes',
  suppliers: 'Proveedores',
  sales: 'Ventas',
};

// Category ordering for display
const CATEGORY_ORDER = ['products', 'sales', 'clients', 'suppliers'] as const;

const GlobalSearch: React.FC<Props> = ({ isOpen, onClose, onNavigate }) => {
  const { state } = useAppContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow the modal to render
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const q = query.toLowerCase().trim();
      const newResults: SearchResult[] = [];

      // Search products
      for (const p of state.products) {
        if (!p.isActive) continue;
        if (p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))) {
          newResults.push({
            category: 'products',
            label: p.name,
            sublabel: p.sku ? `SKU: ${p.sku} • $${p.price.toFixed(2)}` : `$${p.price.toFixed(2)}`,
            navKey: 'nav.inventory',
            id: p.id,
          });
        }
      }

      // Search clients
      for (const c of state.clients) {
        if (!c.isActive) continue;
        if (c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))) {
          newResults.push({
            category: 'clients',
            label: c.name,
            sublabel: c.phone || c.email || '',
            navKey: 'nav.clients',
            id: c.id,
          });
        }
      }

      // Search suppliers
      for (const s of state.suppliers) {
        if (!s.isActive) continue;
        if (s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q))) {
          newResults.push({
            category: 'suppliers',
            label: s.name,
            sublabel: s.phone || s.email || '',
            navKey: 'nav.suppliers',
            id: s.id,
          });
        }
      }

      // Search sales (by date or product name)
      for (const sale of state.sales) {
        if (!sale.isActive) continue;
        const saleDate = new Date(sale.date).toLocaleDateString();
        const productNames = sale.items.map((i) => i.productName).join(', ');
        const clientName = sale.clientName || '';
        const matchText = `${saleDate} ${productNames} ${clientName}`.toLowerCase();
        if (matchText.includes(q)) {
          newResults.push({
            category: 'sales',
            label: `Venta #${sale.id.slice(0, 8)}`,
            sublabel: `${saleDate} • ${productNames.slice(0, 50)}${productNames.length > 50 ? '...' : ''}`,
            navKey: 'nav.sales',
            id: sale.id,
          });
        }
      }

      setResults(newResults);
      setSelectedIndex(0);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, state]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      const result = results[selectedIndex];
      if (result) {
        onNavigate(result.navKey);
        onClose();
      }
    }
  };

  // Handle result click
  const handleResultClick = (result: SearchResult) => {
    onNavigate(result.navKey);
    onClose();
  };

  // Group results by category
  const groupedResults = new Map<string, SearchResult[]>();
  for (const r of results) {
    const group = groupedResults.get(r.category) || [];
    group.push(r);
    groupedResults.set(r.category, group);
  }

  // Build flat index for keyboard navigation (iterate in display order)
  let flatIndex = -1;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-xl mx-4 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar productos, clientes, proveedores..."
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-lg"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-xs text-gray-400 bg-gray-700 rounded border border-gray-600 font-mono">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <svg className="w-10 h-10 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
              <p className="text-sm">Sin resultados</p>
            </div>
          )}

          {!query.trim() && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <svg className="w-10 h-10 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">Escribe para buscar...</p>
            </div>
          )}

          {results.length > 0 && (
            <>
              {CATEGORY_ORDER.map((cat) => {
                const group = groupedResults.get(cat);
                if (!group || group.length === 0) return null;

                return (
                  <div key={cat}>
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 bg-gray-850">
                      {CATEGORY_LABELS[cat] || cat}
                    </div>
                    {group.map((result) => {
                      flatIndex++;
                      const index = flatIndex;
                      return (
                        <button
                          key={`${cat}-${result.id}`}
                          onClick={() => handleResultClick(result)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors ${
                            selectedIndex === index
                              ? 'bg-blue-600/20 border-l-2 border-blue-500'
                              : 'hover:bg-gray-700/50 border-l-2 border-transparent'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{result.label}</p>
                            <p className="text-xs text-gray-400 truncate">{result.sublabel}</p>
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0">{CATEGORY_LABELS[result.category]}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-700 bg-gray-850 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] font-mono">↑↓</kbd>
            Navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] font-mono">↵</kbd>
            Abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] font-mono">Esc</kbd>
            Cerrar
          </span>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
