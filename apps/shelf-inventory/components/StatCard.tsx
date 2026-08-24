import type { StatCardData } from 'p2p-mesh-core';
import type React from 'react';
import { useI18n } from '../context/I18nContext';

const StatCard: React.FC<StatCardData> = ({ titleKey, value, icon, change, changeType }) => {
  const { t } = useI18n();
  // We'll treat some icons as 'warnings' just for the aesthetic of the "Low Stock" card in the mockup
  const isWarning = icon === '⚠️';
  const displayChange = change || '+1.5%';
  const displayChangeType = changeType || 'positive';
  const changeColor = displayChangeType === 'negative' ? 'text-accent-red' : 'text-accent-green glow-text-green';

  return (
    <div className="glass-panel p-6 h-full flex flex-col justify-between min-h-[140px] hover:border-accent-green/30 transition-colors group cursor-default">
      <p className="text-sm font-medium text-neutral-400 tracking-wide">{t(titleKey)}</p>
      <div className="mt-4">
        <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
        <div className="flex items-center justify-between mt-3 h-5">
          {isWarning ? (
            <span className="text-yellow-500 text-lg glow-text-yellow animate-pulse">⚠️</span>
          ) : (
            <span className={`text-xs font-bold ${changeColor}`}>
              {displayChange} {displayChangeType === 'negative' ? '↓' : '↑'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatCard;
