import type React from 'react';
import { useState } from 'react';
import { useI18n } from '../context/I18nContext';
import WelcomeModal from './WelcomeModal';

interface LandingPageProps {
  onNavigate: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
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
    <div className="bg-[#0a0a0a] text-[#F5F5DC] min-h-screen flex flex-col font-sans selection:bg-yellow-500/30 selection:text-yellow-200">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-yellow-500/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-neutral-600/20 blur-[100px]" />
      </div>

      <header className="py-5 px-6 md:px-12 flex justify-between items-center relative z-20 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <h1 className="text-xl md:text-2xl font-bold tracking-widest text-[#F5F5DC] drop-shadow-md">
          [ {t('appName')} ]
        </h1>
        <div className="flex items-center gap-4 md:gap-6">
          <button
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            className="text-sm md:text-base font-semibold text-white/70 hover:text-white transition-colors"
          >
            Saber más
          </button>
          <button
            onClick={handleStartFree}
            className="hidden sm:block text-sm font-bold bg-yellow-500 text-black px-5 py-2 rounded-full hover:bg-yellow-400 transition-transform active:scale-95 shadow-[0_0_15px_rgba(234,179,8,0.3)]"
          >
            Entrar
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="relative pt-20 pb-24 md:pt-32 md:pb-40 px-4 text-center flex flex-col items-center">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm text-xs font-semibold text-yellow-400 mb-4 animate-fade-in-up">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              Sincronización P2P Avanzada Activa
            </div>

            <h2 className="text-5xl md:text-7xl font-extrabold leading-tight tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-[#F5F5DC] to-neutral-500 drop-shadow-sm">
              Tu Inventario.
              <br />
              En Cualquier Lugar. Sin Nubes.
            </h2>

            <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto font-light">
              Administra sucursales, ventas y stock mediante una arquitectura peer-to-peer encriptada. Potencia pura de
              nivel empresarial, sin depender de servidores centrales.
            </p>

            <div className="pt-8 flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={handleStartFree}
                className="w-full sm:w-auto bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold py-3.5 px-8 rounded-xl text-lg hover:from-yellow-400 hover:to-yellow-500 transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(234,179,8,0.4)]"
              >
                {t('landing.cta')}
              </button>
              <button
                onClick={() => document.getElementById('governance')?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full sm:w-auto bg-white/5 border border-white/10 text-white font-medium py-3.5 px-8 rounded-xl text-lg hover:bg-white/10 backdrop-blur-md transition-all"
              >
                Cómo funciona
              </button>
            </div>
          </div>

          {/* App Preview Mockup */}
          <div className="mt-20 relative max-w-5xl w-full mx-auto px-4 perspective-1000">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 transform rotate-x-12 hover:rotate-x-0 transition-transform duration-700 ease-out">
              <div className="absolute inset-0 bg-gradient-to-tr from-yellow-500/10 to-transparent pointer-events-none" />
              <img
                src="/inventory-mockup.png"
                alt="Shelf Dashboard Preview"
                className="w-full h-auto object-cover opacity-90 rounded-2xl"
              />
            </div>
          </div>
        </section>

        {/* Features Section (Glassmorphism + Grayscale) */}
        <section id="features" className="py-24 relative">
          <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-3xl border-t border-b border-white/5" />
          <div className="container relative mx-auto px-6 max-w-7xl">
            <div className="text-center mb-16">
              <h3 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
                Características Core
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature) => (
                <div
                  key={feature.titleKey}
                  className="group relative p-8 rounded-2xl bg-gradient-to-br from-neutral-800/40 to-neutral-900/40 backdrop-blur-md border border-white/5 hover:border-yellow-500/30 transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="absolute top-0 left-0 w-full h-full bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
                  <div className="text-5xl mb-6 filter drop-shadow-md">{feature.icon}</div>
                  <h4 className="text-xl font-bold mb-3 text-white">{t(feature.titleKey)}</h4>
                  <p className="text-neutral-400 font-light leading-relaxed">{t(feature.descriptionKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Governance / Multi-Branch Section */}
        <section id="governance" className="py-24 md:py-32 relative overflow-hidden">
          <div className="container mx-auto px-6 max-w-6xl">
            <div className="flex flex-col lg:flex-row gap-16 items-center">
              <div className="flex-1 space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-xs font-semibold text-neutral-300">
                  <span className="text-yellow-400">⚡</span> Novedad: Red Multibodega
                </div>

                <h3 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
                  {t('landing.governance.title')} <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
                    {t('landing.governance.highlight')}
                  </span>
                </h3>

                <p className="text-lg text-neutral-400 font-light leading-relaxed">
                  {t('landing.governance.description')}
                </p>

                <a
                  href="https://github.com/iberi22/shelf/tree/main/apps/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm font-semibold text-yellow-300 transition-colors hover:bg-yellow-500/15 hover:text-yellow-200"
                >
                  {t('landing.governance.learnMore')}
                </a>

                <ul className="space-y-4">
                  {(Array.isArray(t('landing.governance.points', { returnObjects: true })) 
                    ? (t('landing.governance.points', { returnObjects: true }) as string[]) 
                    : []).map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/50">
                        <svg
                          className="w-3 h-3 text-yellow-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-neutral-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex-1 relative w-full aspect-square max-w-md">
                {/* Abstract graphic representing nodes syncing */}
                <div className="absolute inset-0 bg-gradient-to-tr from-neutral-800 to-neutral-900 rounded-full border border-white/5 opacity-50 shadow-2xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl" />

                <div className="absolute top-[20%] left-[20%] w-16 h-16 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-2xl shadow-lg transform -rotate-12 animate-pulse">
                  🏪
                </div>
                <div className="absolute bottom-[20%] left-[10%] w-20 h-20 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-3xl shadow-lg transform rotate-6">
                  📦
                </div>
                <div className="absolute top-[30%] right-[10%] w-24 h-24 bg-gradient-to-br from-yellow-500/20 to-neutral-800/80 backdrop-blur-xl border border-yellow-500/30 rounded-2xl flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(234,179,8,0.15)] transform rotate-12">
                  👑
                </div>
                <div className="absolute bottom-[25%] right-[25%] w-16 h-16 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-2xl shadow-lg transform -rotate-6">
                  🛒
                </div>

                {/* Connecting lines SVG */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ opacity: 0.3 }}
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M 120 120 L 250 180"
                    stroke="#EAB308"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="animate-[dash_2s_linear_infinite]"
                  />
                  <path
                    d="M 250 180 L 100 300"
                    stroke="#EAB308"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="animate-[dash_2s_linear_infinite]"
                  />
                  <path
                    d="M 250 180 L 300 280"
                    stroke="#EAB308"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="animate-[dash_2s_linear_infinite]"
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-10 text-center text-sm text-neutral-500 border-t border-white/5 bg-black/40 backdrop-blur-md relative z-20">
        <p>
          &copy; {new Date().getFullYear()} {t('appName')} {t('landing.footer')}
        </p>
        <a
          href="https://github.com/iberi22"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-neutral-600 hover:text-white transition-colors"
        >
          github.com/iberi22
        </a>
      </footer>

      {/* Welcome Modal */}
      <WelcomeModal isOpen={showWelcomeModal} onClose={handleWelcomeClose} />

      {/* Inline styles for custom animations */}
      <style>{`
        .rotate-x-12 {
          transform: perspective(1000px) rotateX(12deg);
        }
        .hover\\:rotate-x-0:hover {
          transform: perspective(1000px) rotateX(0deg);
        }
        @keyframes dash {
          to {
            stroke-dashoffset: -8;
          }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
