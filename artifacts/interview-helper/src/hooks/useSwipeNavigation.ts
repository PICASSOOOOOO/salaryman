import { useEffect } from 'react';

interface Options {
  enabled: boolean;
}

const EDGE_ZONE = 28;
const MIN_DX = 70;
const MAX_DY = 60;
const MAX_DURATION = 600;

function isInsideScroller(target: EventTarget | null): boolean {
  let node: HTMLElement | null = target as HTMLElement | null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowX = style.overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth) {
      return true;
    }
    if (node.dataset && node.dataset.swipeNavIgnore === 'true') return true;
    node = node.parentElement;
  }
  return false;
}

export function useSwipeNavigation({ enabled }: Options) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;
    let fromLeftEdge = false;
    let fromRightEdge = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      const t = e.touches[0];
      const w = window.innerWidth;
      fromLeftEdge = t.clientX <= EDGE_ZONE;
      fromRightEdge = t.clientX >= w - EDGE_ZONE;
      if (!fromLeftEdge && !fromRightEdge) { tracking = false; return; }
      if (isInsideScroller(e.target)) { tracking = false; return; }
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      tracking = true;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      const dt = Date.now() - startT;
      if (dt > MAX_DURATION) return;
      if (dy > MAX_DY) return;
      if (fromLeftEdge && dx > MIN_DX) {
        window.history.back();
      } else if (fromRightEdge && dx < -MIN_DX) {
        window.history.forward();
      }
    };

    const onCancel = () => { tracking = false; };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled]);
}
