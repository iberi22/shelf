
import React from 'react';
import { StatCardData } from '../types';
import { useI18n } from '../context/I18nContext';

const StatCard: React.FC<StatCardData> = ({ titleKey, value, icon, change, changeType }) => {
  const { t } = useI18n();
  const changeColor = changeType === 'positive' ? 'text-green-400' : 'text-red-400';

  return (
    <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-5 rounded-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#F5F5DC]/70">{t(titleKey)}</p>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="mt-2">
        <p className="text-3xl font-bold">{value}</p>
        {change && (
          <p className={`text-xs ${changeColor} mt-1`}>
            {change}
          </p>
        )}
      </div>
    </div>
  );
};

export default StatCard;
