import type React from 'react';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useUI } from '../context/UIContext';

interface ProFeatureCardProps {
  icon: string;
  titleKey: string;
  descriptionKey: string;
}

const ProFeatureCard: React.FC<ProFeatureCardProps> = ({ icon, titleKey, descriptionKey }) => {
  const { t } = useI18n();
  const { isPro } = useSubscription();
  const { openSubscriptionModal } = useUI();

  return (
    <div className="bg-[#1a1a1a] border-2 border-[#F5F5DC]/30 p-6 rounded-lg flex flex-col items-start h-full shadow-lg hover:border-yellow-400/50 transition-all">
      <div className="flex items-center mb-4">
        <span className="text-4xl mr-3">{icon}</span>
        <h4 className="text-xl font-bold text-[#F5F5DC]">{t(titleKey)}</h4>
      </div>
      <p className="text-base text-[#F5F5DC]/90 flex-grow mb-5 leading-relaxed">{t(descriptionKey)}</p>
      {!isPro && (
        <button
          onClick={openSubscriptionModal}
          className="w-full mt-auto text-sm font-bold text-[#121212] bg-yellow-400 px-5 py-3 rounded-lg hover:bg-yellow-300 transition-all active:scale-95 shadow-md"
        >
          {t('learnMore')}
        </button>
      )}
    </div>
  );
};

export default ProFeatureCard;
