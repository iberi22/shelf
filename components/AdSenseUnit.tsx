import type React from 'react';
import { useEffect } from 'react';

declare global {
  interface Window {
    adsbygoogle: any;
  }
}

interface AdSenseUnitProps {
  adSlot: string;
  adClient: string;
  className?: string;
  style?: React.CSSProperties;
}

const AdSenseUnit: React.FC<AdSenseUnitProps> = ({ adSlot, adClient, className, style }) => {
  useEffect(() => {
    // Dynamically inject AdSense script if not already present
    if (adClient && adClient !== 'ca-pub-placeholder' && !document.querySelector(`script[src*="adsbygoogle.js?client=${adClient}"]`)) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('AdSense error:', e);
    }
  }, [adClient]);

  // In this environment, Vite's import.meta.env is not available at runtime.
  // We fall back to checking the hostname to determine if we are in a dev environment.
  const isDev = window.location.hostname === 'localhost';

  return (
    <div className={className} style={{ minHeight: '50px', ...style }}>
      {!isDev ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={adClient}
          data-ad-slot={adSlot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        ></ins>
      ) : (
        <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-xs text-[#F5F5DC]/50">
          [AdSense Dev Placeholder]
        </div>
      )}
    </div>
  );
};

export default AdSenseUnit;
