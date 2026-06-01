import type React from 'react';
import { useState } from 'react';
import { useI18n } from '../context/I18nContext';
import LanguageSelector from './LanguageSelector';
import WelcomeModal from './WelcomeModal';

interface LandingPageProps {
  onNavigate: () => void;
  onLoginClick: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onLoginClick }) => {
  const { t } = useI18n();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  const handleStartFree = () => {
    // Check if user has seen the welcome message before
    const hasSeenWelcome = localStorage.getItem('shelfWelcomeSeen') === 'true';

    if (!hasSeenWelcome) {
      setShowWelcomeModal(true);
    } else {
      onNavigate();
    }
  };

  const handleWelcomeClose = () => {
    setShowWelcomeModal(false);
    onNavigate();
  };

  const features = [
    { icon: '📦', titleKey: 'landing.feature1.title', descriptionKey: 'landing.feature1.description' },
    { icon: '🛒', titleKey: 'landing.feature2.title', descriptionKey: 'landing.feature2.description' },
    { icon: '📈', titleKey: 'landing.feature3.title', descriptionKey: 'landing.feature3.description' },
    { icon: '☁️', titleKey: 'landing.feature4.title', descriptionKey: 'landing.feature4.description' },
  ];

  return (
    <div className="bg-background text-foreground min-h-screen flex flex-col">
      <header className="py-4 px-4 md:px-12 flex justify-between items-center relative z-10">
        <h1 className="text-xl md:text-2xl font-bold tracking-widest">[ {t('appName')} ]</h1>
        <div className="flex items-center gap-3 md:gap-4">
          <LanguageSelector />
          <button
            onClick={onLoginClick}
            className="font-semibold hover:text-yellow-300 transition-all active:scale-95 text-sm md:text-base"
          >
            {t('auth.login')}
          </button>
        </div>
      </header>

      <main className="relative flex-1 flex flex-col items-center justify-center text-center p-6 pt-16 sm:pt-4">
        <div className="max-w-3xl">
          <div className="text-6xl mb-4" aria-label="Card file box icon">
            🗂️
          </div>
          <h2 className="text-4xl md:text-6xl font-extrabold leading-tight break-words">{t('appName')}</h2>
          <p className="mt-6 text-lg md:text-xl text-foreground/80">{t('landing.title')}</p>
          <p className="mt-4 text-md md:text-lg text-[#F5F5DC]/80 max-w-xl mx-auto">{t('landing.subtitle')}</p>
          <button
            onClick={handleStartFree}
            className="mt-10 bg-foreground text-background font-bold py-3 px-8 rounded-lg text-lg hover:bg-opacity-80 transition-all transform hover:scale-105 active:scale-95"
          >
            {t('landing.cta')}
          </button>
        </div>
      </main>

      <section id="features" className="py-12 md:py-24 bg-primary border-t border-foreground/20">
        <div className="container mx-auto px-4 md:px-6">
          <h3 className="text-2xl md:text-3xl font-bold text-center mb-8 md:mb-12 text-[#F5F5DC]">
            {t('landing.featuresTitle')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
            {features.map((feature) => (
              <div
                key={feature.titleKey}
                className="text-center p-4 md:p-6 bg-background rounded-lg border border-foreground/10"
              >
                <div className="text-4xl md:text-5xl mb-3 md:mb-4">{feature.icon}</div>
                <h4 className="text-lg md:text-xl font-bold mb-2 text-[#F5F5DC]">{t(feature.titleKey)}</h4>
                <p className="text-sm md:text-base text-[#F5F5DC]/80">{t(feature.descriptionKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-sm text-foreground/60 border-t border-foreground/10">
        <p>
          &copy; {new Date().getFullYear()} {t('appName')} {t('landing.footer')}
        </p>
      </footer>

      {/* Welcome Modal */}
      <WelcomeModal isOpen={showWelcomeModal} onClose={handleWelcomeClose} />
    </div>
  );
};

export default LandingPage;
