import type React from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useUI } from '../context/UIContext';
import Modal from './Modal';

const SubscriptionModal: React.FC = () => {
  const { t } = useI18n();
  const { isSubscriptionModalOpen, closeSubscriptionModal, showLoading, hideLoading, showNotification } = useUI();
  const { tier } = useSubscription();
  const { user, getIdToken } = useAuth();

  if (!isSubscriptionModalOpen) {
    return null;
  }

  const proFeatures: string[] = t('subscription.pro.features', { returnObjects: true });
  const pymeFeatures: string[] = t('subscription.pyme.features', { returnObjects: true });

  const handleSelectPlan = async (planId: 'pro' | 'pyme') => {
    if (!user) {
      showNotification(t('subscription.loginRequired'), 'info');
      return;
    }
    showLoading(t('subscription.redirecting'));
    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication error. Please log in again.');
      }

      // This would be your production Cloud Function URL
      const response = await fetch('/api/createCheckoutSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId,
          returnUrl: window.location.href, // Redirect back here after payment
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session.');
      }

      const { url } = await response.json();
      // Redirect to Stripe checkout
      window.location.href = url;
    } catch (error) {
      console.error('Payment initiation failed:', error);
      showNotification(error instanceof Error ? error.message : t('subscription.paymentError'), 'error');
      hideLoading();
    }
  };

  return (
    <Modal isOpen={isSubscriptionModalOpen} onClose={closeSubscriptionModal} title={t('subscription.title')}>
      <div className="space-y-6">
        <p className="text-center text-sm md:text-base text-foreground/80">{t('subscription.description')}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Pro Plan */}
          <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg flex flex-col">
            <h3 className="text-xl md:text-2xl font-bold text-yellow-400">{t('subscription.pro.title')}</h3>
            <p className="text-xs md:text-sm text-[#F5F5DC]/80 mb-4">{t('subscription.pro.description')}</p>
            <p className="text-4xl font-bold my-4">
              {t('subscription.pro.price')}
              <span className="text-base font-normal text-[#F5F5DC]/70">/{t('subscription.month')}</span>
            </p>
            <ul className="space-y-2 text-sm flex-grow">
              {proFeatures.map((featureKey) => (
                <li key={featureKey} className="flex items-center gap-3">
                  <span className="text-green-400">✓</span>
                  <span>{t(featureKey)}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSelectPlan('pro')}
              disabled={tier === 'pro' || tier === 'pyme'}
              className="w-full mt-6 bg-yellow-400 text-background font-bold py-2 px-4 rounded-lg hover:bg-yellow-300 transition-all active:scale-95 disabled:bg-opacity-50 disabled:cursor-not-allowed"
            >
              {tier === 'pro' || tier === 'pyme' ? t('subscription.currentPlan') : t('subscription.selectPlan')}
            </button>
          </div>

          {/* Pyme Plan */}
          <div className="bg-[#1a1a1a] border-2 border-sky-400 p-4 md:p-6 rounded-lg flex flex-col relative">
            <div className="absolute top-0 right-2 md:right-4 -mt-3 bg-sky-400 text-background text-xs font-bold px-2 py-1 rounded-full">
              {t('subscription.pyme.popular')}
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-sky-400">{t('subscription.pyme.title')}</h3>
            <p className="text-xs md:text-sm text-[#F5F5DC]/80 mb-4">{t('subscription.pyme.description')}</p>
            <p className="text-4xl font-bold my-4">
              {t('subscription.pyme.price')}
              <span className="text-base font-normal text-[#F5F5DC]/70">/{t('subscription.month')}</span>
            </p>
            <ul className="space-y-2 text-sm flex-grow">
              {pymeFeatures.map((featureKey) => (
                <li key={featureKey} className="flex items-center gap-3">
                  <span className="text-green-400">✓</span>
                  <span>{t(featureKey)}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSelectPlan('pyme')}
              disabled={tier === 'pyme'}
              className="w-full mt-6 bg-sky-400 text-background font-bold py-2 px-4 rounded-lg hover:bg-sky-300 transition-all active:scale-95 disabled:bg-opacity-50 disabled:cursor-not-allowed"
            >
              {tier === 'pyme' ? t('subscription.currentPlan') : t('subscription.selectPlan')}
            </button>
          </div>
        </div>

        <p className="text-xs text-center text-[#F5F5DC]/70">{t('subscription.cancelAnytime')}</p>
      </div>
    </Modal>
  );
};

export default SubscriptionModal;
