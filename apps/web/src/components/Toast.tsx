import { useEffect } from 'react';
import { useToast } from '../lib/toast.ts';

const DURATION_MS = 5000;

/** One toast at a time, above the tab bar, with an optional Undo. */
export function Toaster() {
  const { message, action, id, hide } = useToast();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, DURATION_MS);
    return () => clearTimeout(t);
  }, [message, id, hide]);

  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-4 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm shadow-lg"
      >
        <span>{message}</span>
        {action && (
          <button
            className="font-semibold text-accent"
            onClick={() => {
              action.run();
              hide();
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
