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

const ProChartsTeaserCard: React.FC<ProChartsTeaserCardProps> = ({
  onShowProFeatures,
  rotateEveryMs = defaultRotateEveryMs,
}) => {
  const { t } = useI18n();
  const { isPro } = useSubscription();
  const [activeChartIndex, setActiveChartIndex] = useState<number>(() => Math.floor(Math.random() * 3));

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveChartIndex((prev) => getNextRandomIndex(prev, 3));
    }, rotateEveryMs);

    return () => window.clearInterval(id);
  }, [rotateEveryMs]);

  const commonOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
        },
      },
    }),
    [],
  );

  const lineData = useMemo(
    () => ({
      labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
      datasets: [
        {
          label: 'Revenue',
          data: [1200, 1800, 1400, 2200, 2600, 3100],
          borderColor: '#F5F5DC',
          backgroundColor: 'rgba(245,245,220,0.12)',
          tension: 0.35,
          pointRadius: 0,
          fill: true,
        },
      ],
    }),
    [],
  );

  const doughnutData = useMemo(
    () => ({
      labels: ['A', 'B', 'C', 'D'],
      datasets: [
        {
          data: [42, 28, 18, 12],
          backgroundColor: [
            'rgba(245,245,220,0.85)',
            'rgba(245,245,220,0.65)',
            'rgba(245,245,220,0.45)',
            'rgba(245,245,220,0.25)',
          ],
          borderColor: 'rgba(245,245,220,0.25)',
          borderWidth: 1,
        },
      ],
    }),
    [],
  );

  const barData = useMemo(
    () => ({
      labels: ['SKU-01', 'SKU-02', 'SKU-03', 'SKU-04', 'SKU-05'],
      datasets: [
        {
          label: 'Stock',
          data: [34, 12, 8, 22, 15],
          backgroundColor: 'rgba(245,245,220,0.35)',
          borderColor: 'rgba(245,245,220,0.35)',
          borderWidth: 1,
        },
      ],
    }),
    [],
  );

  const lineOptions = useMemo(
    () => ({
      ...commonOptions,
      scales: {
        x: { ticks: { color: 'rgba(245,245,220,0.6)' }, grid: { color: 'rgba(245,245,220,0.12)' } },
        y: { ticks: { color: 'rgba(245,245,220,0.6)' }, grid: { color: 'rgba(245,245,220,0.12)' } },
      },
    }),
    [commonOptions],
  );

  const barOptions = useMemo(
    () => ({
      ...commonOptions,
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
        render: () => <Line options={lineOptions} data={lineData} />,
      },
      {
        title: t('dashboard.proCharts.productMixTitle'),
        render: () => <Doughnut options={doughnutOptions as any} data={doughnutData} />,
      },
      {
        title: t('dashboard.proCharts.stockHealthTitle'),
        render: () => <Bar options={barOptions} data={barData} />,
      },
    ],
    [t, lineOptions, lineData, doughnutOptions, doughnutData, barOptions, barData],
  );

  return (
    <div className="mt-8 md:mt-12 bg-[#0d0d0d] p-4 sm:p-6 md:p-8 rounded-xl border border-[#F5F5DC]/20">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="w-full sm:w-auto">
          <h3 className="text-xl md:text-2xl font-bold mb-2 text-[#F5F5DC]">{t('dashboard.proCharts.title')}</h3>
          <p className="text-[#F5F5DC]/80 max-w-3xl text-sm md:text-base leading-relaxed">
            {t('dashboard.proCharts.description')}
          </p>
        </div>
        {/* CTA hidden when already Pro */}
        {!isPro && (
          <button
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
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-[#F5F5DC]">{chart.title}</h4>
                {/* Tag hidden when already Pro */}
                {isActive && !isPro && (
                  <span className="text-xs font-bold text-yellow-400">{t('dashboard.proCharts.previewTag')}</span>
                )}
              </div>

              <div className="h-[200px]">{chart.render()}</div>

              {!isPro && (
                <div className={`absolute inset-0 ${veilOpacityClass} flex items-end justify-start p-4`}>
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
