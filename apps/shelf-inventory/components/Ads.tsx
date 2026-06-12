import type React from 'react';
import AdSenseUnit from './AdSenseUnit'; // Import the new component

// For better security and management, we use environment variables.
const AD_CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-placeholder';
const DESKTOP_AD_SLOT_ID = import.meta.env.VITE_ADSENSE_DESKTOP_SLOT_ID || '0000000000';
const MOBILE_AD_SLOT_ID = import.meta.env.VITE_ADSENSE_MOBILE_SLOT_ID || '0000000000';

export const DesktopAdColumn: React.FC = () => {
  return (
    <aside className="hidden md:flex flex-col w-40 bg-[#0a0a0a] border-r border-[#F5F5DC]/20 fixed top-0 left-0 h-full p-2 z-10">
      <AdSenseUnit adClient={AD_CLIENT_ID} adSlot={DESKTOP_AD_SLOT_ID} style={{ width: '100%', height: '100%' }} />
    </aside>
  );
};

export const MobileAdBars: React.FC = () => {
  const AdBar: React.FC = () => (
    <div className="md:hidden flex items-center justify-center h-12 bg-[#0a0a0a] border-[#F5F5DC]/20 w-full shrink-0">
      <AdSenseUnit adClient={AD_CLIENT_ID} adSlot={MOBILE_AD_SLOT_ID} style={{ width: '100%', height: '100%' }} />
    </div>
  );

  return (
    <>
      <div className="order-first border-b">
        <AdBar />
      </div>
      <div className="order-last mt-auto border-t">
        <AdBar />
      </div>
    </>
  );
};
