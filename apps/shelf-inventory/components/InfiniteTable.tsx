import React from 'react';
import { TableVirtuoso } from 'react-virtuoso';

export interface InfiniteTableProps<T> {
  data: T[];
  fixedHeaderContent: () => React.ReactNode;
  itemContent: (index: number, item: T) => React.ReactNode;
  emptyContent?: React.ReactNode;
  circular?: boolean;
  height?: string | number;
}

const HUGE_NUMBER = 1000000;
const START_INDEX = HUGE_NUMBER / 2;

export function InfiniteTable<T>({
  data,
  fixedHeaderContent,
  itemContent,
  emptyContent,
  circular = true,
  height = 'calc(100vh - 250px)'
}: InfiniteTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg overflow-hidden flex items-center justify-center min-h-[200px]">
        {emptyContent || <span className="text-[#F5F5DC]/70">No hay datos</span>}
      </div>
    );
  }

  const totalCount = circular ? HUGE_NUMBER : data.length;
  // Offset to the middle so we can scroll upwards (backwards) infinitely
  const initialTopMostItemIndex = circular ? START_INDEX - (START_INDEX % data.length) : 0;

  return (
    <div style={{ height, width: '100%' }} className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg overflow-hidden">
      <TableVirtuoso
        totalCount={totalCount}
        initialTopMostItemIndex={initialTopMostItemIndex}
        increaseViewportBy={800} // Carga más elementos pre-emptivemente
        components={{
          Table: (props) => <table {...props} className="w-full text-left" style={{ ...props.style, borderCollapse: 'collapse' }} />,
          // Aplicamos color de fondo a thead para que no sea transparente al hacer scroll
          TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref as React.Ref<HTMLTableSectionElement>} className="bg-[#1e1e1e] border-b border-[#F5F5DC]/20 z-10 sticky top-0" />),
          TableRow: (props) => <tr {...props} className="border-t border-[#F5F5DC]/20 hover:bg-[#F5F5DC]/5 transition-colors duration-200 text-xs md:text-sm bg-[#1a1a1a]" />,
          TableBody: React.forwardRef((props, ref) => <tbody {...props} ref={ref as React.Ref<HTMLTableSectionElement>} />),
        }}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={(index) => {
          // Circular logic: Ensure positive mod result even if index is negative
          const safeIndex = ((index % data.length) + data.length) % data.length;
          const item = data[safeIndex];
          return itemContent(index, item);
        }}
      />
    </div>
  );
}
