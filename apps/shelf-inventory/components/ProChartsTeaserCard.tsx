import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

interface ProChartsTeaserCardProps {
  onShowProFeatures: () => void;
  rotateEveryMs?: number;
}

const defaultRotateEveryMs = 2 * 60 * 1000;

const getNextRandomIndex = (current: number, count: number) => {
  if (count <= 1) return 0;
  let next = current;
  while (next === current) {
    next = Math.floor(Math.random() * count);
  }
  return next;
};

/**
 * Dashboard charts from live app state (sales / products).
 * Free users see a veil + CTA; Pro users get full interactive charts.
 */
const ProChartsTeaserCard: React.FC<ProChartsTeaserCardProps> = ({
  onShowProFeatures,
  rotateEveryMs = defaultRotateEveryMs,
}) => {
  const { t, locale } = useI18n();
  const { state } = useAppContext();
  const { formatCurrency } = useCurrency();
  const { isPro } = useSubscription();
  const [activeChartIndex, setActiveChartIndex] = useState<number>(() => Math.floor(Math.random() * 3));

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveChartIndex((prev) => getNextRandomIndex(prev, 3));
    }, rotateEveryMs);
    return () => window.clearInterval(id);
  }, [rotateEveryMs]);

  const salesByDay = useMemo(() => {
    const data: Record<string, number> = {};
    for (const sale of state.sales) {
      const day = new Date(sale.date).toISOString().split('T')[0];
      data[day] = (data[day] || 0) + sale.totalPrice;
    }
    return Object.entries(data).sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime());
  }, [state.sales]);

  const topProductsByRevenue = useMemo(() => {
    const products: Record<string, { name: string; revenue: number }> = {};
    for (const sale of state.sales) {
      for (const item of sale.items) {
        const key = item.productVariantId ? `${item.productId}::${item.productVariantId}` : item.productId;
        if (!products[key]) {
          products[key] = { name: item.productName, revenue: 0 };
        }
        products[key].revenue += item.price * item.quantity;
      }
    }
    return Object.values(products)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [state.sales]);

  const stockHealth = useMemo(() => {
    return state.products
      .filter((p) => p.isActive !== false)
      .slice()
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map((p) => ({
        label: p.sku || p.name.slice(0, 12),
        quantity: p.quantity,
      }));
  }, [state.products]);

  const commonOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: isPro,
          backgroundColor: '#1e1e1e',
          titleColor: '#F5F5DC',
          bodyColor: '#F5F5DC',
          callbacks: {
            label: (context: { parsed?: { y?: number | null }; raw?: unknown }) => {
              const y = context.parsed?.y ?? context.raw ?? 0;
              return formatCurrency(Number(y));
            },
          },
        },
      },
    }),
    [isPro, formatCurrency],
  );

  const lineData = useMemo(() => {
    const labels =
      salesByDay.length > 0
        ? salesByDay.map(([day]) => new Date(day).toLocaleDateString(locale, { month: 'short', day: 'numeric' }))
        : [t('dashboard.proCharts.emptyLabel') || '—'];
    const data = salesByDay.length > 0 ? salesByDay.map(([, v]) => v) : [0];
    return {
      labels,
      datasets: [
        {
          label: t('reports.summary.revenue') || 'Revenue',
          data,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.15)',
          tension: 0.3,
          pointRadius: isPro ? 3 : 0,
          fill: true,
        },
      ],
    };
  }, [salesByDay, locale, t, isPro]);

  const doughnutData = useMemo(() => {
    const labels =
      topProductsByRevenue.length > 0
        ? topProductsByRevenue.map((p) => p.name)
        : [t('dashboard.proCharts.emptyLabel') || '—'];
    const data = topProductsByRevenue.length > 0 ? topProductsByRevenue.map((p) => p.revenue) : [1];
    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [
            'rgba(56,189,248,0.9)',
            'rgba(74,222,128,0.85)',
            'rgba(250,204,21,0.8)',
            'rgba(251,146,60,0.75)',
            'rgba(244,114,182,0.7)',
          ],
          borderColor: 'rgba(245,245,220,0.25)',
          borderWidth: 1,
        },
      ],
    };
  }, [topProductsByRevenue, t]);

  const barData = useMemo(() => {
    const labels =
      stockHealth.length > 0 ? stockHealth.map((p) => p.label) : [t('dashboard.proCharts.emptyLabel') || '—'];
    const data = stockHealth.length > 0 ? stockHealth.map((p) => p.quantity) : [0];
    return {
      labels,
      datasets: [
        {
          label: t('dashboard.totalProducts') || 'Stock',
          data,
          backgroundColor: 'rgba(74,222,128,0.45)',
          borderColor: 'rgba(74,222,128,0.6)',
          borderWidth: 1,
        },
      ],
    };
  }, [stockHealth, t]);

  const lineOptions = useMemo(
    () => ({
      ...commonOptions,
      scales: {
        x: { ticks: { color: 'rgba(245,245,220,0.6)' }, grid: { color: 'rgba(245,245,220,0.12)' } },
        y: {
          ticks: {
            color: 'rgba(245,245,220,0.6)',
            callback: (value: string | number) => formatCurrency(Number(value)),
          },
          grid: { color: 'rgba(245,245,220,0.12)' },
        },
      },
    }),
    [commonOptions, formatCurrency],
  );

  const barOptions = useMemo(
    () => ({
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        tooltip: {
          ...commonOptions.plugins.tooltip,
          callbacks: {
            label: (context: { parsed?: { y?: number }; raw?: number }) => {
              const y = context.parsed?.y ?? context.raw ?? 0;
              return String(y);
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: 'rgba(245,245,220,0.6)' }, grid: { color: 'rgba(245,245,220,0.12)' } },
        y: { ticks: { color: 'rgba(245,245,220,0.6)' }, grid: { color: 'rgba(245,245,220,0.12)' } },
      },
    }),
    [commonOptions],
  );

  const doughnutOptions = useMemo(
    () => ({
      ...commonOptions,
      plugins: { ...commonOptions.plugins, legend: { display: false } },
      cutout: '62%',
    }),
    [commonOptions],
  );

  const charts = useMemo(
    () => [
      {
        title: t('dashboard.proCharts.revenueTrendTitle'),
        render: () => <Line options={lineOptions as never} data={lineData} />,
      },
      {
        title: t('dashboard.proCharts.productMixTitle'),
        render: () => <Doughnut options={doughnutOptions as never} data={doughnutData} />,
      },
      {
        title: t('dashboard.proCharts.stockHealthTitle'),
        render: () => <Bar options={barOptions as never} data={barData} />,
      },
    ],
    [t, lineOptions, lineData, doughnutOptions, doughnutData, barOptions, barData],
  );

  return (
    <div
      className="mt-8 md:mt-12 bg-[#0d0d0d] p-4 sm:p-6 md:p-8 rounded-xl border border-[#F5F5DC]/20"
      data-testid="dashboard-live-charts"
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="w-full sm:w-auto">
          <h3 className="text-xl md:text-2xl font-bold mb-2 text-[#F5F5DC]">{t('dashboard.proCharts.title')}</h3>
          <p className="text-[#F5F5DC]/80 max-w-3xl text-sm md:text-base leading-relaxed">
            {t('dashboard.proCharts.description')}
          </p>
        </div>
        {!isPro && (
          <button
            type="button"
            onClick={onShowProFeatures}
            className="w-full sm:w-auto bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-all duration-200 active:scale-95 text-sm"
          >
            {t('dashboard.proCharts.showProCta')}
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {charts.map((chart, idx) => {
          const isActive = idx === activeChartIndex;
          const veilOpacityClass = isActive ? 'bg-[#121212]/40' : 'bg-[#121212]/75';

          return (
            <div
              key={chart.title}
              className="relative bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg p-4 h-[260px] overflow-hidden"
              data-testid={`dashboard-chart-${idx}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-[#F5F5DC]">{chart.title}</h4>
                {isActive && !isPro && (
                  <span className="text-xs font-bold text-yellow-400">{t('dashboard.proCharts.previewTag')}</span>
                )}
              </div>

              <div className="h-[200px]">{chart.render()}</div>

              {!isPro && (
                <div
                  className={`absolute inset-0 ${veilOpacityClass} flex items-end justify-start p-4 pointer-events-none`}
                >
                  <div className="text-xs font-bold text-[#F5F5DC]/90">{t('dashboard.proCharts.proOnlyNote')}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProChartsTeaserCard;
