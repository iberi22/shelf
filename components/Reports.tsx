
import React, { useState, useMemo } from 'react';
import { useI18n } from '../context/I18nContext';
import AIChat from './AIChat';
import { useSubscription } from '../context/SubscriptionContext';
import { useUI } from '../context/UIContext';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import StatCard from './StatCard';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const Reports: React.FC = () => {
  const { t, locale } = useI18n();
  const { state } = useAppContext();
  const { isFree } = useSubscription();
  const { openSubscriptionModal } = useUI();
  const { formatCurrency } = useCurrency();

  // Filters State
  const today = new Date();
  const lastMonth = new Date(today);
  lastMonth.setMonth(today.getMonth() - 1);
  const [startDate, setStartDate] = useState(lastMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');

  const filteredSales = useMemo(() => {
    return state.sales.filter(sale => {
      const saleDate = new Date(sale.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include the whole end day

      const dateMatch = saleDate >= start && saleDate <= end;
      const clientMatch = selectedClientId === 'all' || sale.clientId === selectedClientId;
      const productMatch = selectedProductId === 'all' || sale.items.some(item => item.productId === selectedProductId);
      
      return dateMatch && clientMatch && productMatch;
    });
  }, [state.sales, startDate, endDate, selectedProductId, selectedClientId]);
  
  const summaryStats = useMemo(() => {
    return filteredSales.reduce((acc, sale) => {
        acc.revenue += sale.totalPrice;
        acc.profit += sale.profit;
        acc.sales += 1;
        acc.itemsSold += sale.items.reduce((sum, item) => sum + item.quantity, 0);
        return acc;
    }, { revenue: 0, profit: 0, sales: 0, itemsSold: 0 });
  }, [filteredSales]);

  const salesByDay = useMemo(() => {
    const data: { [key: string]: number } = {};
    filteredSales.forEach(sale => {
        const day = new Date(sale.date).toISOString().split('T')[0];
        data[day] = (data[day] || 0) + sale.totalPrice;
    });
    return Object.entries(data).sort(([dayA], [dayB]) => new Date(dayA).getTime() - new Date(dayB).getTime());
  }, [filteredSales]);

  const topProducts = useMemo(() => {
    const products: { [key: string]: { id: string, name: string, revenue: number, profit: number } } = {};
    filteredSales.forEach(sale => {
        sale.items.forEach(item => {
            if (!products[item.productId]) {
                products[item.productId] = { id: item.productId, name: item.productName, revenue: 0, profit: 0 };
            }
            products[item.productId].revenue += item.price * item.quantity;
            products[item.productId].profit += (item.price - item.cost) * item.quantity;
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
          label: (context) => formatCurrency(context.parsed.y),
        },
      },
    },
    scales: {
      y: {
        ticks: { 
            color: '#F5F5DC/70',
            callback: (value) => formatCurrency(Number(value)),
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2">{t('reports.title')}</h2>
        <p className="text-foreground/70">{t('reports.description')}</p>
      </div>

      {/* Filters Section */}
      <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-4 rounded-lg">
        <h3 className="text-lg font-bold mb-4">{t('reports.filters.title')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
                <label className="text-xs text-foreground/70">{t('reports.filters.dateRange')}</label>
                <div className="flex gap-2">
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30" data-testid="reports-start-date" />
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30" data-testid="reports-end-date" />
                </div>
            </div>
            <div>
                <label className="text-xs text-foreground/70">{t('reports.filters.product')}</label>
                <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)} className="w-full p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30" data-testid="reports-product-filter">
                    <option value="all">{t('reports.filters.all')} {t('common.products')}</option>
                    {state.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </div>
             <div>
                <label className="text-xs text-foreground/70">{t('reports.filters.client')}</label>
                <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="w-full p-2 bg-[#121212] border rounded-md border-[#F5F5DC]/30" data-testid="reports-client-filter">
                    <option value="all">{t('reports.filters.all')} {t('nav.clients')}</option>
                    {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard titleKey="reports.summary.revenue" value={formatCurrency(summaryStats.revenue)} icon="💰" />
        <StatCard titleKey="reports.summary.profit" value={formatCurrency(summaryStats.profit)} icon="💹" />
        <StatCard titleKey="reports.summary.sales" value={summaryStats.sales.toString()} icon="🛒" />
        <StatCard titleKey="reports.summary.itemsSold" value={summaryStats.itemsSold.toString()} icon="📦" />
      </div>
      
      {filteredSales.length > 0 ? (
        <div className="space-y-8">
            {/* Sales over Time Chart */}
            <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-4 rounded-lg">
                <h3 className="text-lg font-bold mb-4">{t('reports.salesOverTime')}</h3>
                <div className="relative h-72">
                    <Line options={chartOptions} data={chartData} />
                </div>
            </div>

            {/* Top Products */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-4 rounded-lg">
                    <h3 className="text-lg font-bold mb-4">{t('reports.topProducts')} <span className="text-sm font-normal text-foreground/70">({t('reports.byRevenue')})</span></h3>
                    <ul className="space-y-2">
                        {topProducts.byRevenue.map((p, i) => (
                            <li key={p.id} className="flex justify-between items-center text-sm p-2 rounded-md bg-background/50">
                                <span>{i + 1}. {p.name}</span>
                                <span className="font-bold">{formatCurrency(p.revenue)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                 <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-4 rounded-lg">
                    <h3 className="text-lg font-bold mb-4">{t('reports.topProducts')} <span className="text-sm font-normal text-foreground/70">({t('reports.byProfit')})</span></h3>
                    <ul className="space-y-2">
                        {topProducts.byProfit.map((p, i) => (
                            <li key={p.id} className="flex justify-between items-center text-sm p-2 rounded-md bg-background/50">
                                <span>{i + 1}. {p.name}</span>
                                <span className="font-bold text-green-400">{formatCurrency(p.profit)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
      ) : (
        <div className="text-center py-16 text-foreground/70">
            <p>{t('reports.noDataForPeriod')}</p>
        </div>
      )}


      {/* AI Assistant Section */}
      <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 rounded-lg overflow-hidden">
        <div className="p-4 bg-[#F5F5DC]/10">
            <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="text-xl">🤖</span>
                {t('reports.aiAssistantTitle')}
            </h3>
        </div>
        
        {isFree ? (
            <div className="p-6 text-center">
                <p className="mb-4 text-foreground/80">{t('reports.proFeatureDescription')}</p>
                <button 
                    onClick={openSubscriptionModal}
                    className="text-sm font-semibold text-[#121212] bg-yellow-400 px-4 py-2 rounded-lg hover:bg-yellow-300 transition-all active:scale-95"
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