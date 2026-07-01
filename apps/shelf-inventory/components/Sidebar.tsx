import { Building2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { NAV_ITEMS } from '../constants';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import GlobalSearch from './GlobalSearch';

const NavIcon = ({ nameKey, className = 'w-5 h-5' }: { nameKey: string; className?: string }) => {
  switch (nameKey) {
    case 'nav.summary':
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 14a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 14a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      );
    case 'nav.inventory':
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      );
    case 'nav.sales':
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      );
    case 'nav.clients':
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      );
    case 'nav.suppliers':
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
        </svg>
      );
    case 'nav.purchases':
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      );
    case 'nav.catalog':
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      );
    case 'nav.arqueo':
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      );
    case 'nav.reports':
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      );
    case 'nav.settings':
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
  }
};

interface SidebarProps {
  activeComponent: string;
  setActiveComponent: (component: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeComponent, setActiveComponent }) => {
  const { t } = useI18n();
  const { isPro } = useSubscription();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useAppContext();

  const activeBranches = state.branches.filter((b) => b.isActive);

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
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-widest text-[#F5F5DC]">[ Shelf. ]</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 text-foreground/60 hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors active:scale-95"
              aria-label="Buscar"
              title="Buscar (Ctrl+K)"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
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

        {/* Branch Selector (Mobile) */}
        {activeBranches.length > 0 && (
          <div className="px-6 py-4 border-b border-foreground/10">
            <label className="text-[10px] uppercase tracking-wider text-foreground/40 font-bold mb-2 block">
              Sucursal Activa
            </label>
            <div className="relative">
              <select
                value={state.activeBranchId || 'global'}
                onChange={(e) =>
                  dispatch({ type: 'SET_ACTIVE_BRANCH', payload: e.target.value === 'global' ? null : e.target.value })
                }
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl py-2.5 px-3 pl-10 text-sm text-[#F5F5DC] appearance-none focus:outline-none focus:ring-1 focus:ring-[#4ADE80]/50"
                data-testid="mobile-branch-selector"
              >
                <option value="global">🌍 Global / Principal</option>
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    📍 {branch.name}
                  </option>
                ))}
              </select>
              <Building2 className="absolute left-3 top-3 h-4 w-4 text-foreground/40" />
            </div>
          </div>
        )}

        <nav className="flex-1 px-3 py-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          <ul>
            {filteredNavItems.map((item) => (
              <li key={item.nameKey}>
                <button
                  data-testid={`nav-item-${item.nameKey}`}
                  onClick={() => handleNavClick(item.nameKey)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 my-1 rounded-xl transition-all duration-300 ease-in-out active:scale-95 transform min-h-[44px] ${
                    activeComponent === item.nameKey
                      ? 'bg-[#1A251A] text-[#4ADE80] font-bold border border-[#4ADE80]/30 glow-text-green shadow-[0_0_15px_rgba(74,222,128,0.1)]'
                      : 'text-neutral-400 hover:bg-white/5 hover:text-white hover:translate-x-1'
                  }`}
                >
                  <NavIcon nameKey={item.nameKey} className="w-5 h-5 flex-shrink-0" />
                  <span>{t(item.nameKey)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-foreground/20 space-y-3 bg-primary">
          <div className="flex items-center justify-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${isPro ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-yellow-500'}`}
            />
            <p className="text-[10px] uppercase tracking-wider font-bold opacity-60">
              {isPro ? t('sync.cloudSynced') : t('sync.localOnly')}
            </p>
          </div>
          <div className="text-center text-[10px] text-foreground/40 font-mono mt-2">
            v{__APP_VERSION__} • {__COMMIT_HASH__}
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[260px] bg-[#0A0A0A] border-r border-white/5 relative z-10">
        <div className="p-6 flex items-center justify-between mb-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-widest text-white">[ Shelf. ]</h1>
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 text-foreground/60 hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors active:scale-95"
            aria-label="Buscar"
            title="Buscar (Ctrl+K)"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
        </div>

        {/* Branch Selector (Desktop) */}
        {activeBranches.length > 0 && (
          <div className="px-6 mb-6">
            <label className="text-[10px] uppercase tracking-wider text-foreground/40 font-bold mb-2 block">
              Sucursal Activa
            </label>
            <div className="relative">
              <select
                value={state.activeBranchId || 'global'}
                onChange={(e) =>
                  dispatch({ type: 'SET_ACTIVE_BRANCH', payload: e.target.value === 'global' ? null : e.target.value })
                }
                className="w-full bg-[#141414] border border-white/10 rounded-xl py-2.5 px-4 pl-10 text-sm text-[#F5F5DC] appearance-none focus:outline-none focus:ring-1 focus:ring-[#4ADE80]/50 transition-all hover:bg-[#1A1A1A] cursor-pointer"
                data-testid="host-branch-selector"
              >
                <option value="global">🌍 Global / Principal</option>
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    📍 {branch.name}
                  </option>
                ))}
              </select>
              <Building2 className="absolute left-3.5 top-3 h-4 w-4 text-foreground/40 pointer-events-none" />
            </div>
          </div>
        )}

        <nav className="flex-1 px-4 py-2">
          <ul>
            {filteredNavItems.map((item) => (
              <li key={item.nameKey}>
                <button
                  data-testid={`nav-item-${item.nameKey}`}
                  onClick={() => setActiveComponent(item.nameKey)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 my-1 rounded-xl transition-all duration-300 ease-in-out active:scale-95 transform min-h-[44px] ${
                    activeComponent === item.nameKey
                      ? 'bg-[#1A251A] text-[#4ADE80] font-bold border border-[#4ADE80]/30 glow-text-green shadow-[0_0_15px_rgba(74,222,128,0.1)]'
                      : 'text-neutral-400 hover:bg-white/5 hover:text-white hover:translate-x-1'
                  }`}
                >
                  <NavIcon nameKey={item.nameKey} className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{t(item.nameKey)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-foreground/20 space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${isPro ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-yellow-500'}`}
            />
            <p className="text-[10px] uppercase tracking-wider font-bold opacity-60">
              {isPro ? t('sync.cloudSynced') : t('sync.localOnly')}
            </p>
          </div>
          <div className="text-center text-[10px] text-foreground/40 font-mono mt-2">
            v{__APP_VERSION__} • {__COMMIT_HASH__}
          </div>
        </div>
      </aside>

      {/* Global Search Modal */}
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={setActiveComponent} />
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
          className={`flex flex-col items-center justify-center gap-1 px-1 py-1 rounded-md text-[10px] flex-1 min-h-[56px] transition-all duration-300 active:scale-95 ${
            activeComponent === item.nameKey
              ? 'text-[#4ADE80] glow-text-green bg-[#1A251A] border-t-2 border-[#4ADE80]'
              : 'text-neutral-500 border-t-2 border-transparent'
          }`}
        >
          <NavIcon nameKey={item.nameKey} className="w-5 h-5" />
          <span className={`leading-tight ${activeComponent === item.nameKey ? 'font-bold' : ''}`}>
            {t(item.nameKey).split(' ')[0]}
          </span>
        </button>
      ))}
    </nav>
  );
};

export default Sidebar;
