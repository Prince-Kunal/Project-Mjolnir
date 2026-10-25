import { useEffect } from 'react';
import { useToast } from '../lib/toast.ts';

const DURATION_MS = 5000;

/** One toast at a time, above the tab bar, with an optional Undo. It floats, so it casts a shadow. */
export function Toaster() {
  const { message, action, id, hide } = useToast();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, DURATION_MS);
    return () => clearTimeout(t);
  }, [message, id, hide]);

  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-8">
      <div
        key={id}
        role="status"
        className="mj-rise pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-5 rounded-full bg-text py-2.5 pr-2.5 pl-5 text-[15px] text-bg shadow-[0_10px_40px_rgba(0,0,0,.55)]"
      >
        <span className="min-w-0 truncate">{message}</span>
        {action ? (
          <button
            className="h-8 shrink-0 rounded-full bg-bg px-3.5 text-[14px] font-semibold text-text transition hover:bg-surface-2"
            onClick={() => {
              action.run();
              hide();
            }}
          >
            {action.label}
          </button>
        ) : (
          <span className="w-2.5" aria-hidden />
        )}
      </div>
    </div>
  );
}
