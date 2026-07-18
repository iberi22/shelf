import {
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { useEdgeMesh } from 'edge-mesh-react';
import { Building2, Download } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useUI } from '../context/UIContext';
import useLocalStorage from '../hooks/useLocalStorage';
import AIChat from './AIChat';
import StatCard from './StatCard';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const Reports: React.FC = () => {
  const { t, locale } = useI18n();
  const { state } = useAppContext();
  const mesh = useEdgeMesh();
  const { isFree } = useSubscription();
  const { openSubscriptionModal } = useUI();
  const { formatCurrency } = useCurrency();
  const [lowStockThreshold] = useLocalStorage('lowStockThreshold', 5);

  // Filters State
  const today = new Date();
  const lastMonth = new Date(today);
  lastMonth.setMonth(today.getMonth() - 1);
  const [startDate, setStartDate] = useState(lastMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [isConsolidated, setIsConsolidated] = useState(false);
  const [reportType, setReportType] = useState<'sales' | 'consolidated-inventory'>('sales');

  const consolidatedData = useMemo(() => {
    const currentBranchName = state.branches.find((b) => b.id === state.activeBranchId)?.name || 'Local';
    const activeBranches = state.branches.filter((b) => b.isActive);

    if (!isConsolidated && reportType === 'sales') {
      return {
        sales: state.sales,
        products: state.products.map((p) => ({ ...p, branchName: currentBranchName })),
      };
    }

    if (!mesh) {
      return {
        sales: state.sales,
        products: state.products.map((p) => ({ ...p, branchName: currentBranchName })),
      };
    }

    const allSales = [...state.sales.map((s) => ({ ...s, branchName: currentBranchName }))];
    const allProducts = [...state.products.map((p) => ({ ...p, branchName: currentBranchName }))];

    // Get data from other branches
    for (const branch of activeBranches) {
      if (branch.id === state.activeBranchId) continue;

      const namespace = `shelf/${branch.id}`;
      const branchSales = Array.from(mesh.yjsAdapter.doc.getMap(`${namespace}_sales`).values()) as any[];
      const branchProducts = Array.from(mesh.yjsAdapter.doc.getMap(`${namespace}_products`).values()) as any[];

      allSales.push(...branchSales.map((s) => ({ ...s, branchName: branch.name })));
      allProducts.push(...branchProducts.map((p) => ({ ...p, branchName: branch.name })));
    }

    // Global namespace
    if (state.activeBranchId !== null) {
      const globalSales = Array.from(mesh.yjsAdapter.doc.getMap(`shelf_sales`).values()) as any[];
      const globalProducts = Array.from(mesh.yjsAdapter.doc.getMap(`shelf_products`).values()) as any[];
      allSales.push(...globalSales.map((s) => ({ ...s, branchName: 'Global' })));
      allProducts.push(...globalProducts.map((p) => ({ ...p, branchName: 'Global' })));
    }

    return { sales: allSales, products: allProducts };
  }, [isConsolidated, reportType, mesh, state.sales, state.products, state.branches, state.activeBranchId]);

  const aggregatedInventory = useMemo(() => {
    const agg: Record<string, { sku: string; name: string; quantities: Record<string, number>; total: number }> = {};

    consolidatedData.products.forEach((p) => {
      if (!p.isActive) return;
      const key = p.sku || p.name;
      if (!agg[key]) {
        agg[key] = { sku: p.sku || '', name: p.name, quantities: {}, total: 0 };
      }
      const bName = p.branchName || 'Global';
      agg[key].quantities[bName] = (agg[key].quantities[bName] || 0) + p.quantity;
      agg[key].total += p.quantity;
    });

    return {
      items: Object.values(agg).sort((a, b) => a.name.localeCompare(b.name)) as Array<{
        sku: string;
        name: string;
        quantities: Record<string, number>;
        total: number;
      }>,
      branches: Array.from(
        new Set(
          consolidatedData.products
            .filter((p: any) => p.isActive)
            .map((p: any) => (p.branchName || 'Global') as string),
        ),
      ),
    };
  }, [consolidatedData.products]);

  const inventoryStats = useMemo(() => {
    const skus = new Set(consolidatedData.products.filter((p: any) => p.isActive).map((p: any) => p.sku || p.name))
      .size;
    const totalStock = consolidatedData.products
      .filter((p: any) => p.isActive)
      .reduce((sum: number, p: any) => sum + p.quantity, 0);
    return { skus, totalStock };
  }, [consolidatedData.products]);

  const filteredSales = useMemo(() => {
    return consolidatedData.sales.filter((sale) => {
      const saleDate = new Date(sale.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include the whole end day

      const dateMatch = saleDate >= start && saleDate <= end;
      const clientMatch = selectedClientId === 'all' || sale.clientId === selectedClientId;
      const productMatch =
        selectedProductId === 'all' || sale.items.some((item) => item.productId === selectedProductId);

      return dateMatch && clientMatch && productMatch;
    });
  }, [consolidatedData.sales, startDate, endDate, selectedProductId, selectedClientId]);

  const summaryStats = useMemo(() => {
    return filteredSales.reduce(
      (acc, sale) => {
        acc.revenue += sale.totalPrice;
        acc.profit += sale.profit;
        acc.sales += 1;
        acc.itemsSold += sale.items.reduce((sum, item) => sum + item.quantity, 0);
        return acc;
      },
      { revenue: 0, profit: 0, sales: 0, itemsSold: 0 },
    );
  }, [filteredSales]);

  const salesByDay = useMemo(() => {
    const data: { [key: string]: number } = {};
    filteredSales.forEach((sale) => {
      const day = new Date(sale.date).toISOString().split('T')[0];
      data[day] = (data[day] || 0) + sale.totalPrice;
    });
    return Object.entries(data).sort(([dayA], [dayB]) => new Date(dayA).getTime() - new Date(dayB).getTime());
  }, [filteredSales]);

  const topProducts = useMemo(() => {
    const products: { [key: string]: { id: string; name: string; revenue: number; profit: number } } = {};
    filteredSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const itemKey = item.productVariantId ? `${item.productId}::${item.productVariantId}` : item.productId;
        if (!products[itemKey]) {
          products[itemKey] = { id: itemKey, name: item.productName, revenue: 0, profit: 0 };
        }
        products[itemKey].revenue += item.price * item.quantity;
        products[itemKey].profit += (item.price - item.cost) * item.quantity;
      });
    });
    const productList = Object.values(products);
    const byRevenue = [...productList].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const byProfit = [...productList].sort((a, b) => b.profit - a.profit).slice(0, 5);
    return { byRevenue, byProfit };
  }, [filteredSales]);

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e1e1e',
        titleColor: '#F5F5DC',
        bodyColor: '#F5F5DC',
        borderColor: '#F5F5DC/30',
        borderWidth: 1,
        callbacks: {
          label: (context: any) => formatCurrency(context.parsed.y),
        },
      },
    },
    scales: {
      y: {
        ticks: {
          color: '#F5F5DC/70',
          callback: (value: any) => formatCurrency(Number(value)),
        },
        grid: { color: '#F5F5DC/20' },
        border: { color: '#F5F5DC/20' },
      },
      x: {
        ticks: { color: '#F5F5DC/70' },
        grid: { display: false },
        border: { color: '#F5F5DC/20' },
      },
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
  };

  const chartData = {
    labels: salesByDay.map(([day]) => new Date(day).toLocaleDateString(locale, { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: t('reports.summary.revenue'),
        data: salesByDay.map(([, value]) => value),
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.2)',
        tension: 0.2,
        pointBackgroundColor: '#38bdf8',
        pointHoverRadius: 6,
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: '#F5F5DC',
      },
    ],
  };

  const generateInventoryValuationPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF();
    const title = t('reports.inventoryValuation');
    doc.setFontSize(18);
    doc.text(title, 14, 22);

    const tableColumn = [
      t('common.product'),
      t('common.sku'),
      t('common.branch'),
      t('common.stock'),
      t('common.cost'),
      t('reports.valuation.totalValue'),
    ];

    let grandTotal = 0;
    const tableRows = consolidatedData.products
      .filter((p) => p.isActive)
      .map((p: any) => {
        const totalValue = p.quantity * p.cost;
        grandTotal += totalValue;
        return [
          p.name,
          p.sku || '-',
          p.branchName || 'Local',
          p.quantity,
          formatCurrency(p.cost),
          formatCurrency(totalValue),
        ];
      });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [26, 26, 26] },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 30;
    doc.setFontSize(12);
    doc.text(`${t('reports.valuation.grandTotal')}: ${formatCurrency(grandTotal)}`, 14, finalY + 10);

    doc.save(`inventory_valuation_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const generateLowStockPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF();
    const title = t('reports.lowStockReport');
    doc.setFontSize(18);
    doc.text(title, 14, 22);

    const tableColumn = [
      t('common.product'),
      t('common.sku'),
      t('common.branch'),
      t('common.stock'),
      t('settings.lowStockThreshold'),
    ];

    const tableRows = consolidatedData.products
      .filter((p) => p.isActive && p.quantity <= lowStockThreshold)
      .map((p: any) => [p.name, p.sku || '-', p.branchName || 'Local', p.quantity, lowStockThreshold]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [26, 26, 26] },
    });

    doc.save(`low_stock_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold mb-2 text-[#F5F5DC]">{t('reports.title')}</h2>
          <p className="text-sm md:text-base text-foreground/80">{t('reports.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!isFree && (
            <div className="flex gap-2 mr-2">
              <button
                onClick={generateInventoryValuationPDF}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 border bg-transparent text-[#F5F5DC] border-[#F5F5DC]/30 hover:bg-[#F5F5DC]/5"
                data-testid="export-inventory-valuation-pdf"
                title={t('reports.inventoryValuation')}
              >
                <Download className="h-3.5 w-3.5" />
                {t('reports.inventoryValuation')}
              </button>
              <button
                onClick={generateLowStockPDF}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 border bg-transparent text-[#F5F5DC] border-[#F5F5DC]/30 hover:bg-[#F5F5DC]/5"
                data-testid="export-low-stock-pdf"
                title={t('reports.lowStockReport')}
              >
                <Download className="h-3.5 w-3.5" />
                {t('reports.lowStockReport')}
              </button>
            </div>
          )}

          {state.branches.filter((b) => b.isActive).length > 0 && reportType === 'sales' && (
            <button
              onClick={() => setIsConsolidated(!isConsolidated)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold transition-all active:scale-95 border ${
                isConsolidated
                  ? 'bg-[#4ADE80] text-[#121212] border-[#4ADE80]'
                  : 'bg-transparent text-[#F5F5DC] border-[#F5F5DC]/30 hover:bg-[#F5F5DC]/5'
              }`}
              data-testid="consolidated-report-toggle"
            >
              <Building2 className="h-4 w-4" />
              {isConsolidated ? 'Vista Consolidada Activa' : 'Consolidar Sucursales'}
            </button>
          )}

          {state.branches.filter((b) => b.isActive).length > 0 && (
            <div className="flex bg-[#1a1a1a] p-1 rounded-lg border border-[#F5F5DC]/20">
              <button
                onClick={() => setReportType('sales')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                  reportType === 'sales'
                    ? 'bg-[#F5F5DC]/10 text-[#F5F5DC]'
                    : 'text-[#F5F5DC]/50 hover:text-[#F5F5DC]/80'
                }`}
              >
                {t('reports.typeSales')}
              </button>
              <button
                onClick={() => setReportType('consolidated-inventory')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                  reportType === 'consolidated-inventory'
                    ? 'bg-[#F5F5DC]/10 text-[#F5F5DC]'
                    : 'text-[#F5F5DC]/50 hover:text-[#F5F5DC]/80'
                }`}
              >
                {t('reports.typeConsolidatedMultiBranch')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters Section */}
      <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 rounded-lg">
        <h3 className="text-lg font-bold mb-4 text-[#F5F5DC]">{t('reports.filters.title')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="text-xs text-[#F5F5DC]/80">{t('reports.filters.dateRange')}</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-w-0 p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 text-xs"
                data-testid="reports-start-date"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-w-0 p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 text-xs"
                data-testid="reports-end-date"
              />
            </div>
          </div>
          <div>
            <label htmlFor="productFilter" className="text-xs text-[#F5F5DC]/80">
              {t('reports.filters.product')}
            </label>
            <select
              id="productFilter"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 min-h-[44px]"
              data-testid="reports-product-filter"
            >
              <option value="all">
                {t('reports.filters.all')} {t('common.products')}
              </option>
              {consolidatedData.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {(p as any).branchName ? `(${(p as any).branchName})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="clientFilter" className="text-xs text-[#F5F5DC]/80">
              {t('reports.filters.client')}
            </label>
            <select
              id="clientFilter"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full p-2.5 bg-[#121212] border rounded-md border-[#F5F5DC]/30 min-h-[44px]"
              data-testid="reports-client-filter"
            >
              <option value="all">
                {t('reports.filters.all')} {t('nav.clients')}
              </option>
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {reportType === 'sales' ? (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <StatCard titleKey="reports.summary.revenue" value={formatCurrency(summaryStats.revenue)} icon="💰" />
            <StatCard titleKey="reports.summary.profit" value={formatCurrency(summaryStats.profit)} icon="💹" />
            <StatCard titleKey="reports.summary.sales" value={summaryStats.sales.toString()} icon="🛒" />
            <StatCard titleKey="reports.summary.itemsSold" value={summaryStats.itemsSold.toString()} icon="📦" />
          </div>

          {filteredSales.length > 0 ? (
            <div className="space-y-8">
              {/* Sales over Time Chart */}
              <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 rounded-lg">
                <h3 className="text-lg font-bold mb-4 text-[#F5F5DC]">{t('reports.salesOverTime')}</h3>
                <div className="relative h-72">
                  <Line options={chartOptions} data={chartData} />
                </div>
              </div>

              {/* Top Products */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 rounded-lg">
                  <h3 className="text-lg font-bold mb-4 text-[#F5F5DC]">
                    {t('reports.topProducts')}{' '}
                    <span className="text-sm font-normal text-[#F5F5DC]/80">({t('reports.byRevenue')})</span>
                  </h3>
                  <ul className="space-y-2">
                    {topProducts.byRevenue.map((p, i) => (
                      <li
                        key={p.id}
                        className="flex justify-between items-center text-sm p-2 rounded-md bg-background/50"
                      >
                        <div className="min-w-0">
                          <div className="truncate">
                            {i + 1}. {p.name}
                          </div>
                          {(p as any).branchName && (
                            <div className="text-[10px] text-[#F5F5DC]/40 uppercase tracking-wider">
                              {(p as any).branchName}
                            </div>
                          )}
                        </div>
                        <span className="font-bold ml-2 shrink-0">{formatCurrency(p.revenue)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 rounded-lg">
                  <h3 className="text-lg font-bold mb-4 text-[#F5F5DC]">
                    {t('reports.topProducts')}{' '}
                    <span className="text-sm font-normal text-[#F5F5DC]/80">({t('reports.byProfit')})</span>
                  </h3>
                  <ul className="space-y-2">
                    {topProducts.byProfit.map((p, i) => (
                      <li
                        key={p.id}
                        className="flex justify-between items-center text-sm p-2 rounded-md bg-background/50"
                      >
                        <div className="min-w-0">
                          <div className="truncate">
                            {i + 1}. {p.name}
                          </div>
                          {(p as any).branchName && (
                            <div className="text-[10px] text-[#F5F5DC]/40 uppercase tracking-wider">
                              {(p as any).branchName}
                            </div>
                          )}
                        </div>
                        <span className="font-bold text-green-400 ml-2 shrink-0">{formatCurrency(p.profit)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-[#F5F5DC]/80">
              <p>{t('reports.noDataForPeriod')}</p>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-4 md:gap-6">
            <StatCard titleKey="reports.summary.totalStock" value={inventoryStats.totalStock.toString()} icon="📦" />
            <StatCard titleKey="reports.summary.skus" value={inventoryStats.skus.toString()} icon="🏷️" />
          </div>

          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 rounded-lg">
            <h3 className="text-lg font-bold mb-4 text-[#F5F5DC]">{t('reports.typeConsolidatedMultiBranch')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="text-[#F5F5DC]/60 border-b border-[#F5F5DC]/10 bg-[#121212]/50">
                  <tr>
                    <th className="py-3 px-3 min-w-[200px]">{t('common.product')}</th>
                    <th className="py-3 px-3">{t('common.sku')}</th>
                    {aggregatedInventory.branches.map((bName) => (
                      <th
                        key={bName}
                        className="py-3 px-3 text-right text-[10px] uppercase tracking-wider whitespace-nowrap"
                      >
                        {bName}
                      </th>
                    ))}
                    <th className="py-3 px-3 text-right font-bold text-[#4ADE80] border-l border-[#F5F5DC]/10 bg-[#F5F5DC]/5">
                      {t('reports.summary.total')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5DC]/5">
                  {aggregatedInventory.items.map((item) => (
                    <tr key={item.sku + item.name} className="hover:bg-[#F5F5DC]/5 transition-colors">
                      <td className="py-3 px-3 font-medium">{item.name}</td>
                      <td className="py-3 px-3 text-[#F5F5DC]/40 font-mono text-xs">{item.sku || '-'}</td>
                      {aggregatedInventory.branches.map((bName) => (
                        <td
                          key={bName}
                          className={`py-3 px-3 text-right font-mono ${item.quantities[bName] ? 'text-[#F5F5DC]' : 'text-[#F5F5DC]/20'}`}
                        >
                          {item.quantities[bName] || 0}
                        </td>
                      ))}
                      <td className="py-3 px-3 text-right font-bold font-mono text-[#4ADE80] border-l border-[#F5F5DC]/10 bg-[#F5F5DC]/5">
                        {item.total}
                      </td>
                    </tr>
                  ))}
                  {aggregatedInventory.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={aggregatedInventory.branches.length + 3}
                        className="py-12 text-center text-[#F5F5DC]/40 italic"
                      >
                        {t('reports.noDataForPeriod')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant Section */}
      <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 rounded-lg overflow-hidden">
        <div className="p-4 bg-[#F5F5DC]/10">
          <h3 className="text-lg font-bold flex items-center gap-2 text-[#F5F5DC]">
            <span className="text-xl">🤖</span>
            {t('reports.aiAssistantTitle')}
          </h3>
        </div>

        {isFree ? (
          <div className="p-6 text-center">
            <p className="mb-4 text-foreground/80">{t('reports.proFeatureDescription')}</p>
            <button
              onClick={openSubscriptionModal}
              className="text-sm font-semibold text-[#121212] bg-yellow-400 px-4 py-2.5 rounded-lg min-h-[44px] hover:bg-yellow-300 transition-all active:scale-95"
            >
              {t('subscription.upgradeNow')}
            </button>
          </div>
        ) : (
          <AIChat />
        )}
      </div>
    </div>
  );
};

export default Reports;
