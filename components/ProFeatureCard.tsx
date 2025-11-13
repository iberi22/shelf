import type React from 'react';
import { useI18n } from '../context/I18nContext';
import { useUI } from '../context/UIContext';

interface ProFeatureCardProps {
  icon: string;
  titleKey: string;
  descriptionKey: string;
}

const ProFeatureCard: React.FC<ProFeatureCardProps> = ({ icon, titleKey, descriptionKey }) => {
  const { t } = useI18n();
  const { openSubscriptionModal } = useUI();

  return (
    <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 p-5 rounded-lg flex flex-col items-start h-full">
      <div className="flex items-center mb-3">
        <span className="text-3xl mr-3">{icon}</span>
        <h4 className="text-lg font-bold text-[#F5F5DC]">{t(titleKey)}</h4>
      </div>
      <p className="text-sm text-[#F5F5DC]/70 flex-grow mb-4">{t(descriptionKey)}</p>
      <button
        onClick={openSubscriptionModal}
        className="mt-auto text-sm font-semibold text-[#121212] bg-yellow-400 px-4 py-2 rounded-lg hover:bg-yellow-300 transition-all active:scale-95"
      >
        {t('learnMore')}
      </button>
    </div>
  );
};

export default ProFeatureCard;
