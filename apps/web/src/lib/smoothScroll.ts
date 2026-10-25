// Lenis smooth scrolling for the document. Off under reduced motion; nested scrollers (dialogs, the
// calendar grid) keep their own scroll, and touch stays native so a thumb never feels lag.
import Lenis from 'lenis';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

let lenis: Lenis | null = null;

export function getLenis(): Lenis | null {
  return lenis;
}

export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Lenis measures with ResizeObserver; without it (old browsers, jsdom) scrolling stays native.
    if (typeof ResizeObserver === 'undefined') return;
    lenis = new Lenis({
      autoRaf: true,
      lerp: 0.12,
      smoothWheel: true,
      anchors: { offset: -72 },
      allowNestedScroll: true,
      prevent: (node) => Boolean(node.closest?.('[data-lenis-prevent], [role="dialog"]')),
    });
    return () => {
      lenis?.destroy();
      lenis = null;
    };
  }, []);
}

/** A new page starts at its top, as a reader expects. */
export function useScrollTopOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [pathname]);
}
