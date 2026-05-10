import type React from 'react';
import { NAV_ITEMS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
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

  return (
    <aside className="hidden md:flex flex-col w-64 bg-primary border-r border-foreground/20">
      <div className="p-6">
        <h1 className="text-2xl font-bold tracking-widest">[ Shelf. ]</h1>
      </div>
      <nav className="flex-1 px-4 py-2">
        <ul>
          {NAV_ITEMS.map((item) => (
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
      </div>
    </aside>
  );
};

export const MobileBottomNav: React.FC<{ activeComponent: string; setActiveComponent: (name: string) => void }> = ({
  activeComponent,
  setActiveComponent,
}) => {
  const { t } = useI18n();
  // Only show the main items on mobile for space
  const mobileNavItems = NAV_ITEMS.filter((item) =>
    ['nav.summary', 'nav.inventory', 'nav.sales', 'nav.settings'].includes(item.nameKey),
  );

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-primary border-t border-foreground/20 flex justify-around p-2 z-20">
      {mobileNavItems.map((item) => (
        <button
          key={item.nameKey}
          data-testid={`mobile-nav-item-${item.nameKey}`}
          onClick={() => setActiveComponent(item.nameKey)}
          className={`flex flex-col items-center gap-1 p-1 rounded-md text-xs w-16 transition-all duration-150 active:scale-90 ${
            activeComponent === item.nameKey ? 'text-foreground' : 'text-foreground/60'
          }`}
        >
          <span className="text-2xl">{item.icon}</span>
          <span className={activeComponent === item.nameKey ? 'font-bold' : ''}>{t(item.nameKey).split(' ')[0]}</span>
        </button>
      ))}
    </nav>
  );
};

export default Sidebar;
