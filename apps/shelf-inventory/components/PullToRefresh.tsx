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

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Helper to find closest scrollable parent
    const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
      if (!node || node === document.body || node === document.documentElement) return null;
      if (node.scrollHeight > node.clientHeight) {
        const style = window.getComputedStyle(node);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          return node;
        }
      }
      return getScrollParent(node.parentElement);
    };

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const scrollParent = getScrollParent(target);
      
      // If inner scrollable element is not at top, ignore
      if (scrollParent && scrollParent.id !== 'main-scroll-area' && scrollParent.scrollTop > 0) {
        isPulling.current = false;
        return;
      }

      const main = document.getElementById('main-scroll-area');
      // Solo activamos pull-to-refresh si estamos en la parte superior del scroll
      if (!main || main.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      } else {
        isPulling.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshing) return;

      currentY.current = e.touches[0].clientY;
      const distance = currentY.current - startY.current;

      const main = document.getElementById('main-scroll-area');
      const isAtTop = !main || main.scrollTop <= 0;

      if (distance > 0 && isAtTop) {
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
          // Simply hide the spinner after a short delay instead of a hard reload
          // which was causing accidental disruption to the user's flow.
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          }, 800);
        }
      } else {
        // Reset if threshold not reached
        setPullDistance(0);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    // touchmove must not be passive so we can call preventDefault()
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
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
    <div ref={containerRef} className="relative w-full h-full flex flex-col flex-1 min-w-0">
      {/* Indicator */}
      <div
        className="absolute top-[-50px] left-0 right-0 flex justify-center items-center z-50 pointer-events-none"
        style={spinnerStyle}
      >
        <div
          className={`bg-[#1a1a1a] border border-yellow-400 p-2 rounded-full shadow-lg ${isRefreshing ? 'animate-spin' : ''}`}
        >
          <svg
            aria-hidden="true"
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
      <div style={containerStyle} className="w-full h-full flex flex-col flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
