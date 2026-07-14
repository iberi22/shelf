import type React from 'react';
import { useState } from 'react';
import { DesktopAdColumn, MobileAdBars } from './components/Ads';
import Arqueo from './components/Arqueo';
import Catalog from './components/Catalog';
import Clients from './components/Clients';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import P2PSyncStatusHeader from './components/P2PSyncStatusHeader';
import PullToRefresh from './components/PullToRefresh';
import PurchaseOrders from './components/PurchaseOrders';
import Reports from './components/Reports';
import Sales from './components/Sales';
import Settings from './components/Settings';
import Sidebar, { MobileBottomNav } from './components/Sidebar';
import Suppliers from './components/Suppliers';
import { useAppContext } from './context/AppContext';
import { useSubscription } from './context/SubscriptionContext';
import { useFeatureFlags } from './hooks/useFeatureFlags';

const AccessDenied = () => (
  <div className="flex flex-col items-center justify-center h-full text-center">
    <div className="text-6xl mb-4">🔒</div>
    <h2 className="text-2xl font-bold text-red-500 mb-2">Acceso Restringido</h2>
    <p className="text-foreground/70">No tienes permisos para ver esta sección.</p>
  </div>
);

const MainApp: React.FC = () => {
  const [activeComponent, setActiveComponent] = useState('nav.summary');
  const { isFree } = useSubscription();
  const { state, dispatch } = useAppContext();
  const { isEnabled } = useFeatureFlags();
  const showAds = isFree; // No ads if pro/pyme (always true now)

  if (state.isExpelled) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#121212]/95 backdrop-blur-md p-6 text-center text-[#F5F5DC]">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mb-6 animate-pulse">
          <span className="text-3xl text-red-500">🚫</span>
        </div>
        <h2 className="text-2xl font-bold text-red-500 mb-2">Conexión Cancelada / Expulsado</h2>
        <p className="text-[#F5F5DC]/70 max-w-md mb-6 leading-relaxed">
          Has sido expulsado o el host original ha revocado tus permisos para este nodo. Tus datos locales han sido
          desvinculados por seguridad.
        </p>
        <button
          onClick={() => {
            dispatch({ type: 'SET_EXPELLED', payload: false });
            window.location.reload();
          }}
          className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-[#1a1a1a] rounded-lg font-bold transition-all active:scale-95 shadow-lg shadow-yellow-500/10 cursor-pointer"
        >
          Entendido / Reconectar
        </button>
      </div>
    );
  }

  const canView = (permission?: boolean) => state.role === 'admin' || permission !== false;

  const renderComponent = () => {
    const p = state.permissions;
    switch (activeComponent) {
      case 'nav.summary':
        return canView(p?.canViewDashboard) ? <Dashboard /> : <AccessDenied />;
      case 'nav.inventory':
        return isEnabled('SRC-FUN-001') && canView(p?.canViewProducts) ? <Inventory /> : <AccessDenied />;
      case 'nav.sales':
        return isEnabled('SRC-FUN-002') && canView(p?.canViewSales) ? <Sales /> : <AccessDenied />;
      case 'nav.clients':
        return isEnabled('SRC-FUN-004') && canView(p?.canViewClients) ? <Clients /> : <AccessDenied />;
      case 'nav.suppliers':
        return isEnabled('SRC-FUN-004') && canView(p?.canViewSuppliers) ? <Suppliers /> : <AccessDenied />;
      case 'nav.purchases':
        return isEnabled('SRC-FUN-005') && canView(p?.canViewPurchaseOrders) ? <PurchaseOrders /> : <AccessDenied />;
      case 'nav.catalog':
        return <Catalog />;
      case 'nav.arqueo':
        return isEnabled('SRC-FUN-007') && canView(p?.canViewArqueo) ? <Arqueo /> : <AccessDenied />;
      case 'nav.reports':
        return isEnabled('SRC-FUN-012') && canView(p?.canViewReports) ? <Reports /> : <AccessDenied />;
      case 'nav.settings':
        return <Settings />;
      default:
        return canView(p?.canViewDashboard) ? <Dashboard /> : <AccessDenied />;
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background text-foreground">
      {showAds && <DesktopAdColumn />}

      <div className={`flex flex-col flex-1 ${showAds ? 'md:ml-40' : ''}`}>
        {showAds && <MobileAdBars />}
        <div className="flex flex-1 overflow-hidden relative">
          <Sidebar activeComponent={activeComponent} setActiveComponent={setActiveComponent} />
          {/* Add pt-16 on mobile to push content below the fixed hamburger menu */}
          <PullToRefresh>
            <main id="main-scroll-area" className="flex-1 min-w-0 p-4 pt-16 sm:p-6 md:p-8 overflow-y-auto pb-24 md:pb-8 h-full">
              <P2PSyncStatusHeader />
              {renderComponent()}
            </main>
          </PullToRefresh>
        </div>
        <MobileBottomNav activeComponent={activeComponent} setActiveComponent={setActiveComponent} />
      </div>
    </div>
  );
};

export default MainApp;
