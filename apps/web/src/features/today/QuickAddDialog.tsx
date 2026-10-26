import { useEffect } from 'react';
import { Sheet } from '../../components/Sheet.tsx';
import { useDay } from '../../lib/day.ts';
import { useQuickAdd } from '../../lib/quickAdd.store.ts';
import { QuickAdd } from './QuickAdd.tsx';

/** ⌘K / Ctrl+K anywhere (section 11), and the Add button in the top bar. */
export function QuickAddDialog() {
  const { open, setOpen } = useQuickAdd();
  const { data: day } = useDay();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useQuickAdd.getState().open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Quick add"
      description="A time makes a Google Calendar event; a day, or nothing, makes a task. !1 to !3 sets points; Schedule puts a block on your calendar only. Type # for tags."
    >
      {day && <QuickAdd stacked defaultDate={day.today} autoFocus onDone={() => setOpen(false)} />}
    </Sheet>
  );
}
