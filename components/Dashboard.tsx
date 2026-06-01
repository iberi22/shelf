import type React from 'react';
import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useCurrency } from '../context/CurrencyContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import useLocalStorage from '../hooks/useLocalStorage';
import ProChartsTeaserCard from './ProChartsTeaserCard';
import ProFeatureCard from './ProFeatureCard';
import StatCard from './StatCard';

const Dashboard: React.FC = () => {
  const { state } = useAppContext();
  const { t } = useI18n();
  const { formatCurrency } = useCurrency();
  const { isPro } = useSubscription();
  const [isEditing, setIsEditing] = useState(false);
  const [isProSectionHidden, setIsProSectionHidden] = useState(false);

  // Define all possible stat cards with their key and how to calculate their value
  const allStatsDefinitions = useMemo(
    () => [
      {
        titleKey: 'dashboard.totalRevenue',
        icon: '💰',
        getValue: () => formatCurrency(state.sales.reduce((acc, sale) => acc + sale.totalPrice, 0)),
      },
      {
        titleKey: 'dashboard.totalProfit',
        icon: '💹',
        getValue: () => formatCurrency(state.sales.reduce((acc, sale) => acc + sale.profit, 0)),
      },
      {
        titleKey: 'dashboard.totalSales',
        icon: '🛒',
        getValue: () => state.sales.length.toString(),
      },
      {
        titleKey: 'dashboard.totalProducts',
        icon: '📦',
        getValue: () => state.products.reduce((acc, product) => acc + product.quantity, 0).toString(),
      },
    ],
    [state.sales, state.products, formatCurrency],
  );

  const [cardVisibility, setCardVisibility] = useLocalStorage(
    'dashboardCardVisibility',
    allStatsDefinitions.reduce((acc, stat) => ({ ...acc, [stat.titleKey]: true }), {} as Record<string, boolean>),
  );

  const handleVisibilityChange = (titleKey: string) => {
    // FIX: Replaced out-of-scope variable `stat` with the function parameter `titleKey`.
    setCardVisibility((prev) => ({ ...prev, [titleKey]: !prev[titleKey] }));
  };

  const statsToDisplay = useMemo(() => {
    return isEditing ? allStatsDefinitions : allStatsDefinitions.filter((stat) => cardVisibility[stat.titleKey]);
  }, [isEditing, allStatsDefinitions, cardVisibility]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5DC]">{t('dashboard.title')}</h2>
        <button
          data-testid="dashboard-customize-button"
          onClick={() => setIsEditing(!isEditing)}
          className="w-full sm:w-auto bg-transparent border border-[#F5F5DC]/50 font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-[#F5F5DC]/10 transition-all duration-200 active:scale-95 text-sm"
        >
          {isEditing ? t('common.done') : t('dashboard.customize')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {statsToDisplay.map((stat) => (
          <div
            key={stat.titleKey}
            data-testid={`stat-card-${stat.titleKey}`}
            className={`relative transition-opacity duration-300 ${isEditing && !cardVisibility[stat.titleKey] ? 'opacity-40 hover:opacity-100' : 'opacity-100'}`}
          >
            {isEditing && (
              <div className="absolute top-2 right-2 z-10 p-1 bg-background/50 rounded-full">
                <input
                  type="checkbox"
                  data-testid={`stat-card-toggle-${stat.titleKey}`}
                  title={t('dashboard.toggleVisibility')}
                  checked={!!cardVisibility[stat.titleKey]}
                  onChange={() => handleVisibilityChange(stat.titleKey)}
                  className="h-5 w-5 cursor-pointer appearance-none rounded-full border-2 border-foreground/50 checked:bg-yellow-400 checked:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-background"
                />
              </div>
            )}
            <StatCard titleKey={stat.titleKey} value={stat.getValue()} icon={stat.icon} />
          </div>
        ))}
        {/* Message when no cards are visible */}
        {!isEditing && statsToDisplay.length === 0 && (
          <div
            className="col-span-full text-center p-8 bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg flex flex-col items-center gap-4"
            data-testid="no-stats-visible-message"
          >
            <p className="text-[#F5F5DC]/80">{t('dashboard.noCardsVisible')}</p>
            <button
              onClick={() => setIsEditing(true)}
              className="bg-[#F5F5DC] text-[#121212] font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-opacity-80 transition-all duration-200 active:scale-95 text-sm"
            >
              {t('dashboard.customize')}
            </button>
          </div>
        )}
      </div>

      {isPro && (
        <div className="mt-8">
          <ProChartsTeaserCard onShowProFeatures={() => {}} />
        </div>
      )}

      {!isPro &&
        (isProSectionHidden ? (
          <ProChartsTeaserCard onShowProFeatures={() => setIsProSectionHidden(false)} />
        ) : (
          <div className="mt-8 md:mt-12 bg-[#0d0d0d] p-4 sm:p-6 md:p-8 rounded-xl border border-[#F5F5DC]/20">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
              <div className="w-full sm:w-auto">
                <h3 className="text-2xl md:text-3xl font-bold mb-3 text-[#F5F5DC]">
                  {t('dashboard.proFeaturesTitle')}
                </h3>
                <p className="text-[#F5F5DC]/80 mb-6 md:mb-8 max-w-3xl text-sm md:text-base leading-relaxed">
                  {t('dashboard.proFeaturesDescription')}
                </p>
              </div>
              <button
                onClick={() => setIsProSectionHidden(true)}
                className="w-full sm:w-auto bg-transparent border border-[#F5F5DC]/50 font-bold py-2.5 px-4 rounded-lg min-h-[44px] hover:bg-[#F5F5DC]/10 transition-all duration-200 active:scale-95 text-sm"
              >
                {t('dashboard.hideProSection')}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              <ProFeatureCard
                icon="🤖"
                titleKey="reports.aiAssistantTitle"
                descriptionKey="dashboard.pro.aiDescription"
              />
              <ProFeatureCard
                icon="☁️"
                titleKey="dashboard.pro.cloudSyncTitle"
                descriptionKey="dashboard.pro.cloudSyncDescription"
              />
              <ProFeatureCard
                icon="🚫"
                titleKey="dashboard.pro.noAdsTitle"
                descriptionKey="dashboard.pro.noAdsDescription"
              />
            </div>
          </div>
        ))}
    </div>
  );
};

export default Dashboard;
