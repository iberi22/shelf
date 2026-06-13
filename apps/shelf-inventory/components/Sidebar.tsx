import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { NAV_ITEMS } from '../constants';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import GlobalSearch from './GlobalSearch';
import LanguageSelector from './LanguageSelector';

interface SidebarProps {
  activeComponent: string;
  setActiveComponent: (component: string) => void;
  onLoginClick: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeComponent, setActiveComponent, onLoginClick }) => {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const { isPro } = useSubscription();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { state } = useAppContext();

  const filteredNavItems = NAV_ITEMS.filter((item) => {
    const p = state.permissions;
    if (!p || state.role === 'admin') return true;
    if (item.nameKey === 'nav.summary' && p.canViewDashboard === false) return false;
    if (item.nameKey === 'nav.inventory' && p.canViewProducts === false) return false;
    if (item.nameKey === 'nav.sales' && p.canViewSales === false) return false;
    if (item.nameKey === 'nav.purchases' && p.canViewPurchaseOrders === false) return false;
    if (item.nameKey === 'nav.clients' && p.canViewClients === false) return false;
    if (item.nameKey === 'nav.suppliers' && p.canViewSuppliers === false) return false;
    if (item.nameKey === 'nav.reports' && p.canViewReports === false) return false;
    if (item.nameKey === 'nav.arqueo' && p.canViewArqueo === false) return false;
    return true;
  });

  // Close drawer when a nav item is clicked
  const [searchOpen, setSearchOpen] = useState(false);

  // Global keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavClick = (nameKey: string) => {
    setActiveComponent(nameKey);
    setMobileMenuOpen(false);
  };

  // Close drawer on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 bg-primary border border-foreground/20 rounded-lg p-2.5 shadow-lg active:scale-95"
        aria-label="Abrir menú"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        ref={drawerRef}
        className={`md:hidden fixed top-0 left-0 z-30 h-full w-72 bg-primary border-r border-foreground/20 shadow-2xl transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-foreground/20">
          <h1 className="text-xl font-bold tracking-widest">[ Shelf. ]</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 text-foreground/60 hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors active:scale-95"
              aria-label="Buscar"
              title="Buscar (Ctrl+K)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="text-2xl text-foreground/70 hover:text-foreground active:scale-95"
              aria-label="Cerrar menú"
            >
              ✕
            </button>
          </div>
        </div>
        <nav className="flex-1 px-3 py-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          <ul>
            {filteredNavItems.map((item) => (
              <li key={item.nameKey}>
                <button
                  data-testid={`nav-item-${item.nameKey}`}
                  onClick={() => handleNavClick(item.nameKey)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 my-1 rounded-lg transition-all duration-200 ease-in-out active:scale-95 transform min-h-[44px] ${
                    activeComponent === item.nameKey
                      ? 'bg-foreground text-background font-bold'
                      : 'hover:bg-foreground/10 hover:translate-x-1'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span>{t(item.nameKey)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-foreground/20 space-y-3 bg-primary">
          <div className="flex justify-center">
            <LanguageSelector />
          </div>
          {user ? (
            <div className="text-center px-2">
              <p className="text-sm text-foreground/70 truncate">{user.email}</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <div
                  className={`w-2 h-2 rounded-full ${isPro ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-yellow-500'}`}
                />
                <p className="text-[10px] uppercase tracking-wider font-bold opacity-60">
                  {isPro ? t('sync.cloudSynced') : t('sync.localOnly')}
                </p>
              </div>
              <button
                data-testid="logout-button"
                onClick={logout}
                className="w-full mt-2 bg-transparent border border-red-500/50 text-red-400 text-sm font-bold py-2.5 px-4 rounded-lg hover:bg-red-500/10 transition-colors active:scale-95 min-h-[44px]"
              >
                {t('auth.logout')}
              </button>
            </div>
          ) : (
            <button
              data-testid="login-button"
              onClick={onLoginClick}
              className="w-full bg-foreground text-background font-bold py-2.5 px-4 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95 min-h-[44px]"
            >
              {t('auth.login')}
            </button>
          )}
          <div className="text-center text-[10px] text-foreground/40 font-mono mt-2">
            v{__APP_VERSION__} • {__COMMIT_HASH__}
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-primary border-r border-foreground/20">
        <div className="p-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-widest">[ Shelf. ]</h1>
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 text-foreground/60 hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors active:scale-95"
            aria-label="Buscar"
            title="Buscar (Ctrl+K)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 px-4 py-2">
          <ul>
            {filteredNavItems.map((item) => (
              <li key={item.nameKey}>
                <button
                  data-testid={`nav-item-${item.nameKey}`}
                  onClick={() => setActiveComponent(item.nameKey)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 my-1 rounded-lg transition-all duration-200 ease-in-out active:scale-95 transform ${
                    activeComponent === item.nameKey
                      ? 'bg-foreground text-background font-bold'
                      : 'hover:bg-foreground/10 hover:translate-x-1'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span>{t(item.nameKey)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-foreground/20 space-y-4">
          <div className="flex justify-center">
            <LanguageSelector />
          </div>
          {user ? (
            <div className="text-center px-2">
              <p className="text-sm text-foreground/70 truncate">{user.email}</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <div
                  className={`w-2 h-2 rounded-full ${isPro ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-yellow-500'}`}
                />
                <p className="text-[10px] uppercase tracking-wider font-bold opacity-60">
                  {isPro ? t('sync.cloudSynced') : t('sync.localOnly')}
                </p>
              </div>
              <button
                data-testid="logout-button"
                onClick={logout}
                className="w-full mt-2 bg-transparent border border-red-500/50 text-red-400 text-sm font-bold py-2 px-4 rounded-lg hover:bg-red-500/10 transition-colors active:scale-95"
              >
                {t('auth.logout')}
              </button>
            </div>
          ) : (
            <button
              data-testid="login-button"
              onClick={onLoginClick}
              className="w-full bg-foreground text-background font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95"
            >
              {t('auth.login')}
            </button>
          )}
          <div className="text-center text-[10px] text-foreground/40 font-mono mt-2">
            v{__APP_VERSION__} • {__COMMIT_HASH__}
          </div>
        </div>
      </aside>

      {/* Global Search Modal */}
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={setActiveComponent}
      />
    </>
  );
};

export const MobileBottomNav: React.FC<{ activeComponent: string; setActiveComponent: (name: string) => void }> = ({
  activeComponent,
  setActiveComponent,
}) => {
  const { t } = useI18n();
  const { state } = useAppContext();

  const filteredNavItems = NAV_ITEMS.filter((item) => {
    const p = state.permissions;
    if (!p || state.role === 'admin') return true;
    if (item.nameKey === 'nav.summary' && p.canViewDashboard === false) return false;
    if (item.nameKey === 'nav.inventory' && p.canViewProducts === false) return false;
    if (item.nameKey === 'nav.sales' && p.canViewSales === false) return false;
    if (item.nameKey === 'nav.purchases' && p.canViewPurchaseOrders === false) return false;
    if (item.nameKey === 'nav.clients' && p.canViewClients === false) return false;
    if (item.nameKey === 'nav.suppliers' && p.canViewSuppliers === false) return false;
    if (item.nameKey === 'nav.reports' && p.canViewReports === false) return false;
    if (item.nameKey === 'nav.arqueo' && p.canViewArqueo === false) return false;
    return true;
  });

  // Only show the main items on mobile for space
  const mobileNavItems = filteredNavItems.filter((item) =>
    ['nav.summary', 'nav.inventory', 'nav.sales', 'nav.settings'].includes(item.nameKey),
  );

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-primary border-t border-foreground/20 flex justify-around items-stretch z-20 safe-area-bottom">
      {mobileNavItems.map((item) => (
        <button
          key={item.nameKey}
          data-testid={`mobile-nav-item-${item.nameKey}`}
          onClick={() => setActiveComponent(item.nameKey)}
          className={`flex flex-col items-center justify-center gap-0.5 px-1 rounded-md text-[10px] flex-1 min-h-[56px] transition-all duration-150 active:scale-95 ${
            activeComponent === item.nameKey ? 'text-foreground' : 'text-foreground/60'
          }`}
        >
          <span className="text-2xl">{item.icon}</span>
          <span className={`leading-tight ${activeComponent === item.nameKey ? 'font-bold' : ''}`}>
            {t(item.nameKey).split(' ')[0]}
          </span>
        </button>
      ))}
    </nav>
  );
};

export default Sidebar;
