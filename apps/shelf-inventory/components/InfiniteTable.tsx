import type React from 'react';
import { useMemo, useState } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';

export interface InfiniteTableProps<T> {
  data: T[];
  fixedHeaderContent: () => React.ReactNode;
  itemContent: (index: number, item: T) => React.ReactNode;
  emptyContent?: React.ReactNode;
  height?: string | number;
  pageSize?: number;
  onItemClick?: (item: T, index: number) => void;
}

const DEFAULT_PAGE_SIZE = 50;

export function InfiniteTable<T>({
  data,
  fixedHeaderContent,
  itemContent,
  emptyContent,
  height = 'calc(100vh - 250px)',
  pageSize,
  onItemClick,
}: InfiniteTableProps<T>) {
  const [configuredPageSize] = useLocalStorage('tablePageSize', DEFAULT_PAGE_SIZE);
  const effectivePageSize = Math.max(1, pageSize || Number(configuredPageSize) || DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(data.length / effectivePageSize));
  const safePage = Math.min(currentPage, totalPages);

  const pageData = useMemo(() => {
    const start = (safePage - 1) * effectivePageSize;
    return data.slice(start, start + effectivePageSize);
  }, [data, safePage, effectivePageSize]);

  if (data.length === 0) {
    return (
      <div className="glass-panel overflow-hidden flex items-center justify-center min-h-[200px]">
        {emptyContent || <span className="text-neutral-400">No hay datos</span>}
      </div>
    );
  }

  const startItem = (safePage - 1) * effectivePageSize + 1;
  const endItem = Math.min(safePage * effectivePageSize, data.length);

  return (
    <div
      data-testid="inventory-table"
      className="glass-panel overflow-hidden flex flex-col"
      style={{ height, width: '100%' }}
    >
      <div className="overflow-x-auto overflow-y-auto no-scrollbar pb-[72px] md:pb-0">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#161616] border-b border-white/5 sticky top-0 z-10">{fixedHeaderContent()}</thead>
          <tbody>
            {pageData.map((item, index) => (
              <tr
                key={(item as { id?: string }).id ?? `${safePage}-${index}`}
                className={`border-b border-white/5 transition-colors duration-200 text-xs md:text-sm bg-transparent ${
                  onItemClick ? 'cursor-pointer hover:bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                }`}
                onClick={onItemClick ? () => onItemClick(item, (safePage - 1) * effectivePageSize + index) : undefined}
              >
                {itemContent((safePage - 1) * effectivePageSize + index, item)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t border-white/5 bg-[#161616] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-[#F5F5DC]/65">
            Mostrando <span className="font-semibold text-[#F5F5DC]">{startItem}</span>-
            <span className="font-semibold text-[#F5F5DC]">{endItem}</span> de{' '}
            <span className="font-semibold text-[#F5F5DC]">{data.length}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={safePage === 1}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-[#F5F5DC] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Ir a la primera página"
            >
              Primera
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safePage === 1}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-[#F5F5DC] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Ir a la página anterior"
            >
              Anterior
            </button>
            <span className="min-w-16 text-center text-xs font-semibold text-[#F5F5DC]/75">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={safePage === totalPages}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-[#F5F5DC] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Ir a la página siguiente"
            >
              Siguiente
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={safePage === totalPages}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-[#F5F5DC] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Ir a la última página"
            >
              Ultima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
