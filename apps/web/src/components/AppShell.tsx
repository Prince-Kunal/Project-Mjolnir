import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useForegroundRefresh, useItemsRealtime, useOfflineReplay } from '../lib/day.ts';
import { NAV } from '../lib/nav.ts';
import { useOfflineQueue } from '../lib/offlineTicks.ts';
import { refreshPush } from '../lib/push.ts';
import { useQuickAdd } from '../lib/quickAdd.store.ts';
import { useScrollTopOnNavigate, useSmoothScroll } from '../lib/smoothScroll.ts';
import { QuickAddDialog } from '../features/today/QuickAddDialog.tsx';
import { Effects } from './Effects.tsx';
import { HammerMark } from './Mark.tsx';
import { Toaster } from './Toast.tsx';

/**
 * No sidebar: a 52px top bar on the page ground over a centred 1152px column (true-black-flat).
 * The wordmark sits on the column's left edge and the Add pill ends on its right edge. On a phone
 * the five daily destinations move to a bottom tab bar.
 */
export function AppShell() {
  useItemsRealtime();
  useForegroundRefresh();
  useOfflineReplay();
  useSmoothScroll();
  useScrollTopOnNavigate();
  const waiting = useOfflineQueue((s) => s.waiting);
  const openQuickAdd = useQuickAdd((s) => s.setOpen);
  const [scrolled, setScrolled] = useState(false);

  // Browsers can rotate a push subscription; re-save it once per app start.
  useEffect(() => {
    refreshPush().catch(() => {});
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-svh">
      <header
        className={`sticky top-0 z-30 bg-bg/95 transition-[box-shadow] ${scrolled ? 'shadow-[0_1px_0_var(--color-rule)]' : ''}`}
      >
        <div className="mx-auto flex h-[52px] max-w-[1200px] items-center gap-6 px-4 md:px-6">
          <ThrowableMark />
          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.filter((n) => n.to !== '/more').map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-[15px] transition ${isActive ? 'text-text' : 'text-faint hover:text-muted'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 md:ml-0">
            <NavLink
              to="/more"
              className={({ isActive }) =>
                `hidden rounded-full px-3 py-1.5 text-[15px] transition md:block ${isActive ? 'text-text' : 'text-faint hover:text-muted'}`
              }
            >
              More
            </NavLink>
            <button
              onClick={() => openQuickAdd(true)}
              aria-label="Quick add"
              className="flex h-9 items-center gap-2 rounded-full bg-primary pr-4 pl-3 text-[15px] font-medium text-on-primary transition hover:bg-bone active:scale-[0.97]"
            >
              <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                <path
                  d="M8 2.5v11M2.5 8h11"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              Add
              <kbd className="hidden font-sans text-[12px] text-on-primary/55 lg:inline">⌘K</kbd>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pt-8 md:pb-16">
        {waiting > 0 && (
          <p
            role="status"
            className="mb-5 rounded-[var(--radius-inner)] bg-[#2a2213] px-4 py-2.5 text-[15px] text-[#f0c987]"
          >
            Offline: {waiting} tick{waiting === 1 ? '' : 's'} saved on this device, sent when you
            are back online.
          </p>
        )}
        <Outlet />
      </main>

      <nav
        aria-label="Tabs"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 bg-bg/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_var(--color-rule)] md:hidden"
      >
        {NAV.filter((n) => n.phone).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `flex h-14 flex-col items-center justify-center gap-1 text-[12px] transition ${isActive ? 'text-text' : 'text-faint'}`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`h-0.5 w-5 rounded-full transition ${isActive ? 'bg-text' : 'bg-transparent'}`}
                  aria-hidden
                />
                {n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <QuickAddDialog />
      <Toaster />
      <Effects />
    </div>
  );
}

/** The wordmark. Three quick clicks throw the hammer, and it comes back (it always does). */
function ThrowableMark() {
  const [throwing, setThrowing] = useState(false);
  const clicks = useRef<number[]>([]);
  return (
    <Link
      to="/"
      className="flex shrink-0 items-center gap-2 text-[19px] text-text"
      aria-label="Mjölnir, today"
      onClick={(e) => {
        const now = Date.now();
        clicks.current = [...clicks.current.filter((t) => now - t < 700), now];
        if (clicks.current.length >= 3 && !throwing) {
          e.preventDefault();
          clicks.current = [];
          setThrowing(true);
        }
      }}
    >
      <HammerMark
        className={`size-[22px] ${throwing ? 'mj-throw' : ''}`}
        onAnimationEnd={() => setThrowing(false)}
      />
      <span className="font-display tracking-[-0.01em]">Mjölnir</span>
    </Link>
  );
}
