import { useEffect, useState } from 'react';
import { Sheet } from '../../components/Sheet.tsx';
import { useDay } from '../../lib/day.ts';
import { QuickAdd } from './QuickAdd.tsx';

/** ⌘K / Ctrl+K anywhere (section 11), and a + button on phones. */
export function QuickAddDialog() {
  const [open, setOpen] = useState(false);
  const { data: day } = useDay();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Quick add"
        className="fixed right-4 bottom-20 z-30 flex size-12 items-center justify-center rounded-full bg-accent text-bg shadow-lg md:hidden"
      >
        <svg viewBox="0 0 16 16" className="size-5" aria-hidden>
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Quick add"
        description="A time makes a Google Calendar event; a day, or nothing, makes a task. !1 to !3 sets points."
      >
        {day && <QuickAdd defaultDate={day.today} autoFocus onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}
