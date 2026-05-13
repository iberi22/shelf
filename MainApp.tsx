import type React from 'react';
import { useState } from 'react';
import { DesktopAdColumn, MobileAdBars } from './components/Ads';
import Arqueo from './components/Arqueo';
import Clients from './components/Clients';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import PurchaseOrders from './components/PurchaseOrders';
import Reports from './components/Reports';
import Sales from './components/Sales';
import Settings from './components/Settings';
import Sidebar, { MobileBottomNav } from './components/Sidebar';
import Suppliers from './components/Suppliers';
import { useSubscription } from './context/SubscriptionContext';

interface MainAppProps {
  onLoginClick: () => void;
}

const MainApp: React.FC<MainAppProps> = ({ onLoginClick }) => {
  const [activeComponent, setActiveComponent] = useState('nav.summary');
  const { isFree } = useSubscription();
  const showAds = isFree; // No ads if pro/pyme (always true now)

  const renderComponent = () => {
    switch (activeComponent) {
      case 'nav.summary':
        return <Dashboard />;
      case 'nav.inventory':
        return <Inventory />;
      case 'nav.sales':
        return <Sales />;
      case 'nav.clients':
        return <Clients />;
      case 'nav.suppliers':
        return <Suppliers />;
      case 'nav.purchases':
        return <PurchaseOrders />;
      case 'nav.arqueo':
        return <Arqueo />;
      case 'nav.reports':
        return <Reports />;
      case 'nav.settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background text-foreground">
      {showAds && <DesktopAdColumn />}

      <div className={`flex flex-col flex-1 ${showAds ? 'md:ml-40' : ''}`}>
        {showAds && <MobileAdBars />}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            activeComponent={activeComponent}
            setActiveComponent={setActiveComponent}
            onLoginClick={onLoginClick}
          />
          <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto pb-20 md:pb-8">{renderComponent()}</main>
        </div>
        <MobileBottomNav activeComponent={activeComponent} setActiveComponent={setActiveComponent} />
      </div>
    </div>
  );
};

export default MainApp;
