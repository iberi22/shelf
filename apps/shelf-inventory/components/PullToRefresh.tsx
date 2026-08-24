import { p2pManager } from 'p2p-mesh-core';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface PullToRefreshProps {
  children: React.ReactNode;
}

const MAX_PULL_DISTANCE = 100;
const THRESHOLD = 70;

const PullToRefresh: React.FC<PullToRefreshProps> = ({ children }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Gesture state lives outside React: mutating it per touchmove frame must
    // not re-render the subtree, otherwise the whole content stutters.
    let startY = 0;
    let isPulling = false;
    let isRefreshingInternal = false;
    let pullDistance = 0;
    let rafId: number | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const applyTransform = (distance: number, animate: boolean) => {
      const content = contentRef.current;
      const spinner = spinnerRef.current;
      const transition = animate ? 'transform 0.3s ease-out' : 'none';
      if (content) {
        content.style.transition = transition;
        content.style.transform = `translateY(${distance}px)`;
      }
      if (spinner) {
        spinner.style.transition = animate ? 'transform 0.3s ease-out, opacity 0.3s ease-out' : 'none';
        spinner.style.transform = `translateY(${distance}px)`;
        spinner.style.opacity = `${Math.min(Math.max(distance / THRESHOLD, 0), 1)}`;
      }
    };

    const scheduleTransform = (distance: number) => {
      pullDistance = distance;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        applyTransform(pullDistance, false);
      });
    };

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
      if (isRefreshingInternal) return;
      const target = e.target as HTMLElement;
      const scrollParent = getScrollParent(target);

      // If inner scrollable element is not at top, ignore
      if (scrollParent && scrollParent.id !== 'main-scroll-area' && scrollParent.scrollTop > 0) {
        isPulling = false;
        return;
      }

      const main = document.getElementById('main-scroll-area');
      // Solo activamos pull-to-refresh si estamos en la parte superior del scroll
      if (!main || main.scrollTop <= 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
      } else {
        isPulling = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || isRefreshingInternal) return;

      const distance = e.touches[0].clientY - startY;
      const main = document.getElementById('main-scroll-area');
      const isAtTop = !main || main.scrollTop <= 0;

      if (distance > 0 && isAtTop) {
        // Prevent default browser bounce/reload when pulling down at the top
        if (e.cancelable) {
          e.preventDefault();
        }
        scheduleTransform(Math.min(distance * 0.4, MAX_PULL_DISTANCE));
      }
    };

    const handleTouchEnd = () => {
      if (!isPulling || isRefreshingInternal) return;
      isPulling = false;

      if (pullDistance > THRESHOLD) {
        isRefreshingInternal = true;
        setIsRefreshing(true);
        applyTransform(THRESHOLD, true);

        try {
          if (p2pManager && typeof p2pManager.requestFullSync === 'function') {
            p2pManager.requestFullSync();
          }
        } catch (err) {
          console.warn('P2P sync failed during pull to refresh', err);
        } finally {
          // Hide the spinner after a short delay instead of a hard reload
          resetTimer = setTimeout(() => {
            isRefreshingInternal = false;
            setIsRefreshing(false);
            pullDistance = 0;
            applyTransform(0, true);
          }, 800);
        }
      } else {
        pullDistance = 0;
        applyTransform(0, true);
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
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (resetTimer !== null) clearTimeout(resetTimer);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col flex-1 min-w-0">
      {/* Indicator */}
      <div
        ref={spinnerRef}
        className="absolute top-[-50px] left-0 right-0 flex justify-center items-center z-50 pointer-events-none"
        style={{ transform: 'translateY(0px)', opacity: 0 }}
      >
        <div
          className={`bg-surface-alt border border-yellow-400 p-2 rounded-full shadow-lg ${isRefreshing ? 'animate-spin' : ''}`}
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
      <div ref={contentRef} className="w-full h-full flex flex-col flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
