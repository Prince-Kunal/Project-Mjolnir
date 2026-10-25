import { type RefObject, useEffect, useState } from 'react';

/**
 * Entrances for the parts of each section: `[data-reveal]` elements rise 24px and fade in, staggered
 * by `--d`, once, as they enter. Content is hidden only after this script runs, so a page whose
 * script fails still shows everything; reduced motion shows everything at once.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.add('reveal-ready');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute('data-shown', '');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px 8% 0px', threshold: 0 },
    );
    el.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root]);
}

/** Which `[data-chapter]` is in the middle of the screen: the sticky half shows its picture. */
export function useChapter(root: RefObject<HTMLElement | null>): number {
  const [chapter, setChapter] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setChapter(Number((e.target as HTMLElement).dataset.chapter));
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    el.querySelectorAll('[data-chapter]').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root]);
  return chapter;
}
