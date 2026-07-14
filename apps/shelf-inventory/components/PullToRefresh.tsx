import { p2pManager } from 'p2p-mesh-core';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface PullToRefreshProps {
  children: React.ReactNode;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({ children }) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);

  const MAX_PULL_DISTANCE = 100;
  const THRESHOLD = 70;

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshing) return;

      currentY.current = e.touches[0].clientY;
      const distance = currentY.current - startY.current;

      if (distance > 0 && window.scrollY === 0) {
        // Prevent default browser bounce when pulling down at the top
        if (e.cancelable) {
          e.preventDefault();
        }
        // Add resistance
        const dampenedDistance = Math.min(distance * 0.4, MAX_PULL_DISTANCE);
        setPullDistance(dampenedDistance);
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current || isRefreshing) return;
      isPulling.current = false;

      if (pullDistance > THRESHOLD) {
        setIsRefreshing(true);
        setPullDistance(THRESHOLD); // Hold at threshold while refreshing

        try {
          // Trigger P2P Sync aggressively
          if (p2pManager && typeof p2pManager.requestFullSync === 'function') {
            p2pManager.requestFullSync();
          }
        } catch (err) {
          console.warn('P2P sync failed during pull to refresh', err);
        } finally {
          // Hard reload to get new assets and state
          window.location.reload();
        }
      } else {
        // Reset if threshold not reached
        setPullDistance(0);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    // touchmove must not be passive so we can call preventDefault()
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, isRefreshing]);

  const spinnerStyle = {
    transform: `translateY(${pullDistance}px)`,
    opacity: pullDistance / THRESHOLD,
    transition: isPulling.current ? 'none' : 'transform 0.3s ease-out, opacity 0.3s ease-out',
  };

  const containerStyle = {
    transform: `translateY(${isRefreshing ? THRESHOLD : pullDistance}px)`,
    transition: isPulling.current ? 'none' : 'transform 0.3s ease-out',
  };

  return (
    <div className="relative w-full min-h-screen overflow-hidden">
      {/* Indicator */}
      <div
        className="absolute top-[-50px] left-0 right-0 flex justify-center items-center z-50 pointer-events-none"
        style={spinnerStyle}
      >
        <div
          className={`bg-[#1a1a1a] border border-yellow-400 p-2 rounded-full shadow-lg ${isRefreshing ? 'animate-spin' : ''}`}
        >
          <svg
            className="w-6 h-6 text-yellow-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div style={containerStyle} className="w-full h-full">
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
